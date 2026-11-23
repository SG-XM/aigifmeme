const SESSION_KEY = "chatgpt2api_session";
const MOUNT_ATTR = "data-c2a-bulk-import";
const MODAL_OPTION_ATTR = "data-c2a-bulk-option";

function getSessionKey() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.key === "string" ? parsed.key : "";
  } catch {
    return "";
  }
}

async function vaultRequest(path, { method = "GET", body } = {}) {
  const key = getSessionKey();
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const resp = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401) {
    localStorage.removeItem(SESSION_KEY);
    location.replace("/login");
    throw new Error("未授权，请重新登录");
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg =
      data?.detail?.error ||
      data?.error ||
      data?.message ||
      `请求失败（${resp.status}）`;
    throw new Error(String(msg));
  }
  return data;
}

function injectStyles() {
  if (document.getElementById("c2a-bulk-import-style")) return;
  const style = document.createElement("style");
  style.id = "c2a-bulk-import-style";
  style.textContent = `
    .c2a-bulk-panel { padding: 18px 20px; display: grid; gap: 12px; }
    .c2a-bulk-title { font-size: 15px; font-weight: 700; margin: 0; }
    .c2a-bulk-tip {
      background: #f0f7ff; border: 1px solid #c7defa; color: #244775;
      border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.6;
    }
    .c2a-bulk-tip a { color: #2257d4; font-weight: 600; text-decoration: underline; }
    .c2a-bulk-guide {
      background: #f8fafd; border: 1px solid #dbe6f5; border-radius: 10px;
      padding: 12px 15px; font-size: 12px; line-height: 1.6; display: grid; gap: 6px;
    }
    .c2a-bulk-guide-head { font-weight: 700; color: #1e3a68; }
    .c2a-bulk-badge {
      display: inline-block; background: #e6efff; color: #1c4bb5;
      padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-right: 6px;
    }
    .c2a-bulk-badge-muted {
      display: inline-block; background: #edf1f7; color: #4c5c75;
      padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-right: 6px;
    }
    .c2a-bulk-code {
      background: #edf2f9; padding: 2px 6px; border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
      word-break: break-all;
    }
    .c2a-bulk-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .c2a-bulk-msg {
      border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.5;
    }
    .c2a-bulk-msg.info { background: #eef6ff; border: 1px solid #c5ddfb; color: #1e4378; }
    .c2a-bulk-msg.error { background: #fff1f2; border: 1px solid #fecdd3; color: #9f1239; }
    .c2a-bulk-msg ul { margin: 6px 0 0 18px; padding: 0; }
    .c2a-bulk-staged-head {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 4px; gap: 8px; flex-wrap: wrap;
    }
    .c2a-bulk-staged-head h4 { margin: 0; font-size: 14px; font-weight: 600; }
    .c2a-bulk-err-small { display: block; color: #dc2626; font-size: 12px; margin-top: 2px; }
    @media (prefers-color-scheme: dark) {
      .c2a-bulk-tip { background: rgba(37, 99, 235, 0.14); border-color: rgba(96, 165, 250, 0.35); color: #dbeafe; }
      .c2a-bulk-tip a { color: #93c5fd; }
      .c2a-bulk-guide { background: rgba(148, 163, 184, 0.08); border-color: rgba(148, 163, 184, 0.25); color: #cbd5e1; }
      .c2a-bulk-guide-head { color: #e2e8f0; }
      .c2a-bulk-badge { background: rgba(59, 130, 246, 0.25); color: #bfdbfe; }
      .c2a-bulk-badge-muted { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
      .c2a-bulk-code { background: rgba(15, 23, 42, 0.5); color: #e2e8f0; }
      .c2a-bulk-msg.info { background: rgba(37, 99, 235, 0.14); border-color: rgba(96, 165, 250, 0.35); color: #dbeafe; }
      .c2a-bulk-msg.error { background: rgba(225, 29, 72, 0.15); border-color: rgba(251, 113, 133, 0.35); color: #fecdd3; }
    }
  `;
  document.head.appendChild(style);
}

function triggerAccountsTableRefresh(pageEl) {
  try {
    const data = window.Alpine?.$data?.(pageEl);
    if (data && typeof data.loadAccounts === "function") {
      data.loadAccounts();
      return;
    }
  } catch {}
  const btns = pageEl.querySelectorAll(".page-head button");
  for (const btn of btns) {
    if (btn.textContent.includes("刷新")) {
      btn.click();
      break;
    }
  }
}

