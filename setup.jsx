/* global React, AlbumBackend */
/* eslint-disable react/prop-types */

// ============================================
// Setup screen — owner pastes backend credentials
// ============================================

const { useState, useEffect } = React;

function SetupField({ label, value, onChange, placeholder, type = "text", hint, secret }) {
  const [reveal, setReveal] = useState(false);
  const inputType = secret && !reveal ? "password" : "text";
  return (
    <label className="su-field">
      <div className="su-field-head">
        <span>{label}</span>
        {secret && (
          <button
            type="button"
            className="su-eye"
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? "隱藏" : "顯示"}
          </button>
        )}
      </div>
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {hint && <div className="su-hint">{hint}</div>}
    </label>
  );
}

function SetupTabs({ active, onChange }) {
  return (
    <div className="su-tabs">
      <button
        className={"su-tab" + (active === "github" ? " on" : "")}
        onClick={() => onChange("github")}
      >
        <span className="su-tab-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.57.1.78-.25.78-.55v-2.1c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.4-5.26 5.68.41.36.78 1.07.78 2.16v3.2c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
          </svg>
        </span>
        GitHub
      </button>
      <button
        className={"su-tab" + (active === "supabase" ? " on" : "")}
        onClick={() => onChange("supabase")}
      >
        <span className="su-tab-icon" aria-hidden>
          <svg viewBox="0 0 109 113" width="14" height="16" fill="currentColor">
            <path d="M63.7 110.3c-2.9 3.7-8.8 1.7-8.8-3l-.1-43.6h29.3c5.3 0 8.3 6.1 5 10.3l-25.4 36.3zM45.3 2.7c2.9-3.7 8.8-1.7 8.8 3l.1 43.6H25c-5.3 0-8.3-6.1-5-10.3L45.3 2.7z" />
          </svg>
        </span>
        Supabase
      </button>
    </div>
  );
}

function SetupScreen({ initialConfig, ownerMode, onSave, onCancel }) {
  const [active, setActive] = useState(initialConfig.active || "github");
  const [github, setGithub] = useState({ ...initialConfig.github });
  const [supabase, setSupabase] = useState({ ...initialConfig.supabase });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const updateGh = (k, v) => setGithub((p) => ({ ...p, [k]: v }));
  const updateSb = (k, v) => setSupabase((p) => ({ ...p, [k]: v }));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const conf = { active, github, supabase };
    const backend = AlbumBackend.makeBackend(conf, active);
    try {
      const r = await backend.test();
      setTestResult({ ok: true, msg: r.info });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const conf = { active, github, supabase };
    onSave(conf);
  };

  const supabaseSql = `create table photos (
  id text primary key,
  name text not null,
  file_path text not null,
  w int not null,
  h int not null,
  added_at timestamptz not null default now(),
  order_idx int not null default 0
);
alter table photos enable row level security;
create policy "anon read" on photos for select to anon using (true);
-- create a public storage bucket named "photos"`;

  return (
    <div className="su-backdrop">
      <div className="su-card">
        <div className="su-head">
          <h2>連線設定</h2>
          <p className="su-sub">
            {ownerMode
              ? "選一個後端、貼進金鑰。資料會存在你這台瀏覽器的 localStorage。"
              : "目前還沒設定，請通知管理員開啟 owner 模式做設定。"}
          </p>
        </div>

        <SetupTabs active={active} onChange={setActive} />

        {active === "github" && (
          <div className="su-body">
            <SetupField
              label="Repo"
              value={github.repo}
              onChange={(v) => updateGh("repo", v)}
              placeholder="username/repo"
              hint="必須是 public repo；範例：Tatopus/cooper"
            />
            <div className="su-row-2">
              <SetupField
                label="Branch"
                value={github.branch}
                onChange={(v) => updateGh("branch", v)}
                placeholder="main"
              />
              <SetupField
                label="資料夾"
                value={github.dir}
                onChange={(v) => updateGh("dir", v)}
                placeholder="photos"
              />
            </div>
            {ownerMode && (
              <SetupField
                label="Personal Access Token"
                value={github.token}
                onChange={(v) => updateGh("token", v)}
                placeholder="ghp_..."
                secret
                hint={
                  <span>
                    僅 owner 上傳/刪除時用。<a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noreferrer">建一個 fine-grained token</a>，只給這個 repo「Contents: Read &amp; Write」權限即可。
                  </span>
                }
              />
            )}
          </div>
        )}

        {active === "supabase" && (
          <div className="su-body">
            <SetupField
              label="Project URL"
              value={supabase.url}
              onChange={(v) => updateSb("url", v)}
              placeholder="https://xxxxxxxx.supabase.co"
            />
            <SetupField
              label="anon key（公開）"
              value={supabase.anonKey}
              onChange={(v) => updateSb("anonKey", v)}
              placeholder="eyJ..."
              secret
              hint="設定 → API → Project API keys 的 anon key"
            />
            <div className="su-row-2">
              <SetupField
                label="Storage bucket"
                value={supabase.bucket}
                onChange={(v) => updateSb("bucket", v)}
                placeholder="photos"
              />
              <SetupField
                label="Table"
                value={supabase.table}
                onChange={(v) => updateSb("table", v)}
                placeholder="photos"
              />
            </div>
            {ownerMode && (
              <SetupField
                label="service_role key"
                value={supabase.serviceKey}
                onChange={(v) => updateSb("serviceKey", v)}
                placeholder="eyJ..."
                secret
                hint="只 owner 寫入時使用；不會傳給其他人"
              />
            )}
            <details className="su-help">
              <summary>第一次用？需要先做這些 ↓</summary>
              <ol>
                <li>建立 Supabase 專案</li>
                <li>Storage → New bucket：取名 <code>photos</code>，勾「Public bucket」</li>
                <li>SQL Editor 跑下面這段：</li>
              </ol>
              <pre>{supabaseSql}</pre>
            </details>
          </div>
        )}

        <div className="su-test">
          <button
            type="button"
            className="su-btn ghost"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? "測試中…" : "測試連線"}
          </button>
          {testResult && (
            <span className={"su-test-msg " + (testResult.ok ? "ok" : "fail")}>
              {testResult.ok ? "✓ " : "✗ "}{testResult.msg}
            </span>
          )}
        </div>

        <div className="su-foot">
          {onCancel && (
            <button type="button" className="su-btn ghost" onClick={onCancel}>
              取消
            </button>
          )}
          <button type="button" className="su-btn primary" onClick={handleSave}>
            儲存並使用 {active === "github" ? "GitHub" : "Supabase"}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SetupScreen });
