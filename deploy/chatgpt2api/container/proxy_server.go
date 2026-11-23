package main

import (
	"bytes"
	"context"
	"crypto/subtle"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed assets/bulk-import.js
var bulkImportScript []byte

type PoolEnroller interface {
	ListEmails(ctx context.Context) (map[string]struct{}, error)
	Enroll(ctx context.Context, items []UpstreamAccountItem) (EnrollResult, error)
}

type UpstreamAccountItem struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token,omitempty"`
	IDToken      string  `json:"id_token,omitempty"`
	Email        *string `json:"email,omitempty"`
	Type         string  `json:"type,omitempty"`
	Proxy        string  `json:"proxy,omitempty"`
}

type EnrollResult struct {
	Added     int                 `json:"added"`
	Skipped   int                 `json:"skipped"`
	Refreshed int                 `json:"refreshed"`
	Errors    []map[string]string `json:"errors"`
}

type httpPoolEnroller struct {
	baseURL string
	authKey string
	client  *http.Client
}

func newHTTPPoolEnroller(baseURL, authKey string) *httpPoolEnroller {
	return &httpPoolEnroller{
		baseURL: strings.TrimRight(baseURL, "/"),
		authKey: authKey,
		client:  &http.Client{Timeout: 180 * time.Second},
	}
}

