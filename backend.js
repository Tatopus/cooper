/* =========================================================================
   Cooper Album — backends
   Two pluggable storage backends with a shared interface.

   Photo record (unified):
   {
     id, name, src, downloadSrc, w, h, addedAt, order,
     backend, sha?, filePath?
   }
   ========================================================================= */

(function () {
  const LS_KEY = "cooper-album-config";

  // ------- Config persistence -------------------------------------------
  function defaultConfig() {
    return {
      active: "github",
      github: {
        repo: "Tatopus/cooper",  // pre-filled — user gave us this
        branch: "main",
        dir: "photos",
        token: "",              // owner-only
      },
      supabase: {
        url: "",
        anonKey: "",
        serviceKey: "",         // owner-only
        bucket: "photos",
        table: "photos",
      },
    };
  }

  function loadConfig() {
    let conf = defaultConfig();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // deep-merge by section so missing fields fall back to defaults
        conf = {
          active: parsed.active || conf.active,
          github: { ...conf.github, ...(parsed.github || {}) },
          supabase: { ...conf.supabase, ...(parsed.supabase || {}) },
        };
      }
    } catch (e) { /* ignore */ }
    return conf;
  }

  function saveConfig(conf) {
    localStorage.setItem(LS_KEY, JSON.stringify(conf));
  }

  function configIsReadable(conf, backend) {
    if (backend === "github") {
      return !!(conf.github.repo && conf.github.branch && conf.github.dir);
    }
    if (backend === "supabase") {
      return !!(conf.supabase.url && conf.supabase.anonKey);
    }
    return false;
  }

  function configIsWritable(conf, backend) {
    if (!configIsReadable(conf, backend)) return false;
    if (backend === "github") return !!conf.github.token;
    if (backend === "supabase") return !!conf.supabase.serviceKey;
    return false;
  }

  // ------- Helpers -------------------------------------------------------
  function uid() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        const i = r.indexOf(",");
        resolve(i >= 0 ? r.slice(i + 1) : r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function readImageDims(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = src;
    });
  }

  function safeName(file) {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
    return `${ts}-${rand}${ext}`;
  }

  function extToMime(name) {
    const ext = (name.match(/\.([a-z0-9]+)$/i) || ["", "jpg"])[1].toLowerCase();
    return {
      jpg: "image/jpeg", jpeg: "image/jpeg",
      png: "image/png", gif: "image/gif",
      webp: "image/webp", heic: "image/heic", heif: "image/heif",
      avif: "image/avif",
    }[ext] || "application/octet-stream";
  }

  async function downloadFromUrl(src, filename) {
    // Fetch as blob so cross-origin URLs honor the download attribute.
    const res = await fetch(src);
    if (!res.ok) throw new Error("download fetch failed: " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =========================================================================
  // GITHUB BACKEND
  // Reads:  jsdelivr CDN (no rate limit, public repos)
  // Writes: GitHub Contents API (needs PAT with repo scope)
  // Photos:  /<dir>/<file>
  // Manifest: /manifest.json (array of records + per-photo sha for deletes)
  // =========================================================================
  class GitHubBackend {
    constructor(conf) {
      this.conf = conf.github;
      this._manifest = null;
      this._manifestSha = null;
    }

    get name() { return "github"; }

    _cdnUrl(path) {
      const { repo, branch } = this.conf;
      // jsdelivr; bust cache with timestamp on every load
      return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${path}`;
    }

    _rawUrl(path) {
      const { repo, branch } = this.conf;
      return `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
    }

    _apiUrl(path) {
      return `https://api.github.com/repos/${this.conf.repo}/contents/${path}`;
    }

    _authHeaders() {
      const h = { Accept: "application/vnd.github+json" };
      if (this.conf.token) h.Authorization = `Bearer ${this.conf.token}`;
      return h;
    }

    async init() {
      // Try CDN first (no rate limit, but cached up to ~10 min).
      // Fall back to raw with timestamp to bust browser cache.
      let manifest = null;
      try {
        const r = await fetch(this._rawUrl("manifest.json") + "?t=" + Date.now());
        if (r.ok) manifest = await r.json();
      } catch (e) {}
      this._manifest = manifest && Array.isArray(manifest.photos)
        ? manifest : { photos: [] };

      // Get manifest sha if we have a token (needed for writes).
      if (this.conf.token) {
        try {
          const r = await fetch(this._apiUrl("manifest.json") + "?ref=" + this.conf.branch,
                                { headers: this._authHeaders() });
          if (r.ok) {
            const j = await r.json();
            this._manifestSha = j.sha;
          } else {
            this._manifestSha = null;
          }
        } catch (e) { this._manifestSha = null; }
      }
      return true;
    }

    async list() {
      const photos = (this._manifest.photos || []).slice();
      photos.sort((a, b) => (a.order || 0) - (b.order || 0));
      // Re-derive src URLs in case branch/dir changed since last write.
      return photos.map((p) => ({
        ...p,
        backend: "github",
        src: this._cdnUrl(`${this.conf.dir}/${p.filePath}`),
        downloadSrc: this._rawUrl(`${this.conf.dir}/${p.filePath}`),
      }));
    }

    async _putFile(path, content, sha, message) {
      const body = { message, content, branch: this.conf.branch };
      if (sha) body.sha = sha;
      const r = await fetch(this._apiUrl(path), {
        method: "PUT",
        headers: { ...this._authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`GitHub PUT ${path} → ${r.status}: ${txt}`);
      }
      return r.json();
    }

    async _deleteFile(path, sha, message) {
      const r = await fetch(this._apiUrl(path), {
        method: "DELETE",
        headers: { ...this._authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ message, sha, branch: this.conf.branch }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`GitHub DELETE ${path} → ${r.status}: ${txt}`);
      }
    }

    async _writeManifest() {
      const content = btoa(unescape(encodeURIComponent(
        JSON.stringify({ photos: this._manifest.photos }, null, 2)
      )));
      const result = await this._putFile(
        "manifest.json",
        content,
        this._manifestSha,
        "update manifest"
      );
      this._manifestSha = result.content.sha;
    }

    async upload(file, order) {
      if (!this.conf.token) throw new Error("Missing GitHub token");

      // 1. Read dimensions locally
      const objUrl = URL.createObjectURL(file);
      let dims = { w: 1000, h: 1000 };
      try { dims = await readImageDims(objUrl); } catch (e) {}
      URL.revokeObjectURL(objUrl);

      // 2. Upload file
      const name = safeName(file);
      const path = `${this.conf.dir}/${name}`;
      const content = await fileToBase64(file);
      const putResult = await this._putFile(path, content, null, `add ${name}`);
      const fileSha = putResult.content.sha;

      // 3. Update manifest
      const record = {
        id: uid(),
        name: file.name || name,
        filePath: name,
        w: dims.w,
        h: dims.h,
        addedAt: Date.now(),
        order,
        sha: fileSha,
      };
      this._manifest.photos.push(record);
      await this._writeManifest();

      return {
        ...record,
        backend: "github",
        src: this._cdnUrl(`${this.conf.dir}/${name}`),
        downloadSrc: this._rawUrl(`${this.conf.dir}/${name}`),
      };
    }

    async remove(photo) {
      if (!this.conf.token) throw new Error("Missing GitHub token");
      // 1. Find current photo in manifest
      const idx = this._manifest.photos.findIndex((p) => p.id === photo.id);
      if (idx < 0) return;
      const rec = this._manifest.photos[idx];

      // 2. Delete the file (need its sha — get fresh in case cached one is stale)
      const path = `${this.conf.dir}/${rec.filePath}`;
      let sha = rec.sha;
      if (!sha) {
        const r = await fetch(this._apiUrl(path) + "?ref=" + this.conf.branch,
                              { headers: this._authHeaders() });
        if (r.ok) sha = (await r.json()).sha;
      }
      try {
        if (sha) await this._deleteFile(path, sha, `remove ${rec.filePath}`);
      } catch (e) {
        // File may already be gone — keep going to clean manifest
        console.warn("GitHub delete file:", e.message);
      }

      // 3. Update manifest
      this._manifest.photos.splice(idx, 1);
      await this._writeManifest();
    }

    async download(photo) {
      await downloadFromUrl(photo.downloadSrc, photo.name || photo.filePath);
    }

    // Rebuild manifest by listing whatever's actually in the photos/ folder.
    // Useful when the user pushed files via git/web instead of the app.
    async sync(onProgress) {
      if (!this.conf.token) throw new Error("Missing GitHub token");
      const r = await fetch(
        this._apiUrl(this.conf.dir) + "?ref=" + this.conf.branch,
        { headers: this._authHeaders() }
      );
      if (!r.ok) {
        if (r.status === 404) {
          // Folder doesn't exist yet — nothing to sync.
          this._manifest.photos = [];
          await this._writeManifest();
          return { added: 0, kept: 0, removed: 0 };
        }
        throw new Error(`GitHub list ${this.conf.dir} → ${r.status}`);
      }
      const list = await r.json();
      const imageRe = /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i;
      const imgs = (Array.isArray(list) ? list : [])
        .filter((f) => f.type === "file" && imageRe.test(f.name));

      const existing = new Map(
        (this._manifest.photos || []).map((p) => [p.filePath, p])
      );
      const seen = new Set();
      const next = [];
      let order = 0;
      let added = 0, kept = 0;

      // Preserve existing entries (in original order) for files that still exist.
      for (const p of this._manifest.photos || []) {
        const found = imgs.find((f) => f.name === p.filePath);
        if (found) {
          seen.add(found.name);
          next.push({ ...p, sha: found.sha, order: order++ });
          kept++;
        }
      }

      // Add new files (sorted by name for stable order).
      const newFiles = imgs
        .filter((f) => !seen.has(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (let i = 0; i < newFiles.length; i++) {
        const f = newFiles[i];
        if (onProgress) onProgress({ done: i, total: newFiles.length, name: f.name });
        // Read dimensions from raw URL (bypass CDN cache for freshly pushed files).
        let dims = { w: 1000, h: 1000 };
        try {
          dims = await readImageDims(
            this._rawUrl(`${this.conf.dir}/${f.name}`) + "?t=" + Date.now()
          );
        } catch (e) { /* fall through with defaults */ }
        next.push({
          id: uid(),
          name: f.name,
          filePath: f.name,
          w: dims.w,
          h: dims.h,
          addedAt: Date.now() + i,
          order: order++,
          sha: f.sha,
        });
        added++;
      }
      if (onProgress) onProgress({ done: newFiles.length, total: newFiles.length, name: "" });

      const removed = (this._manifest.photos || []).length - kept;
      this._manifest.photos = next;
      await this._writeManifest();
      return { added, kept, removed };
    }

    async test() {
      // Quick health check: try to fetch the repo metadata.
      const r = await fetch(`https://api.github.com/repos/${this.conf.repo}`,
                            { headers: this._authHeaders() });
      if (!r.ok) {
        if (r.status === 404) throw new Error("Repo not found (or no access)");
        if (r.status === 401) throw new Error("Bad token");
        throw new Error("GitHub API error: " + r.status);
      }
      const repo = await r.json();
      return { ok: true, info: `${repo.full_name} · ${repo.private ? "private" : "public"}` };
    }
  }

  // =========================================================================
  // SUPABASE BACKEND
  // Reads:  PostgREST select with anon key
  // Writes: PostgREST insert/delete + Storage upload, using service_role key
  //         (the service key is stored in owner-only localStorage; never in
  //          a viewer's bundle, since they never set it).
  // =========================================================================
  class SupabaseBackend {
    constructor(conf) {
      this.conf = conf.supabase;
    }

    get name() { return "supabase"; }

    _readKey() { return this.conf.anonKey; }
    _writeKey() { return this.conf.serviceKey || this.conf.anonKey; }

    _restUrl(path) { return `${this.conf.url}/rest/v1/${path}`; }
    _storageUrl(path) { return `${this.conf.url}/storage/v1/object/${path}`; }
    _publicFileUrl(filePath) {
      return `${this.conf.url}/storage/v1/object/public/${this.conf.bucket}/${filePath}`;
    }

    _headers(key, extra = {}) {
      return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...extra,
      };
    }

    async init() {
      // Nothing to preload — list() pulls fresh each time.
      return true;
    }

    async list() {
      const url = this._restUrl(`${this.conf.table}?select=*&order=order_idx.asc`);
      const r = await fetch(url, { headers: this._headers(this._readKey()) });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Supabase list → ${r.status}: ${txt}`);
      }
      const rows = await r.json();
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        filePath: row.file_path,
        w: row.w,
        h: row.h,
        addedAt: row.added_at ? new Date(row.added_at).getTime() : 0,
        order: row.order_idx || 0,
        backend: "supabase",
        src: this._publicFileUrl(row.file_path),
        downloadSrc: this._publicFileUrl(row.file_path),
      }));
    }

    async upload(file, order) {
      if (!this.conf.serviceKey) {
        throw new Error("Missing Supabase service_role key");
      }

      // 1. Read dimensions
      const objUrl = URL.createObjectURL(file);
      let dims = { w: 1000, h: 1000 };
      try { dims = await readImageDims(objUrl); } catch (e) {}
      URL.revokeObjectURL(objUrl);

      // 2. Upload to Storage
      const name = safeName(file);
      const filePath = name;
      const uploadUrl = this._storageUrl(`${this.conf.bucket}/${filePath}`);
      const r = await fetch(uploadUrl, {
        method: "POST",
        headers: this._headers(this._writeKey(), {
          "Content-Type": file.type || extToMime(name),
          "x-upsert": "false",
        }),
        body: file,
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Supabase storage upload → ${r.status}: ${txt}`);
      }

      // 3. Insert metadata row
      const row = {
        id: uid(),
        name: file.name || name,
        file_path: filePath,
        w: dims.w,
        h: dims.h,
        order_idx: order,
      };
      const r2 = await fetch(this._restUrl(this.conf.table), {
        method: "POST",
        headers: this._headers(this._writeKey(), {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify(row),
      });
      if (!r2.ok) {
        const txt = await r2.text();
        // Roll back the file upload so we don't leave orphans
        try { await fetch(this._storageUrl(`${this.conf.bucket}/${filePath}`), {
          method: "DELETE", headers: this._headers(this._writeKey()),
        }); } catch (e) {}
        throw new Error(`Supabase insert → ${r2.status}: ${txt}`);
      }
      const inserted = (await r2.json())[0];

      return {
        id: inserted.id,
        name: inserted.name,
        filePath: inserted.file_path,
        w: inserted.w,
        h: inserted.h,
        addedAt: inserted.added_at ? new Date(inserted.added_at).getTime() : Date.now(),
        order: inserted.order_idx || 0,
        backend: "supabase",
        src: this._publicFileUrl(inserted.file_path),
        downloadSrc: this._publicFileUrl(inserted.file_path),
      };
    }

    async remove(photo) {
      if (!this.conf.serviceKey) {
        throw new Error("Missing Supabase service_role key");
      }
      // 1. Delete storage object
      try {
        await fetch(this._storageUrl(`${this.conf.bucket}/${photo.filePath}`), {
          method: "DELETE",
          headers: this._headers(this._writeKey()),
        });
      } catch (e) { console.warn("Supabase storage delete:", e.message); }

      // 2. Delete metadata row
      const r = await fetch(
        this._restUrl(`${this.conf.table}?id=eq.${encodeURIComponent(photo.id)}`),
        { method: "DELETE", headers: this._headers(this._writeKey()) }
      );
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Supabase delete row → ${r.status}: ${txt}`);
      }
    }

    async download(photo) {
      await downloadFromUrl(photo.downloadSrc, photo.name || photo.filePath);
    }

    async test() {
      // Try a HEAD on the table; verifies URL + anon key + table exists.
      const r = await fetch(this._restUrl(`${this.conf.table}?select=id&limit=1`),
                            { headers: this._headers(this._readKey()) });
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 401) throw new Error("Bad anon key");
        if (r.status === 404) throw new Error("Table not found: " + this.conf.table);
        throw new Error(`Supabase: ${r.status} ${txt}`);
      }
      return { ok: true, info: `${new URL(this.conf.url).hostname} · table "${this.conf.table}"` };
    }
  }

  // -------- Factory ------------------------------------------------------
  function makeBackend(conf, which) {
    which = which || conf.active;
    if (which === "github") return new GitHubBackend(conf);
    if (which === "supabase") return new SupabaseBackend(conf);
    throw new Error("Unknown backend: " + which);
  }

  // -------- Exports ------------------------------------------------------
  window.AlbumBackend = {
    LS_KEY,
    defaultConfig,
    loadConfig,
    saveConfig,
    configIsReadable,
    configIsWritable,
    makeBackend,
    downloadFromUrl,
  };
})();
