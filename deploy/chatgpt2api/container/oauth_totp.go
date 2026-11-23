package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	fhttp "github.com/bogdanfinn/fhttp"
	tls_client "github.com/bogdanfinn/tls-client"
	"github.com/bogdanfinn/tls-client/profiles"
	"github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// Note: Automated login against auth.openai.com and sentinel.openai.com uses
// reverse-engineered unofficial endpoints (same risk class as chatgpt2api's
// upstream web/Codex transport). Credentials are used strictly in-memory for
// OAuth token exchange and are never logged in plaintext.

const (
	defaultOpenAIAuthBase      = "https://auth.openai.com"
	defaultOpenAIPlatformBase  = "https://platform.openai.com"
	defaultOpenAISentinelURL   = "https://sentinel.openai.com/backend-api/sentinel/req"
	openAIPlatformClientID     = "app_2SKx67EdpoN0G6j64rFvigXD"
	openAIRedirectURI          = "https://platform.openai.com/auth/callback"
	openAIAudience             = "https://api.openai.com/v1"
	openAIAuth0Client          = "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjEuMjEuMCJ9"
	defaultOAuthUserAgent      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
	defaultOAuthSecChUA        = `"Chromium";v="145", "Google Chrome";v="145", "Not/A)Brand";v="99"`
	sentinelMaxPoWAttempts     = 500_000
	sentinelErrorPrefix        = "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D"
	sentinelSDKScriptURL       = "https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js"
	sentinelFrameReferer       = "https://sentinel.openai.com/backend-api/sentinel/frame.html"
	sentinelOrigin             = "https://sentinel.openai.com"
)

var proxySecretRe = regexp.MustCompile(`(?i)((?:https?|socks5h?|socks)://)[^\s/@:]+:[^\s/@]+@`)

func redactProxyURL(s string) string {
	return proxySecretRe.ReplaceAllString(s, `${1}[REDACTED]@`)
}

type AuthTarget struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	TOTPSecret   string `json:"totp_secret"`
	MailURL      string `json:"mail_url,omitempty"`
	AccessToken  string `json:"access_token,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type AuthOutcome struct {
	ID           string `json:"id,omitempty"`
	Email        string `json:"email"`
	OK           bool   `json:"ok"`
	Reused       bool   `json:"reused,omitempty"`
	AccessToken  string `json:"-"`
	RefreshToken string `json:"-"`
	IDToken      string `json:"-"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	Error        string `json:"error,omitempty"`
	Detail       string `json:"detail,omitempty"`
}

// ParseJWTPayload decodes a JWT payload without signature verification.
func ParseJWTPayload(token string) map[string]any {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		// Fallback for padded base64url
		padded := parts[1] + strings.Repeat("=", (4-len(parts[1])%4)%4)
		payloadBytes, err = base64.URLEncoding.DecodeString(padded)
		if err != nil {
			return nil
		}
	}
	var out map[string]any
	if err := json.Unmarshal(payloadBytes, &out); err != nil {
		return nil
	}
	return out
}

// IsValidAccessToken checks if a JWT access token has a valid exp > now + 60s.
func IsValidAccessToken(token string, now time.Time) (int, bool) {
	payload := ParseJWTPayload(token)
	if payload == nil {
		return 0, false
	}
	rawExp, ok := payload["exp"]
	if !ok {
		return 0, false
	}
	var expUnix float64
	switch v := rawExp.(type) {
	case float64:
		expUnix = v
	case int64:
		expUnix = float64(v)
	case json.Number:
		parsed, err := v.Float64()
		if err != nil {
			return 0, false
		}
		expUnix = parsed
	default:
		return 0, false
	}
	remaining := int(expUnix) - int(now.Unix())
	if remaining <= 60 {
		return 0, false
	}
	return remaining, true
}

