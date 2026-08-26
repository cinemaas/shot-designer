// One Durable Object per scene: the scene's storage, its version history, and
// the websocket room everyone editing it is connected to.

const MAX_VERSIONS = 60;

export class Scene {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS versions (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      saved_at INTEGER NOT NULL,
      author TEXT,
      label TEXT,
      xml TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY, v TEXT)`);
    // Only the index object uses this: share id -> scene id.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS shares (
      share_id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, made_at INTEGER)`);
  }

  meta(k, v) {
    if (v === undefined) {
      const r = [...this.sql.exec("SELECT v FROM meta WHERE k = ?", k)];
      return r.length ? r[0].v : null;
    }
    this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, String(v));
  }

  latest() {
    const r = [...this.sql.exec(
      "SELECT seq, saved_at, author, label, xml FROM versions ORDER BY seq DESC LIMIT 1")];
    return r.length ? r[0] : null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get("op");

    if (op === "live") return this.join(request, url);

    if (op === "put") {
      const body = await request.json();
      this.sql.exec(
        "INSERT INTO versions (saved_at, author, label, xml) VALUES (?, ?, ?, ?)",
        Date.now(), body.author || "", body.label || "", body.xml);
      // Keep history bounded so a scene can't grow without limit.
      this.sql.exec(
        `DELETE FROM versions WHERE seq NOT IN
         (SELECT seq FROM versions ORDER BY seq DESC LIMIT ${MAX_VERSIONS})`);
      if (body.name) this.meta("name", body.name);
      this.meta("updated", Date.now());
      const v = this.latest();
      this.broadcast({ type: "saved", seq: v.seq, author: body.author || "" }, null);
      return json({ ok: true, seq: v.seq });
    }

    if (op === "get") {
      const v = this.latest();
      if (!v) return json({ error: "no such scene" }, 404);
      return json({ xml: v.xml, seq: v.seq, savedAt: v.saved_at,
                    name: this.meta("name"), author: v.author });
    }

    if (op === "history") {
      const rows = [...this.sql.exec(
        "SELECT seq, saved_at, author, label FROM versions ORDER BY seq DESC")];
      return json({ versions: rows, name: this.meta("name") });
    }

    if (op === "version") {
      const seq = Number(url.searchParams.get("seq"));
      const r = [...this.sql.exec("SELECT xml, saved_at FROM versions WHERE seq = ?", seq)];
      if (!r.length) return json({ error: "no such version" }, 404);
      return json({ xml: r[0].xml, seq, savedAt: r[0].saved_at });
    }

    if (op === "share-put") {
      const { shareId, sceneId } = await request.json();
      this.sql.exec(
        "INSERT OR REPLACE INTO shares (share_id, scene_id, made_at) VALUES (?, ?, ?)",
        shareId, sceneId, Date.now());
      return json({ ok: true });
    }

    if (op === "share-get") {
      const r = [...this.sql.exec("SELECT scene_id FROM shares WHERE share_id = ?",
        url.searchParams.get("share"))];
      return json({ sceneId: r.length ? r[0].scene_id : null });
    }

    if (op === "share-list") {
      return json({ shares: [...this.sql.exec(
        "SELECT share_id, scene_id, made_at FROM shares ORDER BY made_at DESC")] });
    }

    if (op === "info") {
      const v = this.latest();
      return json({ exists: !!v, name: this.meta("name"),
                    updated: Number(this.meta("updated") || 0), seq: v ? v.seq : 0 });
    }

    return json({ error: "unknown op" }, 400);
  }

  // --- live room ------------------------------------------------------------

  join(request, url) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation keeps an idle room free; the tags survive the nap.
    this.state.acceptWebSocket(server, [url.searchParams.get("who") || "someone"]);
    server.serializeAttachment({
      who: url.searchParams.get("who") || "someone",
      readOnly: url.searchParams.get("mode") === "view",
      colour: url.searchParams.get("colour") || "#255681",
    });
    this.sendPeers();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment() || {};
    if (me.readOnly && msg.type !== "cursor") return;   // viewers can watch, not touch

    if (msg.type === "cursor" || msg.type === "edit" || msg.type === "selection") {
      this.broadcast({ ...msg, who: me.who, colour: me.colour }, ws);
    }
  }

  webSocketClose(ws) { this.sendPeers(ws); }
  webSocketError(ws) { this.sendPeers(ws); }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(text); } catch { /* dropped on close */ }
    }
  }

  sendPeers(closing) {
    const peers = this.state.getWebSockets()
      .filter((w) => w !== closing)
      .map((w) => {
        const a = w.deserializeAttachment() || {};
        return { who: a.who, colour: a.colour, readOnly: !!a.readOnly };
      });
    this.broadcast({ type: "peers", peers }, null);
  }
}

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json" },
  });
