package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestWrapperAuthHTMLInjectionAndVaultFlow(t *testing.T) {
	now := time.Unix(1700000000, 0)
	reusedJWT := makeTestJWT(map[string]any{
		"exp": now.Add(4 * time.Hour).Unix(),
		"https://api.openai.com/auth": map[string]any{
			"chatgpt_plan_type": "free",
		},
		"https://api.openai.com/profile": map[string]any{
			"email": "tokuser@example.com",
		},
	})
	freshJWT := makeTestJWT(map[string]any{
		"exp": now.Add(24 * time.Hour).Unix(),
		"https://api.openai.com/auth": map[string]any{
			"chatgpt_plan_type": "free",
		},
		"https://api.openai.com/profile": map[string]any{
			"email": "okuser@example.com",
		},
	})

	// Mock upstream chatgpt2api server
	var enrolledEmails []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/" && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<!doctype html><html><body><div id=\"view\"></div></body></html>"))
		case r.URL.Path == "/v1/chat/completions" && r.Method == http.MethodPost:
			w.Header().Set("Content-Type", "text/event-stream")
			_, _ = w.Write([]byte("data: {\"ok\":true}\n\ndata: [DONE]\n\n"))
		case r.URL.Path == "/api/accounts" && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"items":[]}`))
		case r.URL.Path == "/api/accounts" && r.Method == http.MethodPost:
			var items []UpstreamAccountItem
			_ = json.NewDecoder(r.Body).Decode(&items)
			for _, it := range items {
				if it.Email != nil {
					enrolledEmails = append(enrolledEmails, *it.Email)
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(EnrollResult{Added: len(items), Skipped: 0, Refreshed: len(items)})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer upstream.Close()

	// Mock OAuth server: okuser@example.com succeeds, failuser@example.com gets 401
	oauthSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/accounts/authorize":
			hint := r.URL.Query().Get("login_hint")
			if hint == "failuser@example.com" {
				http.SetCookie(w, &http.Cookie{Name: "test_user", Value: "fail"})
			} else {
				http.SetCookie(w, &http.Cookie{Name: "test_user", Value: "ok"})
			}
			w.WriteHeader(http.StatusOK)
		case "/sentinel":
			_, _ = w.Write([]byte(`{"token":"tok"}`))
		case "/api/accounts/password/verify":
			c, err := r.Cookie("test_user")
			if err == nil && c.Value == "fail" {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"bad_credentials"}`))
				return
			}
			_, _ = w.Write([]byte(`{"continue_url":"https://platform.openai.com/auth/callback?code=code_ok"}`))
		case "/api/accounts/oauth/token":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  freshJWT,
				"refresh_token": "rt_ok",
				"id_token":      "id_ok",
				"expires_in":    86400,
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer oauthSrv.Close()

	vault, err := NewCredentialVault(t.TempDir(), "test-secret-key-0123456789abcdef012345")
	if err != nil {
		t.Fatalf("NewCredentialVault: %v", err)
	}
	auth := NewOAuthAuthenticator(OAuthAuthenticatorConfig{
		AuthBase:     oauthSrv.URL,
		PlatformBase: oauthSrv.URL,
		SentinelURL:  oauthSrv.URL + "/sentinel",
		Now:          func() time.Time { return now },
		NewSession: func(string) (OAuthSessionClient, error) {
			return newStdOAuthSessionClient(oauthSrv.Client()), nil
		},
	})
	authKey := "admin-key-0123456789abcdef0123456789"
	wrapper, err := NewWrapperServer(upstream.URL, authKey, t.TempDir(), vault, auth, nil, nil)
	if err != nil {
		t.Fatalf("NewWrapperServer: %v", err)
	}
	srv := httptest.NewServer(wrapper)
	defer srv.Close()

	// 1. Unauthenticated /api/local/credential-vault -> 401
	unauthResp, err := http.Get(srv.URL + "/api/local/credential-vault")
	if err != nil {
		t.Fatalf("unauth GET: %v", err)
	}
	unauthResp.Body.Close()
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauth vault GET, got %d", unauthResp.StatusCode)
	}

	// 2. HTML response gets bulk-import.js script injected
	htmlResp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatalf("HTML GET: %v", err)
	}
	htmlBytes, _ := io.ReadAll(htmlResp.Body)
	htmlResp.Body.Close()
	if !strings.Contains(string(htmlBytes), `/_wrapper/bulk-import.js`) {
		t.Fatalf("expected script injection in HTML, got %q", string(htmlBytes))
	}

	// 3. Script endpoint serves JS
	jsResp, err := http.Get(srv.URL + "/_wrapper/bulk-import.js")
	if err != nil {
		t.Fatalf("JS GET: %v", err)
	}
	jsBytes, _ := io.ReadAll(jsResp.Body)
	jsResp.Body.Close()
	if jsResp.StatusCode != http.StatusOK || !strings.Contains(string(jsBytes), "导入并授权入池") {
		t.Fatalf("unexpected bulk-import.js response: status=%d len=%d", jsResp.StatusCode, len(jsBytes))
	}

	// 4. SSE passthrough works
	sseResp, err := http.Post(srv.URL+"/v1/chat/completions", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("SSE POST: %v", err)
	}
	sseBytes, _ := io.ReadAll(sseResp.Body)
	sseResp.Body.Close()
	if !strings.Contains(string(sseBytes), "[DONE]") {
		t.Fatalf("unexpected SSE body: %q", string(sseBytes))
	}

	// 5. Auto-auth import with mixed: Format 3 valid JWT reuse + Format 2 OAuth success + Format 1 OAuth failure
	reqBody, _ := json.Marshal(map[string]any{
		"autoAuth": true,
		"text": strings.Join([]string{
			"tokuser@example.com----pass1----JBSWY3DPEHPK3PXP----" + reusedJWT,
			"okuser@example.com----pass2----JBSWY3DPEHPK3PXP----https://mail.bsf94666.store/m/1",
			"failuser@example.com----wrongpass----JBSWY3DPEHPK3PXP",
		}, "\n"),
	})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/local/credential-vault", bytes.NewReader(reqBody))
	req.Header.Set("Authorization", "Bearer "+authKey)
	req.Header.Set("Content-Type", "application/json")
	authImportResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("autoAuth POST: %v", err)
	}
	defer authImportResp.Body.Close()
	if authImportResp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(authImportResp.Body)
		t.Fatalf("expected 200, got %d: %s", authImportResp.StatusCode, string(b))
	}
	var out struct {
		Succeeded int `json:"succeeded"`
		Failed    int `json:"failed"`
		VaultCount int `json:"vaultCount"`
		Enrolled  struct {
			Added int `json:"added"`
		} `json:"enrolled"`
		Failures []struct {
			Email string `json:"email"`
			Error string `json:"error"`
		} `json:"failures"`
	}
	if err := json.NewDecoder(authImportResp.Body).Decode(&out); err != nil {
		t.Fatalf("decode autoAuth response: %v", err)
	}
	if out.Succeeded != 2 || out.Failed != 1 || out.Enrolled.Added != 2 || out.VaultCount != 1 {
		t.Fatalf("unexpected autoAuth result: %+v", out)
	}
	if len(out.Failures) != 1 || out.Failures[0].Email != "failuser@example.com" {
		t.Fatalf("unexpected failures list: %+v", out.Failures)
	}
	if len(enrolledEmails) != 2 {
		t.Fatalf("expected 2 enrolled emails, got %+v", enrolledEmails)
	}
}