// GenerateTOTP computes a 6-digit RFC 6238 HMAC-SHA1 TOTP code from a Base32 secret.
func GenerateTOTP(secret string, now time.Time) (string, error) {
	clean := strings.ToUpper(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(secret), " ", ""), "-", ""))
	if clean == "" {
		return "", errors.New("empty_totp_secret")
	}
	if rem := len(clean) % 8; rem != 0 {
		clean += strings.Repeat("=", 8-rem)
	}
	key, err := base32.StdEncoding.DecodeString(clean)
	if err != nil {
		return "", fmt.Errorf("invalid_totp_secret_base32: %w", err)
	}
	counter := uint64(now.Unix() / 30)
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	code := (uint32(sum[offset]&0x7f)<<24 |
		uint32(sum[offset+1])<<16 |
		uint32(sum[offset+2])<<8 |
		uint32(sum[offset+3])) % 1_000_000
	return fmt.Sprintf("%06d", code), nil
}

// GeneratePKCE produces (code_verifier, code_challenge) using S256.
func GeneratePKCE() (string, string, error) {
	buf := make([]byte, 64)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	verifier := base64.RawURLEncoding.EncodeToString(buf)
	sum := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge, nil
}

func randomURLSafeToken(byteLen int) string {
	buf := make([]byte, byteLen)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func cryptoRandInt(n int) int {
	if n <= 1 {
		return 0
	}
	val, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(val.Int64())
}

func cryptoRandFloat() float64 {
	val, err := rand.Int(rand.Reader, big.NewInt(1<<53))
	if err != nil {
		return 0.5
	}
	return float64(val.Int64()) / float64(1<<53)
}

func fnv1a32Hex(text string) string {
	var h uint32 = 2166136261
	for _, r := range text {
		h ^= uint32(r)
		h *= 16777619
	}
	h ^= h >> 16
	h *= 2246822507
	h ^= h >> 13
	h *= 3266489909
	h ^= h >> 16
	return fmt.Sprintf("%08x", h)
}

type SentinelGenerator struct {
	DeviceID  string
	UserAgent string
	SID       string
}

func NewSentinelGenerator(deviceID, ua string) *SentinelGenerator {
	if ua == "" {
		ua = defaultOAuthUserAgent
	}
	return &SentinelGenerator{
		DeviceID:  deviceID,
		UserAgent: ua,
		SID:       uuid.NewString(),
	}
}

func (g *SentinelGenerator) getConfig() []any {
	perfNow := 1000.0 + cryptoRandFloat()*49000.0
	navChoices := []string{"vendorSub-undefined", "plugins-undefined", "mimeTypes-undefined", "hardwareConcurrency-undefined"}
	docChoices := []string{"location", "implementation", "URL", "documentURI", "compatMode"}
	winChoices := []string{"Object", "Function", "Array", "Number", "parseFloat", "undefined"}
	coreChoices := []int{4, 8, 12, 16}

	now := time.Now().UTC()
	return []any{
		"1920x1080",
		now.Format("Mon Jan 02 2006 15:04:05") + " GMT+0000 (Coordinated Universal Time)",
		int64(4294705152),
		cryptoRandFloat(),
		g.UserAgent,
		sentinelSDKScriptURL,
		nil,
		nil,
		"en-US",
		cryptoRandFloat(),
		navChoices[cryptoRandInt(len(navChoices))],
		docChoices[cryptoRandInt(len(docChoices))],
		winChoices[cryptoRandInt(len(winChoices))],
		perfNow,
		g.SID,
		"",
		coreChoices[cryptoRandInt(len(coreChoices))],
		float64(now.UnixMilli()) - perfNow,
	}
}

func (g *SentinelGenerator) GenerateRequirementsToken() string {
	data := g.getConfig()
	data[3] = 1
	data[9] = 5 + cryptoRandInt(46)
	raw, _ := json.Marshal(data)
	return "gAAAAAC" + base64.StdEncoding.EncodeToString(raw)
}

func (g *SentinelGenerator) GenerateToken(seed, difficulty string) string {
	start := time.Now()
	data := g.getConfig()
	if difficulty == "" {
		difficulty = "0"
	}
	for i := 0; i < sentinelMaxPoWAttempts; i++ {
		data[3] = i
		data[9] = time.Since(start).Milliseconds()
		raw, _ := json.Marshal(data)
		payload := base64.StdEncoding.EncodeToString(raw)
		hash := fnv1a32Hex(seed + payload)
		if len(hash) >= len(difficulty) && hash[:len(difficulty)] <= difficulty {
			return "gAAAAAB" + payload + "~S"
		}
	}
	nullJSON, _ := json.Marshal(nil)
	return "gAAAAAB" + sentinelErrorPrefix + base64.StdEncoding.EncodeToString(nullJSON)
}

type oauthResponse struct {
	StatusCode int
	FinalURL   string
	Body       []byte
}

// OAuthSessionClient abstracts HTTP + cookie jar calls so production uses tls-client
// and tests can inject a standard httptest client.
type OAuthSessionClient interface {
	SetCookie(rawURL, name, value, domain string)
	Do(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) (oauthResponse, error)
}

type tlsSessionClient struct {
	client tls_client.HttpClient
}

func newTLSOAuthSessionClient(proxyURL string) (OAuthSessionClient, error) {
	jar := tls_client.NewCookieJar()
	options := []tls_client.HttpClientOption{
		tls_client.WithTimeoutSeconds(45),
		tls_client.WithClientProfile(profiles.Chrome_146),
		tls_client.WithRandomTLSExtensionOrder(),
		tls_client.WithCookieJar(jar),
		tls_client.WithInsecureSkipVerify(),
	}
	if strings.TrimSpace(proxyURL) != "" {
		options = append(options, tls_client.WithProxyUrl(normalizeProxyURL(proxyURL)))
	}
	client, err := tls_client.NewHttpClient(tls_client.NewNoopLogger(), options...)
	if err != nil {
		return nil, err
	}
	return &tlsSessionClient{client: client}, nil
}

func (c *tlsSessionClient) SetCookie(rawURL, name, value, domain string) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return
	}
	c.client.SetCookies(u, []*fhttp.Cookie{{
		Name:   name,
		Value:  value,
		Domain: domain,
		Path:   "/",
	}})
}

