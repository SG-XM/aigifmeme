package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const defaultPrefix = "state"

func logMsg(msg string) {
	fmt.Fprintln(os.Stderr, msg)
}

func main() {
	os.Exit(run())
}

func run() int {
	secret := strings.TrimSpace(os.Getenv("STATE_BRIDGE_SECRET"))
	authKey := strings.TrimSpace(os.Getenv("CHATGPT2API_AUTH_KEY"))
	if len(secret) < 32 || len(authKey) < 32 {
		logMsg("missing STATE_BRIDGE_SECRET or CHATGPT2API_AUTH_KEY")
		return 2
	}
	bridgeURL := strings.TrimSpace(os.Getenv("STATE_BRIDGE_URL"))
	if bridgeURL == "" {
		bridgeURL = "http://state-bridge.internal"
	}
	store, err := NewBridgeClient(bridgeURL, secret, nil)
	if err != nil {
		logMsg(fmt.Sprintf("invalid state bridge client: %v", err))
		return 2
	}
	appDir := strings.TrimSpace(os.Getenv("CHATGPT2API_APP_DIR"))
	if appDir == "" {
		appDir = "/app"
	}
	baseURL := strings.TrimSpace(os.Getenv("CHATGPT2API_BASE_URL"))
	intervalSec := 15
	if raw := strings.TrimSpace(os.Getenv("STATE_SYNC_INTERVAL_SECONDS")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			intervalSec = parsed
		}
	}

	tracker := &DBTracker{}
	if err := PrepareState(appDir, store, defaultPrefix, baseURL, tracker, logMsg); err != nil {
		logMsg(fmt.Sprintf("state restore failed; not starting: %v", err))
		return 3
	}

	binPath := filepath.Join(appDir, "chatgpt2api")
	cmd := exec.Command(binPath)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		logMsg(fmt.Sprintf("failed to start chatgpt2api: %v", err))
		return 4
	}

	var syncMu sync.Mutex
	flush := func(forceDB bool) bool {
		syncMu.Lock()
		defer syncMu.Unlock()
		if _, err := SyncUp(appDir, store, defaultPrefix, tracker, forceDB, logMsg); err != nil {
			logMsg(fmt.Sprintf("state flush failed; last successful snapshot kept: %v", err))
			return false
		}
		return true
	}

	sigCh := make(chan os.Signal, 2)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	doneCh := make(chan error, 1)
	go func() {
		doneCh <- cmd.Wait()
	}()

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case err := <-doneCh:
			ok := flush(true)
			if !ok {
				return 1
			}
			if err != nil {
				if exitErr, ok := err.(*exec.ExitError); ok {
					return exitErr.ExitCode()
				}
				return 1
			}
			return 0
		case <-ticker.C:
			flush(false)
		case sig := <-sigCh:
			logMsg(fmt.Sprintf("received signal %v; stopping chatgpt2api", sig))
			if cmd.Process != nil {
				_ = cmd.Process.Signal(syscall.SIGTERM)
			}
			select {
			case <-doneCh:
			case <-time.After(8 * time.Second):
				logMsg("chatgpt2api did not exit in 8s; killing")
				if cmd.Process != nil {
					_ = cmd.Process.Kill()
				}
				<-doneCh
			}
			if !flush(true) {
				return 1
			}
			return 0
		}
	}
}
