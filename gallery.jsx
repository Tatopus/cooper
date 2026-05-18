/* global React, ReactDOM */
/* eslint-disable react/prop-types */

// ============================================
// Gallery + Lightbox — backend-agnostic
// Photo records carry `src` and `downloadSrc`; download() is provided.
// ============================================

const { useState, useEffect, useCallback, useRef, useMemo } = React;

function Tile({ photo, owner, onOpen, onDelete }) {
  const [loaded, setLoaded] = useState(false);
  const ar = photo.w && photo.h ? photo.w / photo.h : 1;

  return (
    <figure
      className={"tile" + (loaded ? " loaded" : "")}
      onClick={() => onOpen(photo)}
    >
      <div className="ph" style={{ aspectRatio: ar }}>
        <img
          src={photo.src}
          alt={photo.name || ""}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{ aspectRatio: ar }}
        />
        <div className="skel" />
      </div>
      {owner && (
        <button
          className="tile-del"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(photo);
          }}
          aria-label="刪除照片"
          title="刪除"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      )}
    </figure>
  );
}

function Gallery({ photos, owner, onOpen, onDelete }) {
  if (photos.length === 0) {
    return (
      <div className="empty">
        <h3>還沒有照片</h3>
        <p>{owner ? "點右下角的按鈕，或直接把照片拖進來。" : "之後再來看看吧。"}</p>
      </div>
    );
  }
  return (
    <div className="gallery">
      {photos.map((p) => (
        <Tile key={p.id} photo={p} owner={owner} onOpen={onOpen} onDelete={onDelete} />
      ))}
    </div>
  );
}

function Lightbox({ photos, index, owner, onClose, onPrev, onNext, onDelete, onDownload }) {
  const open = index !== null && index >= 0;
  const photo = open ? photos[index] : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  return (
    <div className={"lb" + (open ? " open" : "")} onClick={onClose}>
      {photo && (
        <>
          <div className="lb-bar">
            <span>{String(index + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}</span>
          </div>
          <div className="lb-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="lb-btn"
              onClick={() => onDownload(photo)}
              title="下載"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              下載
            </button>
            {owner && (
              <button
                className="lb-btn danger"
                onClick={() => { onDelete(photo); }}
                title="刪除"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                刪除
              </button>
            )}
            <button className="lb-btn" onClick={onClose} title="關閉">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {photos.length > 1 && (
            <>
              <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="上一張">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="下一張">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          )}

          <div className="lb-img-wrap" onClick={(e) => e.stopPropagation()}>
            <img src={photo.src} alt={photo.name || ""} />
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { Tile, Gallery, Lightbox });
