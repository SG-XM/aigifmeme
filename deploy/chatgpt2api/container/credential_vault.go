package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/scrypt"
)

const (
	MaxCredentialInputBytes = 1024 * 1024
	MaxCredentialLines      = 1000
	MaxStagedAccounts       = 5000
	MaxAuthBatchSize        = 100
	VaultFormatVersion      = 1
)

var (
	multiDashRe = regexp.MustCompile(`-{3,}`)
	uuidRe      = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

type ParsedAccount struct {
	Email        string
	Password     string
	Auxiliary    string // 2FA TOTP secret
	MailURL      string
	AccessToken  string
	RefreshToken string
}

type LineError struct {
	Line   int    `json:"line"`
	Reason string `json:"reason"`
}

type ParseResult struct {
	Accounts   []ParsedAccount
	Errors     []LineError
	Duplicates int
}

type StagedRecord struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	Password     string `json:"password"`
	Auxiliary    string `json:"auxiliary"`
	MailURL      string `json:"mailUrl,omitempty"`
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
	CreatedAt    string `json:"createdAt"`
	State        string `json:"state,omitempty"`
	LastError    string `json:"lastError,omitempty"`
}

type PublicStagedItem struct {
	ID             string `json:"id"`
	Email          string `json:"email"`
	CreatedAt      string `json:"createdAt"`
	State          string `json:"state"`
	LastError      string `json:"lastError,omitempty"`
	HasMailURL     bool   `json:"hasMailUrl,omitempty"`
	HasAccessToken bool   `json:"hasAccessToken,omitempty"`
}

type VaultListResponse struct {
	Count int                `json:"count"`
	Items []PublicStagedItem `json:"items"`
}

type VaultImportResponse struct {
	Added   int         `json:"added"`
	Skipped int         `json:"skipped"`
	Invalid int         `json:"invalid"`
	Errors  []LineError `json:"errors"`
	Count   int         `json:"count"`
}

type encryptedVaultFile struct {
	Version    int    `json:"version"`
	Salt       string `json:"salt"`
	IV         string `json:"iv"`
	Tag        string `json:"tag"`
	Ciphertext string `json:"ciphertext"`
}

func hasControlBytes(s string) bool {
	return strings.ContainsAny(s, "\r\n\x00")
}

func isValidEmail(email string) bool {
	if len(email) == 0 || len(email) > 254 {
		return false
	}
	if strings.ContainsAny(email, " \t\r\n") {
		return false
	}
	at := strings.IndexByte(email, '@')
	if at <= 0 || at >= len(email)-1 {
		return false
	}
	domain := email[at+1:]
	if !strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
		return false
	}
	if strings.Contains(domain, "@") {
		return false
	}
	parsed, err := mail.ParseAddress(email)
	return err == nil && strings.EqualFold(parsed.Address, email)
}

func isHTTPURL(s string) bool {
	lower := strings.ToLower(s)
	return strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")
}

func splitCredentialSegments(line string) []string {
	segments := strings.Split(line, "----")
	if len(segments) >= 3 {
		return segments
	}
	s3 := strings.Split(line, "---")
	if len(s3) >= 3 {
		return s3
	}
	re := multiDashRe.Split(line, -1)
	if len(re) >= 3 {
		return re
	}
	return segments
}