func (e *httpPoolEnroller) ListEmails(ctx context.Context) (map[string]struct{}, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, e.baseURL+"/api/accounts?page=1&page_size=5000", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+e.authKey)
	resp, err := e.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("list accounts status=%d", resp.StatusCode)
	}
	var payload struct {
		Items []struct {
			Email string `json:"email"`
		} `json:"items"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4*1024*1024)).Decode(&payload); err != nil {
		return nil, err
	}
	emails := make(map[string]struct{}, len(payload.Items))
	for _, it := range payload.Items {
		em := strings.ToLower(strings.TrimSpace(it.Email))
		if em != "" {
			emails[em] = struct{}{}
		}
	}
	return emails, nil
}

func (e *httpPoolEnroller) Enroll(ctx context.Context, items []UpstreamAccountItem) (EnrollResult, error) {
	body, err := json.Marshal(items)
	if err != nil {
		return EnrollResult{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, e.baseURL+"/api/accounts", bytes.NewReader(body))
	if err != nil {
		return EnrollResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+e.authKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.client.Do(req)
	if err != nil {
		return EnrollResult{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return EnrollResult{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errPayload struct {
			Detail struct {
				Error string `json:"error"`
			} `json:"detail"`
		}
		_ = json.Unmarshal(raw, &errPayload)
		msg := strings.TrimSpace(errPayload.Detail.Error)
		if msg == "" {
			msg = fmt.Sprintf("enroll status=%d", resp.StatusCode)
		}
		return EnrollResult{}, errors.New(msg)
	}
	var res EnrollResult
	if err := json.Unmarshal(raw, &res); err != nil {
		return EnrollResult{}, err
	}
	return res, nil
}

type WrapperServer struct {
	authKey  string
	appDir   string
	vault    *CredentialVault
	auth     *OAuthAuthenticator
	enroller PoolEnroller
	proxy    *httputil.ReverseProxy
	logFn    func(string)
}

func NewWrapperServer(upstreamURL, authKey, appDir string, vault *CredentialVault, auth *OAuthAuthenticator, enroller PoolEnroller, logFn func(string)) (*WrapperServer, error) {
	target, err := url.Parse(upstreamURL)
	if err != nil {
		return nil, err
	}
	if logFn == nil {
		logFn = func(string) {}
	}
	if enroller == nil {
		enroller = newHTTPPoolEnroller(upstreamURL, authKey)
	}
	if auth == nil {
		auth = NewOAuthAuthenticator(OAuthAuthenticatorConfig{})
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DisableCompression = true

	rp := httputil.NewSingleHostReverseProxy(target)
	rp.Transport = transport
	rp.FlushInterval = -1
	origDirector := rp.Director
	rp.Director = func(req *http.Request) {
		origDirector(req)
		// Ensure upstream returns plain UTF-8 HTML so script injection works cleanly.
		req.Header.Del("Accept-Encoding")
	}
	rp.ModifyResponse = func(resp *http.Response) error {
		ct := strings.ToLower(resp.Header.Get("Content-Type"))
		if !strings.Contains(ct, "text/html") || resp.Request == nil || resp.Request.Method == http.MethodHead {
			return nil
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
		resp.Body.Close()
		if err != nil {
			return err
		}
		const tag = `<script type="module" src="/_wrapper/bulk-import.js"></script>`
		if !bytes.Contains(body, []byte("/_wrapper/bulk-import.js")) {
			if idx := bytes.LastIndex(body, []byte("</body>")); idx >= 0 {
				injected := make([]byte, 0, len(body)+len(tag)+1)
				injected = append(injected, body[:idx]...)
				injected = append(injected, []byte(tag+"\n")...)
				injected = append(injected, body[idx:]...)
				body = injected
			}
		}
		resp.Body = io.NopCloser(bytes.NewReader(body))
		resp.ContentLength = int64(len(body))
		resp.Header.Set("Content-Length", strconv.Itoa(len(body)))
		resp.Header.Del("Content-Encoding")
		return nil
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logFn(fmt.Sprintf("upstream proxy error path=%s err=%v", r.URL.Path, err))
		writeJSONError(w, http.StatusBadGateway, "后端服务正在启动，请稍后重试")
	}

	return &WrapperServer{
		authKey:  authKey,
		appDir:   appDir,
		vault:    vault,
		auth:     auth,
		enroller: enroller,
		proxy:    rp,
		logFn:    logFn,
	}, nil
}

func (s *WrapperServer) isAuthorized(r *http.Request) bool {
	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if authz == "" {
		if xKey := strings.TrimSpace(r.Header.Get("x-api-key")); xKey != "" {
			authz = "Bearer " + xKey
		}
	}
	scheme, token, ok := strings.Cut(authz, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(s.authKey)) == 1
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{
		"detail": map[string]string{"error": msg},
		"error":  msg,
	})
}

func (s *WrapperServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	if path == "/_wrapper/bulk-import.js" {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodGet {
			_, _ = w.Write(bulkImportScript)
		}
		return
	}

	if path == "/api/local/credential-vault" || strings.HasPrefix(path, "/api/local/credential-vault/") {
		if !s.isAuthorized(r) {
			writeJSONError(w, http.StatusUnauthorized, "密钥无效或已失效，请重新登录")
			return
		}
		s.handleVault(w, r)
		return
	}

	s.proxy.ServeHTTP(w, r)
}

func (s *WrapperServer) handleVault(w http.ResponseWriter, r *http.Request) {
	if s.vault == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "本地加密账号暂存功能不可用")
		return
	}
	path := r.URL.Path

	if path == "/api/local/credential-vault" {
		switch r.Method {
		case http.MethodGet:
			list, err := s.vault.List()
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, list)
			return

		case http.MethodPost:
			var body struct {
				Text     string `json:"text"`
				AutoAuth bool   `json:"autoAuth"`
				Proxy    string `json:"proxy"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, MaxCredentialInputBytes+4096)).Decode(&body); err != nil {
				writeJSONError(w, http.StatusBadRequest, "请求体格式不正确")
				return
			}
			if strings.TrimSpace(body.Text) == "" {
				writeJSONError(w, http.StatusBadRequest, "请输入账号行文本")
				return
			}
			if !body.AutoAuth {
				existing, _ := s.enroller.ListEmails(r.Context())
				res, err := s.vault.ImportText(body.Text, existing)
				if err != nil {
					writeJSONError(w, http.StatusBadRequest, err.Error())
					return
				}
				writeJSON(w, http.StatusOK, res)
				return
			}
			s.authenticateAndEnroll(w, r, authBatchRequest{
				Text:           body.Text,
				Proxy:          body.Proxy,
				IncludeAutoKey: true,
			})
			return

		default:
			writeJSONError(w, http.StatusMethodNotAllowed, "接口方法不允许")
			return
		}
	}

	if path == "/api/local/credential-vault/authenticate" {
		if r.Method != http.MethodPost {
			writeJSONError(w, http.StatusMethodNotAllowed, "接口方法不允许")
			return
		}
		var body authBatchRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, MaxCredentialInputBytes+4096)).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "请求体格式不正确")
			return
		}
		s.authenticateAndEnroll(w, r, body)
		return
	}

	if strings.HasPrefix(path, "/api/local/credential-vault/") {
		id := strings.TrimPrefix(path, "/api/local/credential-vault/")
		if !uuidRe.MatchString(id) {
			writeJSONError(w, http.StatusNotFound, "暂存账号不存在")
			return
		}
		if r.Method != http.MethodDelete {
			writeJSONError(w, http.StatusMethodNotAllowed, "接口方法不允许")
			return
		}
		removed, count, err := s.vault.Delete(id)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]int{"removed": removed, "count": count})
		return
	}

	writeJSONError(w, http.StatusNotFound, "接口不存在")
}

