package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func makeTestJWT(claims map[string]any) string {
	hdr := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	raw, _ := json.Marshal(claims)
	pld := base64.RawURLEncoding.EncodeToString(raw)
	return hdr + "." + pld + ".sig"
}

func TestGenerateTOTPRFC6238(t *testing.T) {
	// RFC 6238 SHA-1 test vector for secret "12345678901234567890" (Base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ)
	// At T=59s -> 287082 (6 digits of 94287082)
	code, err := GenerateTOTP("gezdgnbv gy3tqojq gezdgnbv gy3tqojq", time.Unix(59, 0))
	if err != nil {
		t.Fatalf("GenerateTOTP: %v", err)
	}
	if code != "287082" {
		t.Fatalf("expected 287082, got %s", code)
	}
}

func TestAuthenticateReusesValidJWTWithoutLogin(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	now := time.Unix(1700000000, 0)
	validTok := makeTestJWT(map[string]any{
		"exp": now.Add(2 * time.Hour).Unix(),
		"https://api.openai.com/profile": map[string]any{
			"email": "cached@example.com",
		},
	})

	auth := NewOAuthAuthenticator(OAuthAuthenticatorConfig{
		AuthBase:     srv.URL,
		PlatformBase: srv.URL,
		SentinelURL:  srv.URL + "/sentinel",
		Now:          func() time.Time { return now },
		NewSession: func(string) (OAuthSessionClient, error) {
			return newStdOAuthSessionClient(srv.Client()), nil
		},
	})

	out := auth.Authenticate(t.Context(), AuthTarget{
		Email:        "cached@example.com",
		Password:     "pass",
		TOTPSecret:   "JBSWY3DPEHPK3PXP",
		AccessToken:  validTok,
		RefreshToken: "rt_keep",
	}, "")

	if !out.OK || !out.Reused || out.AccessToken != validTok || out.RefreshToken != "rt_keep" {
		t.Fatalf("expected token reuse without network hits, got %+v", out)
	}
	if hits.Load() != 0 {
		t.Fatalf("expected 0 network calls when reusing valid JWT, got %d", hits.Load())
	}
}

func TestAuthenticateExpiredJWTFallsBackToOAuthAndTOTP(t *testing.T) {
	now := time.Unix(1700000000, 0)
	expiredTok := makeTestJWT(map[string]any{
		"exp": now.Add(-10 * time.Minute).Unix(),
	})
	freshTok := makeTestJWT(map[string]any{
		"exp": now.Add(24 * time.Hour).Unix(),
		"https://api.openai.com/auth": map[string]any{
			"chatgpt_plan_type": "free",
		},
		"https://api.openai.com/profile": map[string]any{
			"email": "relogin@example.com",
		},
	})

	expectedTOTP, err := GenerateTOTP("JBSWY3DPEHPK3PXP", now)
	if err != nil {
		t.Fatalf("GenerateTOTP: %v", err)
	}

	var sawAuthorize, sawPassword, sawMFA, sawToken bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/accounts/authorize":
			sawAuthorize = true
			w.WriteHeader(http.StatusOK)
		case "/sentinel":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"token":"c_tok_123","proofofwork":{"required":true,"seed":"0.5","difficulty":"0"}}`))
		case "/api/accounts/password/verify":
			sawPassword = true
			if r.Header.Get("openai-sentinel-token") == "" {
				t.Errorf("missing openai-sentinel-token on password verify")
			}
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["password"] != "MyPass#1" {
				t.Errorf("unexpected password: %q", body["password"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"page":{"type":"mfa_challenge","payload":{"factor_id":"fac_1"}}}`))
		case "/api/accounts/mfa/verify":
			sawMFA = true
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["id"] != "fac_1" || body["type"] != "totp" || body["code"] != expectedTOTP {
				t.Errorf("unexpected mfa payload: %+v (want code %s)", body, expectedTOTP)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"continue_url":"https://platform.openai.com/auth/callback?code=authcode_xyz&state=abc"}`))
		case "/api/accounts/oauth/token":
			sawToken = true
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["code"] != "authcode_xyz" || body["code_verifier"] == "" {
				t.Errorf("unexpected token exchange payload: %+v", body)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"access_token":  freshTok,
				"refresh_token": "rt_fresh",
				"id_token":      "id_fresh",
				"expires_in":    86400,
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	auth := NewOAuthAuthenticator(OAuthAuthenticatorConfig{
		AuthBase:     srv.URL,
		PlatformBase: srv.URL,
		SentinelURL:  srv.URL + "/sentinel",
		Now:          func() time.Time { return now },
		NewSession: func(string) (OAuthSessionClient, error) {
			return newStdOAuthSessionClient(srv.Client()), nil
		},
	})

	out := auth.Authenticate(t.Context(), AuthTarget{
		Email:       "relogin@example.com",
		Password:    "MyPass#1",
		TOTPSecret:  "JBSWY3DPEHPK3PXP",
		AccessToken: expiredTok,
	}, "")

	if !out.OK || out.Reused || out.AccessToken != freshTok || out.RefreshToken != "rt_fresh" {
		t.Fatalf("expected OAuth+TOTP relogin success, got %+v", out)
	}
	if !sawAuthorize || !sawPassword || !sawMFA || !sawToken {
		t.Fatalf("missing OAuth step: auth=%v pwd=%v mfa=%v tok=%v", sawAuthorize, sawPassword, sawMFA, sawToken)
	}
}

func TestAuthenticateInvalidTOTPReturnsCleanError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/accounts/authorize":
			w.WriteHeader(http.StatusOK)
		case "/sentinel":
			_, _ = w.Write([]byte(`{"token":"t"}`))
		case "/api/accounts/password/verify":
			_, _ = w.Write([]byte(`{"page":{"type":"mfa_challenge","payload":{"factor_id":"fac_1"}}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	auth := NewOAuthAuthenticator(OAuthAuthenticatorConfig{
		AuthBase:     srv.URL,
		PlatformBase: srv.URL,
		SentinelURL:  srv.URL + "/sentinel",
		NewSession: func(string) (OAuthSessionClient, error) {
			return newStdOAuthSessionClient(srv.Client()), nil
		},
	})

	out := auth.Authenticate(t.Context(), AuthTarget{
		Email:      "badtotp@example.com",
		Password:   "SecretPassword123",
		TOTPSecret: "NOT-VALID-BASE32!!!",
	}, "")
	if out.OK || out.Error != "invalid_totp_secret_base32" {
		t.Fatalf("expected invalid_totp_secret_base32, got %+v", out)
	}
	if strings.Contains(out.Detail, "SecretPassword123") {
		t.Fatalf("password leaked into error detail")
	}
}