func validateCredentialLine(line string, lineNo int) (ParsedAccount, *LineError) {
	segments := splitCredentialSegments(line)
	if len(segments) < 3 {
		return ParsedAccount{}, &LineError{
			Line:   lineNo,
			Reason: "应为 邮箱----密码----2FA密钥（支持 ---- 或 --- 分隔，至少三个字段）",
		}
	}

	email := strings.ToLower(strings.TrimSpace(segments[0]))
	password := segments[1]
	auxiliary := strings.TrimSpace(segments[2])

	var field4, field5 string
	if len(segments) >= 4 {
		field4 = strings.TrimSpace(segments[3])
	}
	if len(segments) >= 5 {
		field5 = strings.TrimSpace(segments[4])
	}

	if !isValidEmail(email) {
		return ParsedAccount{}, &LineError{Line: lineNo, Reason: "邮箱格式不正确"}
	}
	if len(strings.TrimSpace(password)) < 1 || len(password) > 512 || hasControlBytes(password) {
		return ParsedAccount{}, &LineError{Line: lineNo, Reason: "密码为空或长度超限"}
	}
	if len(auxiliary) < 1 || len(auxiliary) > 512 || hasControlBytes(auxiliary) {
		return ParsedAccount{}, &LineError{Line: lineNo, Reason: "第三字段（2FA密钥）为空或长度超限"}
	}
	if field4 != "" && (len(field4) > 8192 || hasControlBytes(field4)) {
		return ParsedAccount{}, &LineError{Line: lineNo, Reason: "第四字段格式不正确或长度超限"}
	}
	if field5 != "" && (len(field5) > 8192 || hasControlBytes(field5)) {
		return ParsedAccount{}, &LineError{Line: lineNo, Reason: "第五字段格式不正确或长度超限"}
	}

	acc := ParsedAccount{
		Email:     email,
		Password:  password,
		Auxiliary: auxiliary,
	}
	if field4 != "" {
		if isHTTPURL(field4) {
			acc.MailURL = field4
		} else {
			acc.AccessToken = field4
		}
	}
	if field5 != "" {
		if isHTTPURL(field5) {
			if acc.MailURL == "" {
				acc.MailURL = field5
			}
		} else if acc.RefreshToken == "" {
			acc.RefreshToken = field5
		}
	}
	return acc, nil
}

func ParseCredentialLines(text string) (ParseResult, error) {
	if len(text) > MaxCredentialInputBytes {
		return ParseResult{}, errors.New("文本超过 1MB 限制")
	}
	clean := strings.TrimPrefix(text, "\uFEFF")
	clean = strings.ReplaceAll(clean, "\r\n", "\n")
	clean = strings.ReplaceAll(clean, "\r", "\n")
	rawLines := strings.Split(clean, "\n")
	if len(rawLines) > MaxCredentialLines+1 {
		return ParseResult{}, errors.New("单次最多 1000 行")
	}

	var res ParseResult
	seen := make(map[string]struct{})
	for idx, raw := range rawLines {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") || strings.HasPrefix(trimmed, "===") {
			continue
		}
		acc, lineErr := validateCredentialLine(raw, idx+1)
		if lineErr != nil {
			res.Errors = append(res.Errors, *lineErr)
			continue
		}
		if _, exists := seen[acc.Email]; exists {
			res.Duplicates++
			continue
		}
		seen[acc.Email] = struct{}{}
		res.Accounts = append(res.Accounts, acc)
	}
	return res, nil
}

type CredentialVault struct {
	mu     sync.Mutex
	file   string
	secret string
}

func NewCredentialVault(dataDir, secret string) (*CredentialVault, error) {
	if strings.TrimSpace(dataDir) == "" {
		return nil, errors.New("缺少凭据暂存目录")
	}
	if len(strings.TrimSpace(secret)) < 12 {
		return nil, errors.New("缺少内部加密密钥")
	}
	return &CredentialVault{
		file:   filepath.Join(dataDir, "pending-credentials.enc.json"),
		secret: secret,
	}, nil
}

func (v *CredentialVault) deriveKey(salt []byte) ([]byte, error) {
	return scrypt.Key([]byte(v.secret), salt, 16384, 8, 1, 32)
}

