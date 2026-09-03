import { SLUG } from "./brand.js?v=1806c92d";
// Where scenes live.
//
// Served from localhost, the app reads and writes the real "Shot Designer
// Scenes" folder through server.py. Served from the deployed Worker — or when
// a local session has been pointed at it — the same calls go to the cloud.
// A scene keeps the same id everywhere, derived from its path, so the laptop,
// the iPad and a share link all land in the same room.

const LS_KEY = "sd.cloud";

export const Cloud = {
  base: "", key: "", who: "", colour: "#255681",

  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem(LS_KEY) || "{}")); }
    catch { /* first run */ }
    // Running on the deployed Worker: the cloud is wherever we were served from.
    if (!this.base && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      this.base = location.origin;
    }
    return this;
  },
  save() {
    const { base, key, who, colour } = this;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ base, key, who, colour })); }
    catch { /* private window */ }
  },
  get connected() { return !!(this.base && this.key); },
  forget() { this.base = ""; this.key = ""; this.save(); },

  async call(path, opts = {}) {
    const r = await fetch(this.base + path, {
      ...opts,
      headers: {
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        Authorization: "Bearer " + this.key,
        ...(opts.headers || {}),
      },
    });
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok || j.error) throw new Error(j.error || r.statusText);
    return j;
  },

  list: () => Cloud.call("/api/cloud/list"),
  setList: (scenes) => Cloud.call("/api/cloud/index", {
    method: "POST", body: JSON.stringify({ scenes }),
  }),

  /** Record a scene in the shared index so other devices can find it. */
  async note(id, name) {
    const { scenes } = await Cloud.list().catch(() => ({ scenes: [] }));
    const rest = (scenes || []).filter((s) => s.id !== id);
    await Cloud.setList([{ id, name, updated: Date.now() }, ...rest].slice(0, 500));
  },

  get: (id) => Cloud.call(`/api/cloud/scene/${id}`),
  history: (id) => Cloud.call(`/api/cloud/scene/${id}/history`),
  version: (id, seq) => Cloud.call(`/api/cloud/scene/${id}/version?seq=${seq}`),
  put: (id, xml, name, author, label) => Cloud.call(`/api/cloud/scene/${id}`, {
    method: "POST", body: JSON.stringify({ xml, name, author, label }),
  }),
  share: (sceneId) => Cloud.call("/api/cloud/share", {
    method: "POST", body: JSON.stringify({ sceneId }),
  }),

  /** Editors need a fresh ticket each time the socket opens; viewers don't. */
  async ticket() {
    const { ticket } = await this.call("/api/cloud/ticket");
    return ticket;
  },

  async liveURL(id, shared) {
    const u = new URL(this.base || location.origin);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = shared ? `/api/shared/${id}/live` : `/api/cloud/scene/${id}/live`;
    u.searchParams.set("who", this.who || "Someone");
    u.searchParams.set("colour", this.colour);
    if (!shared) u.searchParams.set("ticket", await this.ticket());
    return u.toString();
  },
};

/** A scene's cloud id: stable for a given path, so every device agrees. */
export async function sceneId(path) {
  const bytes = new TextEncoder().encode(SLUG + ":" + path.toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 11)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The live room. Reconnects on its own; callers just get events.
 * Messages are small and object-shaped, so a move shows up on the other
 * screen without shipping the whole scene.
 */
export function connectLive(makeURL, handlers) {
  let ws = null, closed = false, retry = 1000, timer = null;

  const open = async () => {
    if (closed) return;
    let url;
    try { url = typeof makeURL === "function" ? await makeURL() : makeURL; }
    catch { return schedule(); }
    if (closed) return;
    try { ws = new WebSocket(url); } catch { return schedule(); }
    ws.onopen = () => { retry = 1000; handlers.status?.("live"); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      handlers[m.type]?.(m);
    };
    ws.onclose = () => { handlers.status?.("offline"); schedule(); };
    ws.onerror = () => { try { ws.close(); } catch { /* already gone */ } };
  };
  const schedule = () => {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(open, retry);
    retry = Math.min(retry * 2, 20000);
  };

  open();
  return {
    send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      closed = true; clearTimeout(timer);
      try { ws?.close(); } catch { /* already gone */ }
    },
  };
}
