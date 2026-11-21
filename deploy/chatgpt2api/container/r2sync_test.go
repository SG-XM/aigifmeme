package main

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

type memStore struct {
	data    map[string][]byte
	failPut string
	calls   []string
}

func newMemStore() *memStore {
	return &memStore{data: map[string][]byte{}}
}

func (m *memStore) Get(key string) ([]byte, error) {
	m.calls = append(m.calls, "get:"+key)
	v, ok := m.data[key]
	if !ok {
		return nil, ErrMissing
	}
	return append([]byte(nil), v...), nil
}

func (m *memStore) Put(key string, body []byte) error {
	m.calls = append(m.calls, "put:"+key)
	if m.failPut != "" && strings.Contains(key, m.failPut) {
		return errors.New("injected put error")
	}
	m.data[key] = append([]byte(nil), body...)
	return nil
}

func (m *memStore) Delete(key string) error {
	m.calls = append(m.calls, "delete:"+key)
	delete(m.data, key)
	return nil
}

func TestInitialPrepareSeedsAndCommitsManifest(t *testing.T) {
	dir := t.TempDir()
	store := newMemStore()
	tracker := &DBTracker{}

	if err := PrepareState(dir, store, "state", "https://api.aigifmeme.com", tracker, func(s string) { t.Log(s) }); err != nil {
		t.Fatalf("PrepareState failed: %v", err)
	}
	if _, ok := store.data["state/_manifest.json"]; !ok {
		t.Fatal("expected state/_manifest.json to exist")
	}
	if _, ok := store.data["state/config.yaml"]; !ok {
		t.Fatal("expected state/config.yaml to exist")
	}
	cfg := string(store.data["state/config.yaml"])
	if !strings.Contains(cfg, "https://api.aigifmeme.com") {
		t.Fatalf("expected seeded base_url, got:\n%s", cfg)
	}
}

func TestLegacyV1ManifestInitializesFreshV2(t *testing.T) {
	dir := t.TempDir()
	store := newMemStore()
	store.data["state/config.json"] = []byte(`{"auth-key":"x"}`)
	store.data["state/data/accounts.json"] = []byte(`[]`)
	store.data["state/_manifest.json"] = []byte(`{"state/config.json":"abc","state/data/accounts.json":"def"}`)

	tracker := &DBTracker{}
	if err := PrepareState(dir, store, "state", "https://api.aigifmeme.com", tracker, func(s string) { t.Log(s) }); err != nil {
		t.Fatalf("PrepareState failed: %v", err)
	}
	if _, ok := store.data["state/config.yaml"]; !ok {
		t.Fatal("expected fresh state/config.yaml")
	}
	if _, ok := store.data["state/config.json"]; ok {
		t.Fatal("expected legacy state/config.json to be cleaned up after v2 manifest commit")
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("expected legacy config.json not restored locally")
	}
}

func TestSyncUpUploadFailureDoesNotCommitManifest(t *testing.T) {
	dir := t.TempDir()
	store := newMemStore()
	tracker := &DBTracker{}

	if err := PrepareState(dir, store, "state", "", tracker, func(s string) { t.Log(s) }); err != nil {
		t.Fatalf("PrepareState failed: %v", err)
	}
	oldManifest := append([]byte(nil), store.data["state/_manifest.json"]...)

	imgDir := filepath.Join(dir, "data", "images")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(imgDir, "a.png"), []byte("pngbytes"), 0644); err != nil {
		t.Fatal(err)
	}
	store.failPut = "a.png"
	if _, err := SyncUp(dir, store, "state", tracker, false, func(s string) { t.Log(s) }); err == nil {
		t.Fatal("expected SyncUp to fail when object upload fails")
	}
	if string(store.data["state/_manifest.json"]) != string(oldManifest) {
		t.Fatal("manifest should not have changed after failed object upload")
	}
}

func TestSyncDownPrefersLiveObjectOnDigestMismatchAndMissing(t *testing.T) {
	dir := t.TempDir()
	store := newMemStore()
	liveCfg := []byte("base_url: https://api.aigifmeme.com\n")
	store.data["state/config.yaml"] = liveCfg
	store.data["state/_manifest.json"] = []byte(`{"state/config.yaml":"deadbeef","state/data/missing.png":"0000"}`)

	var logs []string
	count, err := SyncDown(dir, store, "state", func(s string) { logs = append(logs, s) })
	if err != nil {
		t.Fatalf("expected SyncDown to prefer live object instead of failing, got: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 restored file, got %d", count)
	}
	got, err := os.ReadFile(filepath.Join(dir, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(liveCfg) {
		t.Fatalf("expected live object bytes, got %q", string(got))
	}
	joined := strings.Join(logs, "\n")
	if !strings.Contains(joined, "hash mismatch") || !strings.Contains(joined, "missing") {
		t.Fatalf("expected mismatch and missing warnings, got:\n%s", joined)
	}
}

func TestSQLiteWALSnapshotAndRestore(t *testing.T) {
	dir1 := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir1, "data"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := SeedConfig(filepath.Join(dir1, "config.yaml"), "https://api.aigifmeme.com"); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(dir1, "data", "chatgpt2api.db")
	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO items (name) VALUES ('wal-row-1'), ('wal-row-2');`); err != nil {
		t.Fatal(err)
	}
	// Keep DB open so WAL file holds uncommitted-to-main-db frames
	store := newMemStore()
	tracker := &DBTracker{}
	if _, err := SyncUp(dir1, store, "state", tracker, false, func(s string) { t.Log(s) }); err != nil {
		t.Fatalf("SyncUp failed: %v", err)
	}
	_ = db.Close()

	if _, ok := store.data["state/data/chatgpt2api.db"]; !ok {
		t.Fatal("expected state/data/chatgpt2api.db in store")
	}
	if _, ok := store.data["state/data/chatgpt2api.db-wal"]; ok {
		t.Fatal("did not expect raw -wal in store")
	}

	dir2 := t.TempDir()
	if err := PrepareState(dir2, store, "state", "", &DBTracker{}, func(s string) { t.Log(s) }); err != nil {
		t.Fatalf("PrepareState restore failed: %v", err)
	}
	db2, err := sql.Open("sqlite", filepath.Join(dir2, "data", "chatgpt2api.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()
	var count int
	if err := db2.QueryRow(`SELECT COUNT(*) FROM items`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected 2 rows in restored DB, got %d", count)
	}
}
