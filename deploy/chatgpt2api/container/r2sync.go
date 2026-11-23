package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
	_ "modernc.org/sqlite"
)

const (
	MaxObjectBytes = 64 * 1024 * 1024
	ManifestName   = "_manifest.json"
	DBRelPath      = "data/chatgpt2api.db"
)

var (
	ErrMissing  = errors.New("missing object")
	skipDirs    = map[string]bool{"git_cache": true, "__pycache__": true, ".git": true}
	skipDBAux   = map[string]bool{"chatgpt2api.db-wal": true, "chatgpt2api.db-shm": true, "chatgpt2api.db-journal": true}
)

type ObjectStore interface {
	Get(key string) ([]byte, error)
	Put(key string, body []byte) error
	Delete(key string) error
}

type BridgeClient struct {
	baseURL string
	secret  string
	client  *http.Client
}

func NewBridgeClient(baseURL, secret string, client *http.Client) (*BridgeClient, error) {
	u, err := url.Parse(baseURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, errors.New("bridge url is invalid")
	}
	if secret != "" && strings.Contains(baseURL, secret) {
		return nil, errors.New("bridge url contains the secret")
	}
	if len(strings.TrimSpace(secret)) < 32 {
		return nil, errors.New("bridge secret is too short")
	}
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &BridgeClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		secret:  secret,
		client:  client,
	}, nil
}

func (b *BridgeClient) call(method, reqPath string, body []byte) ([]byte, error) {
	var bodyReader io.Reader
	if method != http.MethodGet && body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, b.baseURL+reqPath, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+b.secret)
	resp, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrMissing
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, errors.New("bridge rejected authentication")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("bridge %s status=%d", method, resp.StatusCode)
	}
	return data, nil
}

func (b *BridgeClient) Get(key string) ([]byte, error) {
	if strings.HasSuffix(key, "/"+ManifestName) {
		return b.call(http.MethodGet, "/v1/manifest", nil)
	}
	return b.call(http.MethodGet, "/v1/object?key="+url.QueryEscape(key), nil)
}

func (b *BridgeClient) Put(key string, body []byte) error {
	if strings.HasSuffix(key, "/"+ManifestName) {
		_, err := b.call(http.MethodPut, "/v1/manifest", body)
		return err
	}
	_, err := b.call(http.MethodPut, "/v1/object?key="+url.QueryEscape(key), body)
	return err
}

func (b *BridgeClient) Delete(key string) error {
	_, err := b.call(http.MethodDelete, "/v1/object?key="+url.QueryEscape(key), nil)
	return err
}

func sha256Hex(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func safeRelative(rel string) bool {
	if rel == "" || rel == "." || rel == ".." {
		return false
	}
	clean := strings.ReplaceAll(rel, "\\", "/")
	if strings.HasPrefix(clean, "/") || strings.HasPrefix(clean, "../") || strings.Contains("/"+clean, "/../") {
		return false
	}
	return !strings.Contains(rel, "\\")
}

func objectKey(prefix, rel string) (string, error) {
	clean := strings.TrimLeft(strings.ReplaceAll(rel, "\\", "/"), "/")
	if !safeRelative(clean) {
		return "", errors.New("unsafe object path")
	}
	base := strings.Trim(prefix, "/")
	if base == "" {
		return clean, nil
	}
	return base + "/" + clean, nil
}

func manifestKey(prefix string) string {
	k, _ := objectKey(prefix, ManifestName)
	return k
}

func loadManifest(store ObjectStore, prefix string) (map[string]string, error) {
	raw, err := store.Get(manifestKey(prefix))
	if errors.Is(err, ErrMissing) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("manifest is not valid json: %w", err)
	}
	if m == nil {
		return nil, errors.New("manifest is not an object")
	}
	return m, nil
}

type DBTracker struct {
	mu           sync.Mutex
	lastDBSize   int64
	lastDBMTime  int64
	lastWALSize  int64
	lastWALMTime int64
	lastBytes    []byte
	lastDigest   string
}