func (c *tlsSessionClient) Do(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) (oauthResponse, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := fhttp.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return oauthResponse{}, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return oauthResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return oauthResponse{}, err
	}
	finalURL := rawURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	return oauthResponse{StatusCode: resp.StatusCode, FinalURL: finalURL, Body: data}, nil
}

type stdSessionClient struct {
	client *http.Client
}

func newStdOAuthSessionClient(client *http.Client) OAuthSessionClient {
	if client == nil {
		jar, _ := cookiejar.New(nil)
		client = &http.Client{Jar: jar, Timeout: 30 * time.Second}
	} else if client.Jar == nil {
		jar, _ := cookiejar.New(nil)
		cloned := *client
		cloned.Jar = jar
		client = &cloned
	}
	return &stdSessionClient{client: client}
}

func (c *stdSessionClient) SetCookie(rawURL, name, value, domain string) {
	if c.client.Jar == nil {
		return
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return
	}
	c.client.Jar.SetCookies(u, []*http.Cookie{{
		Name:   name,
		Value:  value,
		Domain: domain,
		Path:   "/",
	}})
}

func (c *stdSessionClient) Do(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) (oauthResponse, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, reader)
	if err != nil {
		return oauthResponse{}, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return oauthResponse{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return oauthResponse{}, err
	}
	finalURL := rawURL
	if resp.Request != nil && resp.Request.URL != nil {
		finalURL = resp.Request.URL.String()
	}
	return oauthResponse{StatusCode: resp.StatusCode, FinalURL: finalURL, Body: data}, nil
}

func normalizeProxyURL(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	if !strings.Contains(v, "://") {
		v = "http://" + v
	}
	if strings.HasPrefix(v, "socks://") {
		return "socks5h://" + strings.TrimPrefix(v, "socks://")
	}
	if strings.HasPrefix(v, "socks5://") {
		return "socks5h://" + strings.TrimPrefix(v, "socks5://")
	}
	return v
}

