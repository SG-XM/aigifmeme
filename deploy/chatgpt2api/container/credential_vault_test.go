package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseCredentialLinesFormatsAndSeparators(t *testing.T) {
	input := strings.Join([]string{
		"\uFEFF# comment line",
		"=== header ===",
		"",
		// Format 1: 4-dash
		"alice@example.com----pA#1&2*3----ABCDEF234567TEST",
		// Format 1: 3-dash
		"bob@example.com---pass---XYZ234ABCDE99999",
		// Format 2: 4-field webmail URL (4-dash)
		"yarrow.89.commons@icloud.com----@8PL3X4nXpXTmeN%----T7MXFNYRY5JZZYL2NNGGRLV6KTO3CQYX----https://mail.bsf94666.store/m/YM-1234",
		// Format 3: 4-field access token (3-dash) + 5th field refresh token
		"carol@example.com---p@55---JBSWY3DPEHPK3PXP---eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE4MDAwMDAwMDB9.sig---rt_12345",
		// Duplicate email (case-insensitive)
		"ALICE@example.com----otherpass----OTHERSECRET",
	}, "\r\n")

	res, err := ParseCredentialLines(input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Errors) != 0 {
		t.Fatalf("expected 0 errors, got %+v", res.Errors)
	}
	if res.Duplicates != 1 {
		t.Fatalf("expected 1 duplicate, got %d", res.Duplicates)
	}
	if len(res.Accounts) != 4 {
		t.Fatalf("expected 4 accounts, got %d", len(res.Accounts))
	}

	if res.Accounts[0].Email != "alice@example.com" || res.Accounts[0].Password != "pA#1&2*3" || res.Accounts[0].Auxiliary != "ABCDEF234567TEST" {
		t.Fatalf("unexpected account 0: %+v", res.Accounts[0])
	}
	if res.Accounts[1].Email != "bob@example.com" || res.Accounts[1].Password != "pass" || res.Accounts[1].Auxiliary != "XYZ234ABCDE99999" {
		t.Fatalf("unexpected account 1: %+v", res.Accounts[1])
	}
	if res.Accounts[2].MailURL != "https://mail.bsf94666.store/m/YM-1234" || res.Accounts[2].AccessToken != "" {
		t.Fatalf("expected Format 2 MailURL, got %+v", res.Accounts[2])
	}
	if res.Accounts[3].AccessToken != "eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE4MDAwMDAwMDB9.sig" || res.Accounts[3].RefreshToken != "rt_12345" || res.Accounts[3].MailURL != "" {
		t.Fatalf("expected Format 3 AccessToken+RefreshToken, got %+v", res.Accounts[3])
	}
}

func TestParseCredentialLinesValidation(t *testing.T) {
	bad := strings.Join([]string{
		"notanemail----pass----SECRET",
		"user@example.com----onlytwo",
		"user2@example.com----   ----SECRET",
		"user3@example.com----pass----ok",
	}, "\n")
	res, err := ParseCredentialLines(bad)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(res.Accounts) != 1 {
		t.Fatalf("expected 1 valid account, got %d", len(res.Accounts))
	}
	if len(res.Errors) != 3 {
		t.Fatalf("expected 3 line errors, got %d (%+v)", len(res.Errors), res.Errors)
	}
	if res.Errors[0].Line != 1 || res.Errors[1].Line != 2 || res.Errors[2].Line != 3 {
		t.Fatalf("unexpected line numbers: %+v", res.Errors)
	}
}

func TestCredentialVaultEncryptsAtRestAndRedactsList(t *testing.T) {
	dir := t.TempDir()
	vault, err := NewCredentialVault(dir, "super-secret-bridge-key-0123456789abcdef")
	if err != nil {
		t.Fatalf("NewCredentialVault: %v", err)
	}

	res, err := vault.ImportText("alice@example.com----SecretPass!99----JBSWY3DPEHPK3PXP----https://mail.example.store/m/1\nbob@example.com---BobPass---KRSXG5CTMVRXEZLU---eyJhbGci.eyJleHAiOjE5MDAwMDAwMDB9.sig", map[string]struct{}{
		"existing@example.com": {},
	})
	if err != nil {
		t.Fatalf("ImportText: %v", err)
	}
	if res.Added != 2 || res.Skipped != 0 || res.Invalid != 0 || res.Count != 2 {
		t.Fatalf("unexpected import response: %+v", res)
	}

	// Verify file on disk is encrypted and contains no cleartext secrets
	rawBytes, err := os.ReadFile(filepath.Join(dir, "pending-credentials.enc.json"))
	if err != nil {
		t.Fatalf("read enc file: %v", err)
	}
	rawStr := string(rawBytes)
	for _, needle := range []string{"SecretPass!99", "JBSWY3DPEHPK3PXP", "alice@example.com", "eyJhbGci"} {
		if strings.Contains(rawStr, needle) {
			t.Fatalf("encrypted vault file leaked cleartext %q", needle)
		}
	}

	// Verify List() redacts secrets
	list, err := vault.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	listJSON, _ := json.Marshal(list)
	for _, needle := range []string{"SecretPass!99", "JBSWY3DPEHPK3PXP", "BobPass", "eyJhbGci", "mail.example.store"} {
		if strings.Contains(string(listJSON), needle) {
			t.Fatalf("List() leaked secret %q", needle)
		}
	}
	if !list.Items[0].HasMailURL || list.Items[0].HasAccessToken {
		t.Fatalf("unexpected flags on item 0: %+v", list.Items[0])
	}
	if !list.Items[1].HasAccessToken || list.Items[1].HasMailURL {
		t.Fatalf("unexpected flags on item 1: %+v", list.Items[1])
	}

	// Verify Delete
	removed, remaining, err := vault.Delete(list.Items[0].ID)
	if err != nil || removed != 1 || remaining != 1 {
		t.Fatalf("Delete failed: removed=%d remaining=%d err=%v", removed, remaining, err)
	}
}