func (t *DBTracker) Snapshot(dbPath string, force bool) ([]byte, string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	dbInfo, err := os.Stat(dbPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, "", nil
		}
		return nil, "", err
	}
	if dbInfo.Size() == 0 {
		return nil, "", nil
	}

	var walSize, walMTime int64
	if walInfo, err := os.Stat(dbPath + "-wal"); err == nil {
		walSize = walInfo.Size()
		walMTime = walInfo.ModTime().UnixNano()
	}
	dbSize := dbInfo.Size()
	dbMTime := dbInfo.ModTime().UnixNano()

	if !force && t.lastBytes != nil &&
		dbSize == t.lastDBSize && dbMTime == t.lastDBMTime &&
		walSize == t.lastWALSize && walMTime == t.lastWALMTime {
		return t.lastBytes, t.lastDigest, nil
	}

	snapPath := filepath.Join(os.TempDir(), fmt.Sprintf("chatgpt2api-snap-%d.db", os.Getpid()))
	_ = os.Remove(snapPath)
	defer os.Remove(snapPath)

	dsn := dbPath + "?_pragma=busy_timeout(10000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, "", err
	}
	_, execErr := db.Exec("VACUUM INTO ?", snapPath)
	closeErr := db.Close()
	if execErr != nil {
		return nil, "", fmt.Errorf("sqlite vacuum into failed: %w", execErr)
	}
	if closeErr != nil {
		return nil, "", closeErr
	}

	snapBytes, err := os.ReadFile(snapPath)
	if err != nil {
		return nil, "", err
	}
	digest := sha256Hex(snapBytes)
	t.lastDBSize = dbSize
	t.lastDBMTime = dbMTime
	t.lastWALSize = walSize
	t.lastWALMTime = walMTime
	t.lastBytes = snapBytes
	t.lastDigest = digest
	return snapBytes, digest, nil
}

func collectLocalFiles(appDir, prefix string, tracker *DBTracker, forceDB bool) (map[string][]byte, map[string]string, int, error) {
	files := make(map[string][]byte)
	digests := make(map[string]string)
	skipped := 0

	cfgPath := filepath.Join(appDir, "config.yaml")
	if info, err := os.Stat(cfgPath); err == nil && info.Mode().IsRegular() {
		if info.Size() <= MaxObjectBytes {
			body, err := os.ReadFile(cfgPath)
			if err != nil {
				return nil, nil, skipped, err
			}
			key, _ := objectKey(prefix, "config.yaml")
			files[key] = body
			digests[key] = sha256Hex(body)
		} else {
			skipped++
		}
	}

	dbPath := filepath.Join(appDir, filepath.FromSlash(DBRelPath))
	if tracker == nil {
		tracker = &DBTracker{}
	}
	dbBytes, dbDigest, err := tracker.Snapshot(dbPath, forceDB)
	if err != nil {
		return nil, nil, skipped, err
	}
	if len(dbBytes) > 0 {
		if len(dbBytes) <= MaxObjectBytes {
			key, _ := objectKey(prefix, DBRelPath)
			files[key] = dbBytes
			digests[key] = dbDigest
		} else {
			skipped++
		}
	}

	dataDir := filepath.Join(appDir, "data")
	if info, err := os.Stat(dataDir); err == nil && info.IsDir() {
		err = filepath.WalkDir(dataDir, func(p string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			name := d.Name()
			if d.IsDir() {
				if skipDirs[name] {
					return filepath.SkipDir
				}
				return nil
			}
			if !d.Type().IsRegular() {
				return nil
			}
			if strings.HasSuffix(name, ".tmp") || strings.HasSuffix(name, ".swp") || strings.HasSuffix(name, ".partial") {
				return nil
			}
			if name == "chatgpt2api.db" || skipDBAux[name] {
				return nil
			}
			relFromData, err := filepath.Rel(dataDir, p)
			if err != nil {
				return err
			}
			rel := path.Join("data", filepath.ToSlash(relFromData))
			fInfo, err := d.Info()
			if err != nil {
				return err
			}
			if fInfo.Size() > MaxObjectBytes {
				skipped++
				return nil
			}
			body, err := os.ReadFile(p)
			if err != nil {
				return err
			}
			if int64(len(body)) != fInfo.Size() {
				skipped++
				return nil
			}
			key, err := objectKey(prefix, rel)
			if err != nil {
				return err
			}
			files[key] = body
			digests[key] = sha256Hex(body)
			return nil
		})
		if err != nil {
			return nil, nil, skipped, err
		}
	}

	return files, digests, skipped, nil
}

type SyncResult struct {
	Uploaded int
	Deleted  int
	Skipped  int
}

func SyncUp(appDir string, store ObjectStore, prefix string, tracker *DBTracker, forceDB bool, logFn func(string)) (SyncResult, error) {
	if logFn == nil {
		logFn = func(string) {}
	}
	previous, err := loadManifest(store, prefix)
	if err != nil {
		return SyncResult{}, err
	}
	if previous == nil {
		previous = map[string]string{}
	}
	files, current, skipped, err := collectLocalFiles(appDir, prefix, tracker, forceDB)
	if err != nil {
		return SyncResult{}, err
	}

	uploaded := 0
	for key, body := range files {
		if previous[key] == current[key] {
			continue
		}
		if err := store.Put(key, body); err != nil {
			return SyncResult{}, fmt.Errorf("upload %s failed: %w", key, err)
		}
		uploaded++
	}

	encoded, err := json.Marshal(current)
	if err != nil {
		return SyncResult{}, err
	}
	prevEncoded, err := json.Marshal(previous)
	if err != nil {
		return SyncResult{}, err
	}
	if !bytes.Equal(encoded, prevEncoded) || uploaded > 0 {
		if err := store.Put(manifestKey(prefix), encoded); err != nil {
			return SyncResult{}, fmt.Errorf("commit manifest failed: %w", err)
		}
	}

	deleted := 0
	mKey := manifestKey(prefix)
	for key := range previous {
		if _, ok := current[key]; !ok && key != mKey {
			if err := store.Delete(key); err != nil {
				logFn(fmt.Sprintf("delete failed after manifest commit key=%s err=%v", key, err))
			} else {
				deleted++
			}
		}
	}
	logFn(fmt.Sprintf("sync up uploaded=%d deleted=%d skipped=%d", uploaded, deleted, skipped))
	return SyncResult{Uploaded: uploaded, Deleted: deleted, Skipped: skipped}, nil
}