function buildBulkPanel(pageEl) {
  const section = document.createElement("section");
  section.className = "panel c2a-bulk-panel";
  section.setAttribute(MOUNT_ATTR, "1");

  section.innerHTML = `
    <h3 class="c2a-bulk-title">邮箱 / 密码 / 第三字段批量导入（每行一条）</h3>
    <div class="c2a-bulk-tip">
      💡 提示：可以上 <a href="https://priceai.cc/" target="_blank" rel="noopener noreferrer">https://priceai.cc/</a> 买几分钱的普号（一般 5 毛钱可以买 10 个）。购买提取后直接粘贴在下方文本框，点击「导入并授权入池」即可。
    </div>
    <div class="c2a-bulk-guide">
      <div class="c2a-bulk-guide-head">📋 支持导入的账号格式规范（每行一条，分隔符支持 ---- 或 ---）：</div>
      <div><span class="c2a-bulk-badge">格式 1 标准三字段</span><code class="c2a-bulk-code">邮箱----密码----2FA密钥</code> <span class="text-xs text-muted">（自动通过 OAuth + TOTP 登录换取 Token 加入号池）</span></div>
      <div><span class="c2a-bulk-badge">格式 2 卡密带邮箱链接</span><code class="c2a-bulk-code">邮箱----密码----2FA密钥----https://mail.xxx.store/...</code> <span class="text-xs text-muted">（第四字段为网页邮箱/接码链接，系统自动识别并使用前三项自动登录）</span></div>
      <div><span class="c2a-bulk-badge">格式 3 带已生成 Token</span><code class="c2a-bulk-code">邮箱----密码----2FA密钥----eyJhbGci...</code> <span class="text-xs text-muted">（第四字段为有效 access_token 时优先直接复用入池，过期会自动重新登录）</span></div>
      <div><span class="c2a-bulk-badge-muted">文本文件导入</span>点击下方「选择账号文本文件（.txt）」可直接选择包含上述格式的本地 txt 文件，自动加载入框。</div>
    </div>
    <div>
      <label class="field-label" style="display:block;margin-bottom:6px;" for="c2a-bulk-file">📁 选择账号文本文件（.txt）：</label>
      <input id="c2a-bulk-file" type="file" accept=".txt,text/plain" class="file-input file-input-sm" aria-label="导入账号文本文件">
    </div>
    <textarea id="c2a-bulk-textarea" class="textarea textarea-sm mono" rows="5" spellcheck="false" autocomplete="off" aria-label="一行一条账号凭据文本" placeholder="yarrow.89.commons@icloud.com----@8PL3X4nXpXTmeN%----T7MXFNYRY5JZZYL2NNGGRLV6KTO3CQYX----https://mail.bsf94666.store/...\nsecond@example.com----your-password----2fa-secret"></textarea>
    <div class="c2a-bulk-actions">
      <button type="button" class="btn btn-sm btn-primary" data-role="auth">导入并授权入池</button>
      <button type="button" class="btn btn-sm" data-role="stage">仅加密暂存</button>
      <button type="button" class="btn btn-sm btn-ghost" data-role="clear">清空输入</button>
      <button type="button" class="btn btn-sm" data-role="refresh">刷新列表</button>
    </div>
    <div data-role="error" class="c2a-bulk-msg error" hidden></div>
    <div data-role="feedback" class="c2a-bulk-msg info" hidden></div>
    <div class="c2a-bulk-staged-head">
      <h4 data-role="staged-title">本地待授权记录（0）</h4>
      <button type="button" class="btn btn-sm" data-role="auth-all" hidden>全部授权入池</button>
    </div>
    <div data-role="staged-body"></div>
  `;

  const fileInput = section.querySelector("#c2a-bulk-file");
  const textarea = section.querySelector("#c2a-bulk-textarea");
  const btnAuth = section.querySelector('[data-role="auth"]');
  const btnStage = section.querySelector('[data-role="stage"]');
  const btnClear = section.querySelector('[data-role="clear"]');
  const btnRefresh = section.querySelector('[data-role="refresh"]');
  const errBox = section.querySelector('[data-role="error"]');
  const fbBox = section.querySelector('[data-role="feedback"]');
  const stagedTitle = section.querySelector('[data-role="staged-title"]');
  const btnAuthAll = section.querySelector('[data-role="auth-all"]');
  const stagedBody = section.querySelector('[data-role="staged-body"]');

  let busy = false;
  let items = [];

  function syncButtons() {
    const hasText = Boolean(textarea.value.trim());
    btnAuth.disabled = busy || !hasText;
    btnStage.disabled = busy || !hasText;
    btnRefresh.disabled = busy;
    btnAuthAll.disabled = busy;
    btnAuth.textContent = busy ? "正在登录并换取 Token…" : "导入并授权入池";
    btnAuthAll.textContent = busy ? "处理中…" : "全部授权入池";
    btnAuthAll.hidden = items.length === 0;
  }

  function showError(msg) {
    if (!msg) {
      errBox.hidden = true;
      errBox.textContent = "";
      return;
    }
    errBox.textContent = msg;
    errBox.hidden = false;
  }

  function renderFeedback(data, isAuth) {
    if (!data) {
      fbBox.hidden = true;
      fbBox.replaceChildren();
      return;
    }
    const frag = document.createDocumentFragment();
    const summary = document.createElement("div");
    if (isAuth) {
      const enrolled = data.enrolled || {};
      const dupTotal = Number(enrolled.skipped || 0) + Number(data.duplicates || 0);
      const dupNote = dupTotal > 0 ? `，重复跳过 ${dupTotal}` : "";
      summary.textContent = `完成：成功授权并入池 ${data.succeeded || 0} 个账号（新增 ${enrolled.added || 0}，刷新 ${enrolled.refreshed || 0}${dupNote}）；失败 ${data.failed || 0} 个。`;
    } else {
      summary.textContent = `加密暂存 ${data.added || 0} 条；重复跳过 ${data.skipped || 0} 条；格式错误 ${data.invalid || 0} 行。`;
    }
    frag.appendChild(summary);

    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const ul = document.createElement("ul");
      for (const e of data.errors) {
        const li = document.createElement("li");
        li.textContent = `第 ${e.line} 行：${e.reason}`;
        ul.appendChild(li);
      }
      frag.appendChild(ul);
    }
    if (Array.isArray(data.failures) && data.failures.length > 0) {
      const ul = document.createElement("ul");
      for (const f of data.failures) {
        const li = document.createElement("li");
        li.textContent = `${f.email}：${f.error}`;
        ul.appendChild(li);
      }
      frag.appendChild(ul);
    }
    fbBox.replaceChildren(frag);
    fbBox.hidden = false;
  }

  function renderStaged() {
    stagedTitle.textContent = `本地待授权记录（${items.length}）`;
    btnAuthAll.hidden = items.length === 0;
    if (items.length === 0) {
      const p = document.createElement("p");
      p.className = "text-xs text-muted";
      p.textContent = "没有待授权记录。成功授权的账号已自动进入上方「可用 Token 号池」。密码及第三字段不会在页面中回显。";
      stagedBody.replaceChildren(p);
      syncButtons();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "table table-sm";
    table.innerHTML = `<thead><tr><th>邮箱</th><th class="text-center">状态</th><th class="col-actions">操作</th></tr></thead>`;
    const tbody = document.createElement("tbody");

    for (const item of items.slice(0, 300)) {
      const tr = document.createElement("tr");

      const tdEmail = document.createElement("td");
      const strong = document.createElement("strong");
      strong.textContent = item.email || "—";
      tdEmail.appendChild(strong);
      if (item.lastError) {
        const errSmall = document.createElement("small");
        errSmall.className = "c2a-bulk-err-small";
        errSmall.textContent = item.lastError;
        tdEmail.appendChild(errSmall);
      }

      const tdState = document.createElement("td");
      tdState.className = "text-center";
      const badge = document.createElement("span");
      const failed = item.state === "auth_failed";
      badge.className = `badge badge-sm badge-soft ${failed ? "badge-error" : "badge-warning"}`;
      badge.textContent = failed ? "授权失败" : "待授权";
      tdState.appendChild(badge);

      const tdAct = document.createElement("td");
      tdAct.className = "col-actions";
      const actRow = document.createElement("div");
      actRow.className = "row row-xs";

      const oneBtn = document.createElement("button");
      oneBtn.type = "button";
      oneBtn.className = "btn btn-xs btn-primary";
      oneBtn.textContent = "授权入池";
      oneBtn.disabled = busy;
      oneBtn.addEventListener("click", () => runAuth({ id: item.id }));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-xs btn-ghost text-danger";
      delBtn.textContent = "删除";
      delBtn.disabled = busy;
      delBtn.addEventListener("click", () => deleteStaged(item.id));

      actRow.append(oneBtn, delBtn);
      tdAct.appendChild(actRow);

      tr.append(tdEmail, tdState, tdAct);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    stagedBody.replaceChildren(wrap);
    syncButtons();
  }

  async function loadStaged() {
    try {
      const res = await vaultRequest("/api/local/credential-vault");
      items = Array.isArray(res?.items) ? res.items : [];
      renderStaged();
    } catch (e) {
      showError(e.message);
    }
  }

  async function runStageOnly() {
    const text = textarea.value;
    if (!text.trim() || busy) return;
    busy = true;
    showError("");
    renderFeedback(null);
    syncButtons();
    try {
      const res = await vaultRequest("/api/local/credential-vault", {
        method: "POST",
        body: { text, autoAuth: false },
      });
      renderFeedback(res, false);
      if ((res.added || 0) > 0 && (res.invalid || 0) === 0) {
        textarea.value = "";
      }
      await loadStaged();
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
      syncButtons();
      renderStaged();
    }
  }

  async function runAuth(payload) {
    if (busy) return;
    busy = true;
    showError("");
    renderFeedback(null);
    syncButtons();
    try {
      const isDirect = Boolean(payload?.text);
      const url = isDirect
        ? "/api/local/credential-vault"
        : "/api/local/credential-vault/authenticate";
      const body = isDirect ? { text: payload.text, autoAuth: true } : payload;
      const res = await vaultRequest(url, { method: "POST", body });
      renderFeedback(res, true);
      if (isDirect && (res.succeeded || 0) > 0 && (res.failed || 0) === 0 && (res.invalid || 0) === 0) {
        textarea.value = "";
      }
      await loadStaged();
      if ((res.succeeded || 0) > 0) {
        triggerAccountsTableRefresh(pageEl);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
      syncButtons();
      renderStaged();
    }
  }

  async function deleteStaged(id) {
    if (busy) return;
    busy = true;
    showError("");
    syncButtons();
    try {
      await vaultRequest(`/api/local/credential-vault/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await loadStaged();
    } catch (e) {
      showError(e.message);
    } finally {
      busy = false;
      syncButtons();
      renderStaged();
    }
  }

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) {
      showError("TXT 文件超过 1MB 限制");
      return;
    }
    try {
      const text = await file.text();
      textarea.value = textarea.value.trim()
        ? `${textarea.value.replace(/\s+$/, "")}\n${text}`
        : text;
      showError("");
      renderFeedback(null);
      syncButtons();
    } catch (e) {
      showError(`读取文件失败：${e.message}`);
    }
  });

  textarea.addEventListener("input", () => {
    showError("");
    renderFeedback(null);
    syncButtons();
  });

  btnAuth.addEventListener("click", () => runAuth({ text: textarea.value }));
  btnStage.addEventListener("click", runStageOnly);
  btnClear.addEventListener("click", () => {
    textarea.value = "";
    showError("");
    renderFeedback(null);
    syncButtons();
  });
  btnRefresh.addEventListener("click", () => {
    void loadStaged();
    triggerAccountsTableRefresh(pageEl);
  });
  btnAuthAll.addEventListener("click", () => runAuth({ all: true }));

  syncButtons();
  void loadStaged();
  return section;
}

function attachModalShortcut(pageEl) {
  const menu = pageEl.querySelector('dialog.modal div.vstack.vstack-sm');
  if (!menu || menu.querySelector(`[${MODAL_OPTION_ATTR}]`)) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "option-card";
  btn.setAttribute(MODAL_OPTION_ATTR, "1");
  btn.innerHTML = `
    <ui-icon name="upload"></ui-icon>
    <span class="vstack vstack-xs grow">
      <span class="text-strong">批量账号密码 / 2FA 导入</span>
      <span class="text-xs text-muted">支持 邮箱----密码----2FA / 卡密链接 / Token（---- 或 --- 分隔）</span>
    </span>
    <ui-icon name="chevron-right" class="icon-sm text-subtle"></ui-icon>
  `;
  btn.addEventListener("click", () => {
    const dlg = pageEl.querySelector("dialog.modal");
    if (dlg && typeof dlg.close === "function") dlg.close();
    const panel = pageEl.querySelector(`[${MOUNT_ATTR}]`);
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.querySelector("textarea")?.focus();
    }
  });
  menu.prepend(btn);
}

function maybeMount() {
  const pageEl = document.querySelector('#view [x-data="accounts"]');
  if (!pageEl) return;
  injectStyles();
  attachModalShortcut(pageEl);

  const tablePanel = pageEl.querySelector("section.panel.panel-flush");
  if (!tablePanel || !tablePanel.parentElement) return;
  if (tablePanel.parentElement.querySelector(`[${MOUNT_ATTR}]`)) return;

  const panel = buildBulkPanel(pageEl);
  tablePanel.parentElement.insertBefore(panel, tablePanel);
}

function startObserver() {
  maybeMount();
  const view = document.getElementById("view");
  if (!view) return;
  const observer = new MutationObserver(() => {
    maybeMount();
  });
  observer.observe(view, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserver);
} else {
  startObserver();
}