func (v *CredentialVault) loadLocked() ([]StagedRecord, error) {
	raw, err := os.ReadFile(v.file)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []StagedRecord{}, nil
		}
		return nil, errors.New("加密暂存文件无法读取")
	}
	var doc encryptedVaultFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, errors.New("加密暂存文件无法解析，请检查文件完整性")
	}
	if doc.Version != VaultFormatVersion || doc.Salt == "" || doc.IV == "" || doc.Tag == "" || doc.Ciphertext == "" {
		return nil, errors.New("暂存文件结构无效")
	}
	salt, err := base64.StdEncoding.DecodeString(doc.Salt)
	if err != nil {
		return nil, errors.New("暂存文件盐值无效")
	}
	iv, err := base64.StdEncoding.DecodeString(doc.IV)
	if err != nil || len(iv) != 12 {
		return nil, errors.New("暂存文件 IV 无效")
	}
	tag, err := base64.StdEncoding.DecodeString(doc.Tag)
	if err != nil || len(tag) != 16 {
		return nil, errors.New("暂存文件校验标签无效")
	}
	ciphertext, err := base64.StdEncoding.DecodeString(doc.Ciphertext)
	if err != nil {
		return nil, errors.New("暂存文件密文无效")
	}
	key, err := v.deriveKey(salt)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	sealed := make([]byte, 0, len(ciphertext)+len(tag))
	sealed = append(sealed, ciphertext...)
	sealed = append(sealed, tag...)
	plaintext, err := gcm.Open(nil, iv, sealed, nil)
	if err != nil {
		return nil, errors.New("暂存文件验证失败（可能已损坏或内部密钥已更改）")
	}
	var records []StagedRecord
	if err := json.Unmarshal(plaintext, &records); err != nil {
		return nil, errors.New("暂存文件数据损坏")
	}
	if len(records) > MaxStagedAccounts {
		return nil, errors.New("暂存文件大小不合法")
	}
	return records, nil
}