func isV2Manifest(manifest map[string]string, prefix string) bool {
	cfgKey, _ := objectKey(prefix, "config.yaml")
	dbKey, _ := objectKey(prefix, DBRelPath)
	_, hasCfg := manifest[cfgKey]
	_, hasDB := manifest[dbKey]
	return hasCfg || hasDB
}

func SyncDown(appDir string, store ObjectStore, prefix string, logFn func(string)) (int, error) {
	if logFn == nil {
		logFn = func(string) {}
	}
	manifest, err := loadManifest(store, prefix)
	if err != nil {
		return 0, err
	}
	if manifest == nil {
		return 0, nil
	}
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return 0, err
	}
	for aux := range skipDBAux {
		_ = os.Remove(filepath.Join(appDir, "data", aux))
	}

	base := strings.Trim(prefix, "/") + "/"
	count := 0
	for key, digest := range manifest {
		if !strings.HasPrefix(key, base) {
			return count, errors.New("manifest key is outside the snapshot")
		}
		rel := key[len(base):]
		if !safeRelative(rel) {
			return count, errors.New("manifest key has unsafe relative path")
		}
		body, err := store.Get(key)
		if errors.Is(err, ErrMissing) {
			logFn(fmt.Sprintf("warning: snapshot object missing key=%s; skipping", key))
			continue
		}
		if err != nil {
			return count, err
		}
		actual := sha256Hex(body)
		if actual != digest {
			logFn(fmt.Sprintf("warning: snapshot hash mismatch key=%s manifest=%s actual=%s; preferring live object", key, digest, actual))
		}
		target := filepath.Join(appDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return count, err
		}
		tmp := target + ".partial"
		if err := os.WriteFile(tmp, body, 0644); err != nil {
			return count, err
		}
		if err := os.Rename(tmp, target); err != nil {
			_ = os.Remove(tmp)
			return count, err
		}
		count++
	}
	return count, nil
}

func SeedConfig(configPath string, baseURL string) error {
	raw := map[string]any{}
	if data, err := os.ReadFile(configPath); err == nil && len(data) > 0 {
		if err := yaml.Unmarshal(data, &raw); err != nil {
			raw = map[string]any{}
		}
		if raw == nil {
			raw = map[string]any{}
		}
	}
	raw["api-key"] = ""
	if baseURL != "" {
		if existing, _ := raw["base_url"].(string); strings.TrimSpace(existing) == "" {
			raw["base_url"] = baseURL
		}
	}
	runtime, _ := raw["proxy_runtime"].(map[string]any)
	if runtime == nil {
		runtime = map[string]any{}
	}
	runtime["enabled"] = false
	clearance, _ := runtime["clearance"].(map[string]any)
	if clearance == nil {
		clearance = map[string]any{}
	}
	clearance["cf_cookies"] = ""
	clearance["cf_clearance"] = ""
	runtime["clearance"] = clearance
	raw["proxy_runtime"] = runtime

	out, err := yaml.Marshal(raw)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(configPath, out, 0600)
}

func PrepareState(appDir string, store ObjectStore, prefix string, baseURL string, tracker *DBTracker, logFn func(string)) error {
	if logFn == nil {
		logFn = func(string) {}
	}
	cfgPath := filepath.Join(appDir, "config.yaml")
	dataDir := filepath.Join(appDir, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return err
	}
	manifest, err := loadManifest(store, prefix)
	if err != nil {
		return err
	}
	if manifest == nil || !isV2Manifest(manifest, prefix) {
		if manifest != nil {
			logFn("detected legacy non-v2 manifest; initializing fresh v2.0.0 state")
		}
		if err := SeedConfig(cfgPath, baseURL); err != nil {
			return err
		}
		_, err := SyncUp(appDir, store, prefix, tracker, true, logFn)
		return err
	}
	if _, err := SyncDown(appDir, store, prefix, logFn); err != nil {
		return err
	}
	if _, err := os.Stat(cfgPath); errors.Is(err, os.ErrNotExist) {
		if err := SeedConfig(cfgPath, baseURL); err != nil {
			return err
		}
	}
	return nil
}