type authBatchRequest struct {
	Text           string `json:"text"`
	ID             string `json:"id"`
	All            bool   `json:"all"`
	Proxy          string `json:"proxy"`
	IncludeAutoKey bool   `json:"-"`
}

func (s *WrapperServer) authenticateAndEnroll(w http.ResponseWriter, r *http.Request, req authBatchRequest) {
	var targets []AuthTarget
	duplicateCount := 0
	var parseErrors []LineError

	if strings.TrimSpace(req.Text) != "" {
		parsed, err := ParseCredentialLines(req.Text)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		if len(parsed.Accounts) == 0 {
			reason := "格式不匹配"
			line := 1
			if len(parsed.Errors) > 0 {
				reason = parsed.Errors[0].Reason
				line = parsed.Errors[0].Line
			}
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("未包含有效的账号数据（第 %d 行：%s）", line, reason))
			return
		}
		for _, a := range parsed.Accounts {
			targets = append(targets, AuthTarget{
				Email:        a.Email,
				Password:     a.Password,
				TOTPSecret:   a.Auxiliary,
				MailURL:      a.MailURL,
				AccessToken:  a.AccessToken,
				RefreshToken: a.RefreshToken,
			})
		}
		duplicateCount = parsed.Duplicates
		parseErrors = parsed.Errors
	} else if strings.TrimSpace(req.ID) != "" {
		rec, err := s.vault.Get(strings.TrimSpace(req.ID))
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if rec == nil {
			writeJSONError(w, http.StatusNotFound, "未找到指定的暂存账号")
			return
		}
		targets = []AuthTarget{{
			ID:           rec.ID,
			Email:        rec.Email,
			Password:     rec.Password,
			TOTPSecret:   rec.Auxiliary,
			MailURL:      rec.MailURL,
			AccessToken:  rec.AccessToken,
			RefreshToken: rec.RefreshToken,
		}}
	} else if req.All {
		recs, err := s.vault.GetAll()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if len(recs) == 0 {
			writeJSONError(w, http.StatusBadRequest, "没有待授权的暂存账号")
			return
		}
		for _, rec := range recs {
			targets = append(targets, AuthTarget{
				ID:           rec.ID,
				Email:        rec.Email,
				Password:     rec.Password,
				TOTPSecret:   rec.Auxiliary,
				MailURL:      rec.MailURL,
				AccessToken:  rec.AccessToken,
				RefreshToken: rec.RefreshToken,
			})
		}
	} else {
		writeJSONError(w, http.StatusBadRequest, "请提供待授权账号文本、账号 ID 或指定全部授权")
		return
	}

	if len(targets) > MaxAuthBatchSize {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("单次最多认证 %d 个账号", MaxAuthBatchSize))
		return
	}

	proxyURL := ResolveProxyFromConfig(s.appDir, req.Proxy)

	// Authenticate up to 4 accounts concurrently
	outcomes := make([]AuthOutcome, len(targets))
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		go func(idx int, target AuthTarget) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			outcomes[idx] = s.auth.Authenticate(r.Context(), target, proxyURL)
		}(i, t)
	}
	wg.Wait()

	var successes []AuthOutcome
	type failureEntry struct {
		Target  AuthTarget
		Outcome AuthOutcome
	}
	var failures []failureEntry

	for i, out := range outcomes {
		if out.OK && out.AccessToken != "" {
			successes = append(successes, out)
		} else {
			failures = append(failures, failureEntry{Target: targets[i], Outcome: out})
		}
	}

	enrolled := EnrollResult{Skipped: duplicateCount, Errors: []map[string]string{}}
	if len(successes) > 0 {
		items := make([]UpstreamAccountItem, 0, len(successes))
		successEmails := make(map[string]struct{}, len(successes))
		for _, suc := range successes {
			emailCopy := suc.Email
			items = append(items, UpstreamAccountItem{
				AccessToken:  suc.AccessToken,
				RefreshToken: suc.RefreshToken,
				IDToken:      suc.IDToken,
				Email:        &emailCopy,
				Type:         "free",
			})
			successEmails[strings.ToLower(suc.Email)] = struct{}{}
		}
		res, err := s.enroller.Enroll(r.Context(), items)
		if err != nil {
			// If enrollment failed (e.g., Format 3 non-OpenAI token rejected by upstream), treat as failure so credentials stay staged.
			for i, suc := range successes {
				var target AuthTarget
				for _, t := range targets {
					if strings.EqualFold(t.Email, suc.Email) {
						target = t
						break
					}
				}
				_ = i
				failures = append(failures, failureEntry{
					Target: target,
					Outcome: AuthOutcome{
						ID:    suc.ID,
						Email: suc.Email,
						OK:    false,
						Error: "pool_enroll_failed: " + err.Error(),
					},
				})
			}
			successes = nil
		} else {
			enrolled.Added = res.Added
			enrolled.Skipped = res.Skipped + duplicateCount
			enrolled.Refreshed = res.Refreshed
			enrolled.Errors = res.Errors
			if enrolled.Errors == nil {
				enrolled.Errors = []map[string]string{}
			}
			_ = s.vault.DeleteByEmails(successEmails)
		}
	}

	publicFailures := make([]map[string]string, 0, len(failures))
	for _, f := range failures {
		reason := f.Outcome.Error
		if reason == "" {
			reason = "认证失败"
		}
		if f.Outcome.Detail != "" {
			reason = reason + ": " + f.Outcome.Detail
		}
		if len(reason) > 200 {
			reason = reason[:200]
		}
		_ = s.vault.UpsertFailure(f.Target, reason)
		publicErr := reason
		if len(publicErr) > 120 {
			publicErr = publicErr[:120]
		}
		publicFailures = append(publicFailures, map[string]string{
			"email": f.Target.Email,
			"error": publicErr,
		})
	}

	vaultList, _ := s.vault.List()
	if parseErrors == nil {
		parseErrors = []LineError{}
	}
	if len(parseErrors) > 100 {
		parseErrors = parseErrors[:100]
	}

	resp := map[string]any{
		"total":      len(targets) + duplicateCount,
		"succeeded":  len(successes),
		"failed":     len(failures),
		"duplicates": duplicateCount,
		"enrolled": map[string]any{
			"added":      enrolled.Added,
			"skipped":    enrolled.Skipped,
			"refreshed":  enrolled.Refreshed,
			"errorCount": len(enrolled.Errors),
		},
		"failures":   publicFailures,
		"invalid":    len(parseErrors),
		"errors":     parseErrors,
		"vaultCount": vaultList.Count,
	}
	if req.IncludeAutoKey {
		resp["autoAuth"] = true
	}
	writeJSON(w, http.StatusOK, resp)
}