func (v *CredentialVault) saveLocked(records []StagedRecord) error {
	if err := os.MkdirAll(filepath.Dir(v.file), 0700); err != nil {
		return err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	iv := make([]byte, 12)
	if _, err := rand.Read(iv); err != nil {
		return err
	}
	key, err := v.deriveKey(salt)
	if err != nil {
		return err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	plaintext, err := json.Marshal(records)
	if err != nil {
		return err
	}
	sealed := gcm.Seal(nil, iv, plaintext, nil)
	if len(sealed) < 16 {
		return errors.New("encryption failed")
	}
	ciphertext := sealed[:len(sealed)-16]
	tag := sealed[len(sealed)-16:]
	doc := encryptedVaultFile{
		Version:    VaultFormatVersion,
		Salt:       base64.StdEncoding.EncodeToString(salt),
		IV:         base64.StdEncoding.EncodeToString(iv),
		Tag:        base64.StdEncoding.EncodeToString(tag),
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
	}
	encoded, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%s.tmp", v.file, uuid.NewString()[:8])
	if err := os.WriteFile(tmp, encoded, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, v.file); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func (v *CredentialVault) List() (VaultListResponse, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return VaultListResponse{}, err
	}
	items := make([]PublicStagedItem, 0, len(records))
	for _, r := range records {
		state := r.State
		if state == "" {
			state = "pending_auth"
		}
		lastErr := r.LastError
		if len(lastErr) > 120 {
			lastErr = lastErr[:120]
		}
		items = append(items, PublicStagedItem{
			ID:             r.ID,
			Email:          r.Email,
			CreatedAt:      r.CreatedAt,
			State:          state,
			LastError:      lastErr,
			HasMailURL:     r.MailURL != "",
			HasAccessToken: r.AccessToken != "",
		})
	}
	return VaultListResponse{Count: len(items), Items: items}, nil
}

func (v *CredentialVault) Get(id string) (*StagedRecord, error) {
	if !uuidRe.MatchString(id) {
		return nil, nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return nil, err
	}
	for i := range records {
		if strings.EqualFold(records[i].ID, id) {
			rec := records[i]
			return &rec, nil
		}
	}
	return nil, nil
}

func (v *CredentialVault) GetAll() ([]StagedRecord, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.loadLocked()
}

func (v *CredentialVault) UpdateStatus(id, state, lastError string) (bool, error) {
	if !uuidRe.MatchString(id) {
		return false, nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return false, err
	}
	found := false
	for i := range records {
		if strings.EqualFold(records[i].ID, id) {
			if state == "" {
				state = "pending_auth"
			}
			records[i].State = state
			if len(lastError) > 200 {
				lastError = lastError[:200]
			}
			records[i].LastError = lastError
			found = true
			break
		}
	}
	if !found {
		return false, nil
	}
	if err := v.saveLocked(records); err != nil {
		return false, err
	}
	return true, nil
}

func (v *CredentialVault) ImportText(text string, existingEmails map[string]struct{}) (VaultImportResponse, error) {
	parsed, err := ParseCredentialLines(text)
	if err != nil {
		return VaultImportResponse{}, err
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return VaultImportResponse{}, err
	}
	seen := make(map[string]struct{}, len(records)+len(existingEmails))
	for _, r := range records {
		seen[strings.ToLower(r.Email)] = struct{}{}
	}
	for em := range existingEmails {
		if em != "" {
			seen[strings.ToLower(em)] = struct{}{}
		}
	}

	added := 0
	skipped := parsed.Duplicates
	now := time.Now().UTC().Format(time.RFC3339)
	for _, a := range parsed.Accounts {
		if _, exists := seen[a.Email]; exists {
			skipped++
			continue
		}
		if len(records) >= MaxStagedAccounts {
			return VaultImportResponse{}, errors.New("已达到 5000 条暂存账号上限")
		}
		records = append(records, StagedRecord{
			ID:           uuid.NewString(),
			Email:        a.Email,
			Password:     a.Password,
			Auxiliary:    a.Auxiliary,
			MailURL:      a.MailURL,
			AccessToken:  a.AccessToken,
			RefreshToken: a.RefreshToken,
			CreatedAt:    now,
			State:        "pending_auth",
		})
		seen[a.Email] = struct{}{}
		added++
	}
	if added > 0 {
		if err := v.saveLocked(records); err != nil {
			return VaultImportResponse{}, err
		}
	}
	errs := parsed.Errors
	if len(errs) > 100 {
		errs = errs[:100]
	}
	if errs == nil {
		errs = []LineError{}
	}
	return VaultImportResponse{
		Added:   added,
		Skipped: skipped,
		Invalid: len(parsed.Errors),
		Errors:  errs,
		Count:   len(records),
	}, nil
}

func (v *CredentialVault) UpsertFailure(acc AuthTarget, reason string) error {
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return err
	}
	if len(reason) > 200 {
		reason = reason[:200]
	}
	email := strings.ToLower(strings.TrimSpace(acc.Email))
	for i := range records {
		if (acc.ID != "" && strings.EqualFold(records[i].ID, acc.ID)) || strings.EqualFold(records[i].Email, email) {
			records[i].State = "auth_failed"
			records[i].LastError = reason
			if acc.Password != "" {
				records[i].Password = acc.Password
			}
			if acc.TOTPSecret != "" {
				records[i].Auxiliary = acc.TOTPSecret
			}
			if acc.MailURL != "" {
				records[i].MailURL = acc.MailURL
			}
			if acc.AccessToken != "" {
				records[i].AccessToken = acc.AccessToken
			}
			if acc.RefreshToken != "" {
				records[i].RefreshToken = acc.RefreshToken
			}
			return v.saveLocked(records)
		}
	}
	if len(records) >= MaxStagedAccounts {
		return errors.New("已达到 5000 条暂存账号上限")
	}
	records = append(records, StagedRecord{
		ID:           uuid.NewString(),
		Email:        email,
		Password:     acc.Password,
		Auxiliary:    acc.TOTPSecret,
		MailURL:      acc.MailURL,
		AccessToken:  acc.AccessToken,
		RefreshToken: acc.RefreshToken,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339),
		State:        "auth_failed",
		LastError:    reason,
	})
	return v.saveLocked(records)
}

func (v *CredentialVault) Delete(id string) (int, int, error) {
	if !uuidRe.MatchString(id) {
		return 0, 0, errors.New("暂存账号 ID 无效")
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return 0, 0, err
	}
	kept := make([]StagedRecord, 0, len(records))
	removed := 0
	for _, r := range records {
		if strings.EqualFold(r.ID, id) {
			removed++
			continue
		}
		kept = append(kept, r)
	}
	if removed > 0 {
		if err := v.saveLocked(kept); err != nil {
			return 0, 0, err
		}
	}
	return removed, len(kept), nil
}

func (v *CredentialVault) DeleteByEmails(emails map[string]struct{}) error {
	if len(emails) == 0 {
		return nil
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	records, err := v.loadLocked()
	if err != nil {
		return err
	}
	kept := make([]StagedRecord, 0, len(records))
	removed := 0
	for _, r := range records {
		if _, ok := emails[strings.ToLower(r.Email)]; ok {
			removed++
			continue
		}
		kept = append(kept, r)
	}
	if removed > 0 {
		return v.saveLocked(kept)
	}
	return nil
}
