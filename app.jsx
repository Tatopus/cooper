/* global React, ReactDOM, AlbumBackend, Gallery, Lightbox, SetupScreen, TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSlider, TweakSelect */

const { useState, useEffect, useCallback, useRef } = React;

// Owner mode if the URL has any ?owner=… param.
function isOwnerMode() {
  return new URLSearchParams(window.location.search).has("owner");
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "aesthetic": "paper",
  "mode": "auto",
  "columns": 3,
  "gap": "medium",
  "backend": "github"
}/*EDITMODE-END*/;

const GAP_PX = { tight: 8, medium: 18, roomy: 28 };

function useColumnsResponsive(targetCols) {
  const [cols, setCols] = useState(targetCols);
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      let c = targetCols;
      if (w < 540) c = Math.min(targetCols, 2);
      else if (w < 820) c = Math.min(targetCols, 2);
      else if (w < 1100) c = Math.min(targetCols, 3);
      setCols(c);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [targetCols]);
  return cols;
}

function Header({ owner, count, backendName, onOpenSettings }) {
  return (
    <header className="header">
      <div className="title-block">
        <h1 className="title">窟小狗的日常</h1>
        <p className="subtitle">
          <span>Cooper&rsquo;s daily archive</span>
          <span className="dot" />
          <span>{count} {count === 1 ? "photo" : "photos"}</span>
          <span className="dot" />
          <span>{backendName === "github" ? "github" : "supabase"}</span>
        </p>
      </div>
      <div className="meta">
        <span className={"mode-pill" + (owner ? " owner" : "")}>
          <span className="indicator" />
          {owner ? "Owner" : "Viewer"}
        </span>
        {owner && (
          <button className="icon-btn" title="連線設定" onClick={onOpenSettings} aria-label="連線設定">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

function OwnerBar({ onPick, busy }) {
  const inputRef = useRef(null);
  return (
    <div className="owner-bar">
      <button
        className="btn-fab"
        onClick={() => !busy && inputRef.current && inputRef.current.click()}
        disabled={busy}
      >
        <span className="plus">{busy ? "…" : "＋"}</span>
        {busy ? "上傳中" : "上傳照片"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onPick(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function DropOverlay({ show }) {
  return (
    <div className={"drop-overlay" + (show ? " show" : "")}>
      <div className="box">
        <h2>放開就上傳</h2>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 14 }}>Drop your photos anywhere</p>
      </div>
    </div>
  );
}

function Toast({ text, kind }) {
  return <div className={"toast" + (text ? " show" : "") + (kind === "error" ? " toast-error" : "")}>{text}</div>;
}

function ProgressBar({ done, total }) {
  if (!total) return null;
  return (
    <div className="progress-card">
      <div className="progress-head">
        <span>上傳中</span>
        <span className="progress-count">{done} / {total}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    </div>
  );
}

function NotConfigured({ owner, onSetup }) {
  return (
    <div className="empty notconf">
      <h3>還沒連上後端</h3>
      <p>
        {owner
          ? "請先設定 GitHub 或 Supabase 後再使用。"
          : "管理員還沒設定好相簿。請稍候再來。"}
      </p>
      {owner && (
        <button className="su-btn primary" style={{ marginTop: 16 }} onClick={onSetup}>
          開始設定
        </button>
      )}
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="empty notconf">
      <h3>讀取失敗</h3>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, whiteSpace: "pre-wrap" }}>{message}</p>
      {onRetry && (
        <button className="su-btn primary" style={{ marginTop: 16 }} onClick={onRetry}>
          重試
        </button>
      )}
    </div>
  );
}

function AlbumTweaks({ tweaks, setTweak, activeBackend }) {
  return (
    <TweaksPanel>
      <TweakSection label="Backend">
        <TweakRadio
          label="後端"
          value={activeBackend}
          onChange={(v) => setTweak("backend", v)}
          options={[
            { value: "github",   label: "GitHub" },
            { value: "supabase", label: "Supabase" },
          ]}
        />
      </TweakSection>
      <TweakSection label="Aesthetic">
        <TweakSelect
          label="風格"
          value={tweaks.aesthetic}
          onChange={(v) => setTweak("aesthetic", v)}
          options={[
            { value: "paper",     label: "Paper · 紙感襯線" },
            { value: "minimal",   label: "Minimal · 極簡冷色" },
            { value: "gallery",   label: "Gallery · 美術館深色" },
            { value: "editorial", label: "Editorial · 雜誌排版" },
          ]}
        />
        <TweakRadio
          label="色調"
          value={tweaks.mode}
          onChange={(v) => setTweak("mode", v)}
          options={[
            { value: "auto",  label: "預設" },
            { value: "light", label: "淺色" },
            { value: "dark",  label: "深色" },
          ]}
        />
      </TweakSection>
      <TweakSection label="Layout">
        <TweakSlider
          label="每行幾張"
          min={2}
          max={5}
          step={1}
          value={tweaks.columns}
          onChange={(v) => setTweak("columns", v)}
        />
        <TweakRadio
          label="間距"
          value={tweaks.gap}
          onChange={(v) => setTweak("gap", v)}
          options={[
            { value: "tight",  label: "緊" },
            { value: "medium", label: "中" },
            { value: "roomy",  label: "寬" },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

function App() {
  const owner = isOwnerMode();
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // ----- Config -----
  const [config, setConfig] = useState(() => AlbumBackend.loadConfig());
  const activeBackend = tweaks.backend || config.active || "github";

  // ----- Photos / loading -----
  const [photos, setPhotos] = useState([]);
  const [phase, setPhase] = useState("loading"); // loading | ok | unconfigured | error
  const [error, setError] = useState(null);

  // ----- UI state -----
  const [showSetup, setShowSetup] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const [uploadProg, setUploadProg] = useState({ done: 0, total: 0 });
  const toastTimer = useRef(null);
  const backendRef = useRef(null);

  // ----- Aesthetic / layout -----
  const defaultMode = tweaks.aesthetic === "gallery" ? "dark" : "light";
  const mode = tweaks.mode === "auto" ? defaultMode : tweaks.mode;
  const responsiveCols = useColumnsResponsive(tweaks.columns);

  useEffect(() => {
    document.body.setAttribute("data-a", tweaks.aesthetic);
    document.body.setAttribute("data-m", mode);
    document.documentElement.style.setProperty("--col-count", responsiveCols);
    document.documentElement.style.setProperty("--col-gap", GAP_PX[tweaks.gap] + "px");
  }, [tweaks.aesthetic, mode, responsiveCols, tweaks.gap]);

  // ----- Toast helper -----
  const showToast = useCallback((msg, kind) => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ----- Load photos from backend -----
  const loadPhotos = useCallback(async () => {
    if (!AlbumBackend.configIsReadable(config, activeBackend)) {
      setPhase("unconfigured");
      backendRef.current = null;
      setPhotos([]);
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      const backend = AlbumBackend.makeBackend(config, activeBackend);
      await backend.init();
      const list = await backend.list();
      backendRef.current = backend;
      setPhotos(list);
      setPhase("ok");
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setPhase("error");
    }
  }, [config, activeBackend]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // ----- Save config from setup screen -----
  const handleSaveConfig = (conf) => {
    AlbumBackend.saveConfig(conf);
    setConfig(conf);
    // Match the tweak to whichever backend they just set as active.
    if (conf.active && conf.active !== activeBackend) {
      setTweak("backend", conf.active);
    }
    setShowSetup(false);
    showToast("已儲存設定");
  };

  // ----- Upload -----
  const upload = useCallback(async (files) => {
    if (!owner) return;
    const backend = backendRef.current;
    if (!backend) {
      showToast("還沒設定好後端", "error");
      return;
    }
    if (!AlbumBackend.configIsWritable(config, activeBackend)) {
      showToast(activeBackend === "github" ? "請先填 GitHub Token" : "請先填 service_role key", "error");
      setShowSetup(true);
      return;
    }
    const validFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!validFiles.length) {
      showToast("沒有可上傳的圖檔", "error");
      return;
    }

    setUploadProg({ done: 0, total: validFiles.length });
    const startOrder = photos.length;
    const added = [];
    let ok = 0;
    for (let i = 0; i < validFiles.length; i++) {
      try {
        const rec = await backend.upload(validFiles[i], startOrder + i);
        added.push(rec);
        setPhotos((prev) => [...prev, rec]);
        ok++;
      } catch (e) {
        console.error(e);
        showToast("上傳失敗：" + (e.message || e), "error");
      }
      setUploadProg({ done: i + 1, total: validFiles.length });
    }
    setUploadProg({ done: 0, total: 0 });
    if (ok > 0) showToast(`已上傳 ${ok} 張`);
  }, [owner, photos.length, config, activeBackend, showToast]);

  // ----- Delete -----
  const remove = useCallback(async (photo) => {
    if (!owner) return;
    if (!window.confirm("確定要刪除這張嗎？")) return;
    const backend = backendRef.current;
    if (!backend) return;
    try {
      await backend.remove(photo);
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photo.id);
        setLightboxIndex((cur) => {
          if (cur === null) return null;
          if (next.length === 0) return null;
          if (cur >= next.length) return next.length - 1;
          return cur;
        });
        return next;
      });
      showToast("已刪除");
    } catch (e) {
      console.error(e);
      showToast("刪除失敗：" + (e.message || e), "error");
    }
  }, [owner, showToast]);

  // ----- Download -----
  const download = useCallback(async (photo) => {
    try {
      const backend = backendRef.current;
      if (backend && backend.download) {
        await backend.download(photo);
      } else {
        await AlbumBackend.downloadFromUrl(photo.downloadSrc, photo.name);
      }
    } catch (e) {
      console.error(e);
      showToast("下載失敗", "error");
    }
  }, [showToast]);

  // ----- Drag & drop -----
  useEffect(() => {
    if (!owner) return;
    let depth = 0;
    const onEnter = (e) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      depth++;
      setDragOver(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragOver(false);
    };
    const onOver = (e) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
    };
    const onDrop = (e) => {
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) upload(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [owner, upload]);

  // ----- Lightbox -----
  const openLb = useCallback((photo) => {
    const idx = photos.findIndex((p) => p.id === photo.id);
    setLightboxIndex(idx >= 0 ? idx : null);
  }, [photos]);
  const closeLb = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)),
    [photos.length]
  );
  const next = useCallback(
    () => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length]
  );

  // ----- Auto-open setup if owner + unconfigured -----
  const needsSetup = owner && phase === "unconfigured";
  useEffect(() => {
    if (needsSetup && !showSetup) setShowSetup(true);
  }, [needsSetup]);

  // ----- Render -----
  let body;
  if (phase === "loading") {
    body = <div className="empty"><h3>載入中…</h3></div>;
  } else if (phase === "unconfigured") {
    body = <NotConfigured owner={owner} onSetup={() => setShowSetup(true)} />;
  } else if (phase === "error") {
    body = <ErrorCard message={error} onRetry={loadPhotos} />;
  } else {
    body = <Gallery photos={photos} owner={owner} onOpen={openLb} onDelete={remove} />;
  }

  return (
    <>
      <div className="page">
        <Header
          owner={owner}
          count={photos.length}
          backendName={activeBackend}
          onOpenSettings={() => setShowSetup(true)}
        />
        {body}
        <footer className="footer">
          <span>Cooper&rsquo;s album · {photos.length.toString().padStart(3, "0")}</span>
          <span>
            {owner
              ? "Owner mode · " + (activeBackend === "github" ? "GitHub" : "Supabase")
              : "Viewer mode · click a photo to enlarge"}
          </span>
        </footer>
      </div>

      {owner && phase === "ok" && (
        <OwnerBar onPick={upload} busy={uploadProg.total > 0} />
      )}
      {owner && <DropOverlay show={dragOver} />}

      <Lightbox
        photos={photos}
        index={lightboxIndex}
        owner={owner}
        onClose={closeLb}
        onPrev={prev}
        onNext={next}
        onDelete={remove}
        onDownload={download}
      />

      {uploadProg.total > 0 && (
        <ProgressBar done={uploadProg.done} total={uploadProg.total} />
      )}

      <Toast text={toast?.msg} kind={toast?.kind} />

      {showSetup && (
        <SetupScreen
          initialConfig={{ ...config, active: activeBackend }}
          ownerMode={owner}
          onSave={handleSaveConfig}
          onCancel={phase === "ok" ? () => setShowSetup(false) : null}
        />
      )}

      <AlbumTweaks tweaks={tweaks} setTweak={setTweak} activeBackend={activeBackend} />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