func ResolveProxyFromConfig(appDir, explicitProxy string) string {
	if p := strings.TrimSpace(explicitProxy); p != "" {
		return normalizeProxyURL(p)
	}
	cfgPath := filepath.Join(appDir, "config.yaml")
	data, err := os.ReadFile(cfgPath)
	if err == nil && len(data) > 0 {
		var raw struct {
			Proxy        string `yaml:"proxy"`
			ProxyRuntime struct {
				Enabled    bool   `yaml:"enabled"`
				EgressMode string `yaml:"egress_mode"`
				ProxyURL   string `yaml:"proxy_url"`
			} `yaml:"proxy_runtime"`
		}
		if yaml.Unmarshal(data, &raw) == nil {
			if raw.ProxyRuntime.Enabled && raw.ProxyRuntime.EgressMode == "single_proxy" && strings.TrimSpace(raw.ProxyRuntime.ProxyURL) != "" {
				return normalizeProxyURL(raw.ProxyRuntime.ProxyURL)
			}
			if strings.TrimSpace(raw.Proxy) != "" {
				return normalizeProxyURL(raw.Proxy)
			}
		}
	}
	for _, key := range []string{"HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return normalizeProxyURL(v)
		}
	}
	return ""
}

type OAuthAuthenticatorConfig struct {
	AuthBase     string
	PlatformBase string
	SentinelURL  string
	UserAgent    string
	Now          func() time.Time
	NewSession   func(proxyURL string) (OAuthSessionClient, error)
}

type OAuthAuthenticator struct {
	cfg OAuthAuthenticatorConfig
}

func NewOAuthAuthenticator(cfg OAuthAuthenticatorConfig) *OAuthAuthenticator {
	if cfg.AuthBase == "" {
		cfg.AuthBase = defaultOpenAIAuthBase
	}
	if cfg.PlatformBase == "" {
		cfg.PlatformBase = defaultOpenAIPlatformBase
	}
	if cfg.SentinelURL == "" {
		cfg.SentinelURL = defaultOpenAISentinelURL
	}
	if cfg.UserAgent == "" {
		cfg.UserAgent = defaultOAuthUserAgent
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.NewSession == nil {
		cfg.NewSession = newTLSOAuthSessionClient
	}
	return &OAuthAuthenticator{cfg: cfg}
}

func buildSentinelToken(ctx context.Context, client OAuthSessionClient, sentinelURL, deviceID, flow, ua string) (string, string, error) {
	gen := NewSentinelGenerator(deviceID, ua)
	reqBody, _ := json.Marshal(map[string]string{
		"p":    gen.GenerateRequirementsToken(),
		"id":   deviceID,
		"flow": flow,
	})
	resp, err := client.Do(ctx, http.MethodPost, sentinelURL, map[string]string{
		"Content-Type":       "text/plain;charset=UTF-8",
		"Referer":            sentinelFrameReferer,
		"Origin":             sentinelOrigin,
		"User-Agent":         ua,
		"sec-ch-ua":          defaultOAuthSecChUA,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": `"Windows"`,
	}, reqBody)
	if err != nil {
		return "", "", err
	}
	var parsed struct {
		Token       string `json:"token"`
		ProofOfWork struct {
			Required   bool   `json:"required"`
			Seed       string `json:"seed"`
			Difficulty string `json:"difficulty"`
		} `json:"proofofwork"`
	}
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		fallback, _ := json.Marshal(map[string]string{
			"p":    gen.GenerateRequirementsToken(),
			"t":    "",
			"c":    "",
			"id":   deviceID,
			"flow": flow,
		})
		return string(fallback), "", nil
	}
	token := strings.TrimSpace(parsed.Token)
	if resp.StatusCode != http.StatusOK || token == "" {
		return "", "", fmt.Errorf("sentinel_req_failed_%d", resp.StatusCode)
	}
	pVal := gen.GenerateRequirementsToken()
	if parsed.ProofOfWork.Required && parsed.ProofOfWork.Seed != "" {
		pVal = gen.GenerateToken(parsed.ProofOfWork.Seed, parsed.ProofOfWork.Difficulty)
	}
	headerObj, _ := json.Marshal(map[string]string{
		"p":    pVal,
		"t":    "",
		"c":    token,
		"id":   deviceID,
		"flow": flow,
	})
	return string(headerObj), "0" + token, nil
}

func extractCodeFromURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(u.Query().Get("code"))
}

func (a *OAuthAuthenticator) Authenticate(ctx context.Context, target AuthTarget, proxyURL string) AuthOutcome {
	now := a.cfg.Now()

	// Format 3 fast path: reuse valid non-expired JWT access_token without network OAuth login.
	if tok := strings.TrimSpace(target.AccessToken); tok != "" {
		if remaining, ok := IsValidAccessToken(tok, now); ok {
			return AuthOutcome{
				ID:           target.ID,
				Email:        target.Email,
				OK:           true,
				Reused:       true,
				AccessToken:  tok,
				RefreshToken: strings.TrimSpace(target.RefreshToken),
				ExpiresIn:    remaining,
			}
		}
	}

	if strings.TrimSpace(target.Email) == "" || strings.TrimSpace(target.Password) == "" {
		return AuthOutcome{
			ID:    target.ID,
			Email: target.Email,
			OK:    false,
			Error: "missing_email_or_password",
		}
	}

	client, err := a.cfg.NewSession(proxyURL)
	if err != nil {
		return AuthOutcome{
			ID:     target.ID,
			Email:  target.Email,
			OK:     false,
			Error:  "oauth_client_init_failed",
			Detail: redactProxyURL(err.Error()),
		}
	}

	deviceID := uuid.NewString()
	codeVerifier, codeChallenge, err := GeneratePKCE()
	if err != nil {
		return AuthOutcome{ID: target.ID, Email: target.Email, OK: false, Error: "pkce_init_failed"}
	}

	authBase := strings.TrimRight(a.cfg.AuthBase, "/")
	platformBase := strings.TrimRight(a.cfg.PlatformBase, "/")
	client.SetCookie(authBase, "oai-did", deviceID, ".auth.openai.com")
	client.SetCookie(authBase, "oai-did", deviceID, "auth.openai.com")

	// 1. Authorize
	params := url.Values{
		"issuer":                {defaultOpenAIAuthBase},
		"client_id":             {openAIPlatformClientID},
		"audience":              {openAIAudience},
		"redirect_uri":          {openAIRedirectURI},
		"device_id":             {deviceID},
		"screen_hint":           {"login_or_signup"},
		"max_age":               {"0"},
		"login_hint":            {target.Email},
		"scope":                 {"openid profile email offline_access"},
		"response_type":         {"code"},
		"response_mode":         {"query"},
		"state":                 {randomURLSafeToken(32)},
		"nonce":                 {randomURLSafeToken(32)},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
		"auth0Client":           {openAIAuth0Client},
	}
	authorizeURL := authBase + "/api/accounts/authorize?" + params.Encode()
	authResp, err := client.Do(ctx, http.MethodGet, authorizeURL, map[string]string{
		"User-Agent": a.cfg.UserAgent,
	}, nil)
	if err != nil {
		return AuthOutcome{
			ID:     target.ID,
			Email:  target.Email,
			OK:     false,
			Error:  "authorize_network_error",
			Detail: redactProxyURL(err.Error()),
		}
	}
	if authResp.StatusCode != http.StatusOK && authResp.StatusCode != http.StatusFound {
		return AuthOutcome{
			ID:    target.ID,
			Email: target.Email,
			OK:    false,
			Error: fmt.Sprintf("authorize_failed_%d", authResp.StatusCode),
		}
	}

	authCode := extractCodeFromURL(authResp.FinalURL)

	// 2. Password verify
	loginHeaders := map[string]string{
		"accept":             "application/json",
		"accept-language":    "zh-CN,zh;q=0.9",
		"content-type":       "application/json",
		"origin":             authBase,
		"priority":           "u=1, i",
		"user-agent":         a.cfg.UserAgent,
		"sec-ch-ua":          defaultOAuthSecChUA,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": `"Windows"`,
		"sec-fetch-dest":     "empty",
		"sec-fetch-mode":     "cors",
		"sec-fetch-site":     "same-origin",
		"referer":            authBase + "/email-verification",
		"oai-device-id":      deviceID,
	}

	if authCode == "" {
		if sentinelVal, oaiSC, err := buildSentinelToken(ctx, client, a.cfg.SentinelURL, deviceID, "password_verify", a.cfg.UserAgent); err == nil && sentinelVal != "" {
			loginHeaders["openai-sentinel-token"] = sentinelVal
			if oaiSC != "" {
				client.SetCookie(authBase, "oai-sc", oaiSC, ".openai.com")
				client.SetCookie(authBase, "oai-sc", oaiSC, "auth.openai.com")
			}
		}

		pwdBody, _ := json.Marshal(map[string]string{"password": target.Password})
		pwdResp, err := client.Do(ctx, http.MethodPost, authBase+"/api/accounts/password/verify", loginHeaders, pwdBody)
		if err != nil {
			return AuthOutcome{
				ID:     target.ID,
				Email:  target.Email,
				OK:     false,
				Error:  "password_verify_network_error",
				Detail: redactProxyURL(err.Error()),
			}
		}
		if pwdResp.StatusCode != http.StatusOK {
			detail := strings.TrimSpace(string(pwdResp.Body))
			if len(detail) > 200 {
				detail = detail[:200]
			}
			return AuthOutcome{
				ID:     target.ID,
				Email:  target.Email,
				OK:     false,
				Error:  fmt.Sprintf("password_verify_failed_%d", pwdResp.StatusCode),
				Detail: detail,
			}
		}

		var loginData struct {
			ContinueURL string `json:"continue_url"`
			Page        struct {
				Type    string `json:"type"`
				Payload struct {
					FactorID string `json:"factor_id"`
					Factors  []struct {
						ID string `json:"id"`
					} `json:"factors"`
				} `json:"payload"`
			} `json:"page"`
		}
		_ = json.Unmarshal(pwdResp.Body, &loginData)
		authCode = extractCodeFromURL(loginData.ContinueURL)

		// 3. MFA TOTP challenge if required
		if authCode == "" {
			if loginData.Page.Type == "mfa_challenge" {
				factorID := strings.TrimSpace(loginData.Page.Payload.FactorID)
				if factorID == "" && len(loginData.Page.Payload.Factors) > 0 {
					factorID = strings.TrimSpace(loginData.Page.Payload.Factors[0].ID)
				}
				if factorID == "" {
					return AuthOutcome{ID: target.ID, Email: target.Email, OK: false, Error: "mfa_challenge_no_factor_id"}
				}
				if strings.TrimSpace(target.TOTPSecret) == "" {
					return AuthOutcome{ID: target.ID, Email: target.Email, OK: false, Error: "mfa_challenge_requires_totp_secret"}
				}
				totpCode, err := GenerateTOTP(target.TOTPSecret, now)
				if err != nil {
					return AuthOutcome{
						ID:     target.ID,
						Email:  target.Email,
						OK:     false,
						Error:  "invalid_totp_secret_base32",
						Detail: "TOTP secret is not valid Base32",
					}
				}

				mfaHeaders := make(map[string]string, len(loginHeaders)+1)
				for k, v := range loginHeaders {
					mfaHeaders[k] = v
				}
				mfaHeaders["referer"] = authBase + "/mfa-challenge/" + factorID
				if sentinelVal, oaiSC, err := buildSentinelToken(ctx, client, a.cfg.SentinelURL, deviceID, "verify_mfa", a.cfg.UserAgent); err == nil && sentinelVal != "" {
					mfaHeaders["openai-sentinel-token"] = sentinelVal
					if oaiSC != "" {
						client.SetCookie(authBase, "oai-sc", oaiSC, ".openai.com")
						client.SetCookie(authBase, "oai-sc", oaiSC, "auth.openai.com")
					}
				}

				mfaBody, _ := json.Marshal(map[string]string{
					"id":   factorID,
					"type": "totp",
					"code": totpCode,
				})
				mfaResp, err := client.Do(ctx, http.MethodPost, authBase+"/api/accounts/mfa/verify", mfaHeaders, mfaBody)
				if err != nil {
					return AuthOutcome{
						ID:     target.ID,
						Email:  target.Email,
						OK:     false,
						Error:  "mfa_verify_network_error",
						Detail: redactProxyURL(err.Error()),
					}
				}
				if mfaResp.StatusCode != http.StatusOK {
					detail := strings.TrimSpace(string(mfaResp.Body))
					if len(detail) > 200 {
						detail = detail[:200]
					}
					return AuthOutcome{
						ID:     target.ID,
						Email:  target.Email,
						OK:     false,
						Error:  fmt.Sprintf("mfa_verify_failed_%d", mfaResp.StatusCode),
						Detail: detail,
					}
				}
				var mfaData struct {
					ContinueURL string `json:"continue_url"`
				}
				_ = json.Unmarshal(mfaResp.Body, &mfaData)
				authCode = extractCodeFromURL(mfaData.ContinueURL)
			} else if loginData.Page.Type != "" {
				return AuthOutcome{
					ID:    target.ID,
					Email: target.Email,
					OK:    false,
					Error: "unsupported_auth_challenge_" + loginData.Page.Type,
				}
			}
		}
	}

	if authCode == "" {
		return AuthOutcome{ID: target.ID, Email: target.Email, OK: false, Error: "no_auth_code_obtained"}
	}

	// 4. Exchange authorization_code for tokens
	tokenBody, _ := json.Marshal(map[string]string{
		"client_id":     openAIPlatformClientID,
		"code_verifier": codeVerifier,
		"grant_type":    "authorization_code",
		"code":          authCode,
		"redirect_uri":  openAIRedirectURI,
	})
	tokenResp, err := client.Do(ctx, http.MethodPost, authBase+"/api/accounts/oauth/token", map[string]string{
		"accept":             "*/*",
		"accept-language":    "zh-CN,zh;q=0.9",
		"auth0-client":       openAIAuth0Client,
		"cache-control":      "no-cache",
		"content-type":       "application/json",
		"origin":             platformBase,
		"pragma":             "no-cache",
		"priority":           "u=1, i",
		"referer":            platformBase + "/",
		"sec-ch-ua":          defaultOAuthSecChUA,
		"sec-ch-ua-mobile":   "?0",
		"sec-ch-ua-platform": `"Windows"`,
		"sec-fetch-dest":     "empty",
		"sec-fetch-mode":     "cors",
		"sec-fetch-site":     "same-site",
		"user-agent":         a.cfg.UserAgent,
	}, tokenBody)
	if err != nil {
		return AuthOutcome{
			ID:     target.ID,
			Email:  target.Email,
			OK:     false,
			Error:  "token_exchange_network_error",
			Detail: redactProxyURL(err.Error()),
		}
	}
	if tokenResp.StatusCode != http.StatusOK {
		detail := strings.TrimSpace(string(tokenResp.Body))
		if len(detail) > 200 {
			detail = detail[:200]
		}
		return AuthOutcome{
			ID:     target.ID,
			Email:  target.Email,
			OK:     false,
			Error:  fmt.Sprintf("token_exchange_failed_%d", tokenResp.StatusCode),
			Detail: detail,
		}
	}

	var tokData struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		IDToken      string `json:"id_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.Unmarshal(tokenResp.Body, &tokData); err != nil || strings.TrimSpace(tokData.AccessToken) == "" {
		return AuthOutcome{ID: target.ID, Email: target.Email, OK: false, Error: "empty_access_token"}
	}

	refreshTok := strings.TrimSpace(tokData.RefreshToken)
	if refreshTok == "" {
		refreshTok = strings.TrimSpace(target.RefreshToken)
	}
	return AuthOutcome{
		ID:           target.ID,
		Email:        target.Email,
		OK:           true,
		AccessToken:  strings.TrimSpace(tokData.AccessToken),
		RefreshToken: refreshTok,
		IDToken:      strings.TrimSpace(tokData.IDToken),
		ExpiresIn:    tokData.ExpiresIn,
	}
}
