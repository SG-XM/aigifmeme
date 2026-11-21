package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/go-containerregistry/pkg/authn"
	"github.com/google/go-containerregistry/pkg/name"
	v1 "github.com/google/go-containerregistry/pkg/v1"
	"github.com/google/go-containerregistry/pkg/v1/mutate"
	"github.com/google/go-containerregistry/pkg/v1/remote"
	"github.com/google/go-containerregistry/pkg/v1/tarball"
)

type cfCredsResp struct {
	Success bool `json:"success"`
	Result  struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"result"`
	Errors []any `json:"errors"`
}

func fetchCFRegistryCreds(accountID, token, host string) (string, string, error) {
	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/containers/registries/%s/credentials", accountID, host)
	payload := []byte(`{"expiration_minutes":15,"permissions":["pull","push"]}`)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("cloudflare registry credentials status=%d", resp.StatusCode)
	}
	var parsed cfCredsResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", "", err
	}
	if !parsed.Success || parsed.Result.Username == "" || parsed.Result.Password == "" {
		return "", "", fmt.Errorf("cloudflare registry credentials missing in response")
	}
	return parsed.Result.Username, parsed.Result.Password, nil
}

func buildTarLayer(files map[string]struct {
	data []byte
	mode int64
}) (v1.Layer, error) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	now := time.Unix(1700000000, 0).UTC()

	// Create parent dirs
	for _, dir := range []string{"opt/", "opt/cf-wrapper/"} {
		if err := tw.WriteHeader(&tar.Header{
			Name:     dir,
			Mode:     0755,
			Typeflag: tar.TypeDir,
			ModTime:  now,
		}); err != nil {
			return nil, err
		}
	}

	for name, spec := range files {
		clean := strings.TrimPrefix(name, "/")
		if err := tw.WriteHeader(&tar.Header{
			Name:     clean,
			Size:     int64(len(spec.data)),
			Mode:     spec.mode,
			Typeflag: tar.TypeReg,
			ModTime:  now,
		}); err != nil {
			return nil, err
		}
		if _, err := tw.Write(spec.data); err != nil {
			return nil, err
		}
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gw.Close(); err != nil {
		return nil, err
	}
	raw := buf.Bytes()
	return tarball.LayerFromOpener(func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(raw)), nil
	})
}

func main() {
	baseRefStr := flag.String("base", "", "Base image reference (digest-pinned)")
	targetRefStr := flag.String("target", "", "Target image reference (with tag)")
	accountID := flag.String("account", "29a44cf6b1d2c5d00f51960def5bb48d", "Cloudflare account ID")
	rootDir := flag.String("root", ".", "deploy/chatgpt2api root directory")
	flag.Parse()

	if *baseRefStr == "" || *targetRefStr == "" {
		fmt.Fprintln(os.Stderr, "--base and --target are required")
		os.Exit(2)
	}
	cfToken := strings.TrimSpace(os.Getenv("CLOUDFLARE_API_TOKEN"))
	if cfToken == "" {
		fmt.Fprintln(os.Stderr, "CLOUDFLARE_API_TOKEN is required")
		os.Exit(2)
	}

	absRoot, err := filepath.Abs(*rootDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "resolve root: %v\n", err)
		os.Exit(1)
	}

	tmpBin := filepath.Join(os.TempDir(), fmt.Sprintf("cf-wrapper-entrypoint-%d", os.Getpid()))
	defer os.Remove(tmpBin)

	buildCmd := exec.Command("go", "build", "-ldflags=-s -w", "-o", tmpBin, ".")
	buildCmd.Dir = filepath.Join(absRoot, "container")
	buildCmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux", "GOARCH=amd64")
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "build container wrapper: %v\n", err)
		os.Exit(1)
	}

	binBytes, err := os.ReadFile(tmpBin)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read built entrypoint: %v\n", err)
		os.Exit(1)
	}
	licBytes, err := os.ReadFile(filepath.Join(absRoot, "UPSTREAM_LICENSE"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "read UPSTREAM_LICENSE: %v\n", err)
		os.Exit(1)
	}

	baseRef, err := name.ParseReference(*baseRefStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse base ref: %v\n", err)
		os.Exit(1)
	}
	baseImg, err := remote.Image(baseRef, remote.WithPlatform(v1.Platform{OS: "linux", Architecture: "amd64"}))
	if err != nil {
		fmt.Fprintf(os.Stderr, "pull base image: %v\n", err)
		os.Exit(1)
	}

	layer, err := buildTarLayer(map[string]struct {
		data []byte
		mode int64
	}{
		"/opt/cf-wrapper/entrypoint":       {data: binBytes, mode: 0755},
		"/opt/cf-wrapper/UPSTREAM_LICENSE": {data: licBytes, mode: 0644},
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "build wrapper layer: %v\n", err)
		os.Exit(1)
	}

	img, err := mutate.AppendLayers(baseImg, layer)
	if err != nil {
		fmt.Fprintf(os.Stderr, "append layer: %v\n", err)
		os.Exit(1)
	}
	cfgFile, err := img.ConfigFile()
	if err != nil {
		fmt.Fprintf(os.Stderr, "read config file: %v\n", err)
		os.Exit(1)
	}
	cfgFile = cfgFile.DeepCopy()
	cfgFile.Config.Entrypoint = []string{"/opt/cf-wrapper/entrypoint"}
	cfgFile.Config.Cmd = nil
	cfgFile.Config.WorkingDir = "/app"
	hasPort := false
	for _, e := range cfgFile.Config.Env {
		if strings.HasPrefix(e, "PORT=") {
			hasPort = true
			break
		}
	}
	if !hasPort {
		cfgFile.Config.Env = append(cfgFile.Config.Env, "PORT=80")
	}
	img, err = mutate.ConfigFile(img, cfgFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "mutate config file: %v\n", err)
		os.Exit(1)
	}

	targetRef, err := name.ParseReference(*targetRefStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse target ref: %v\n", err)
		os.Exit(1)
	}
	regHost := targetRef.Context().RegistryStr()
	user, pass, err := fetchCFRegistryCreds(*accountID, cfToken, regHost)
	if err != nil {
		fmt.Fprintf(os.Stderr, "fetch registry creds: %v\n", err)
		os.Exit(1)
	}

	auth := authn.FromConfig(authn.AuthConfig{Username: user, Password: pass})
	if err := remote.Write(targetRef, img, remote.WithAuth(auth)); err != nil {
		fmt.Fprintf(os.Stderr, "push image: %v\n", err)
		os.Exit(1)
	}

	digest, err := img.Digest()
	if err != nil {
		fmt.Fprintf(os.Stderr, "compute digest: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("%s@%s\n", targetRef.Context().Name(), digest.String())
}
