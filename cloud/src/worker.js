// Router. Static app from the assets binding, scenes from Durable Objects.
//
// Auth is one shared passphrase held as a Worker secret:
//   wrangler secret put SYNC_KEY
// Share links carry their own unguessable id and are read-only, so a director
// with a link never needs the passphrase or an account.

import { Scene, json } from "./room.js";
export { Scene };

const enc = new TextEncoder();

async function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

const bearer = (req) => (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

async function authed(req, env) {
  if (!env.SYNC_KEY) return false;
  return timingSafeEqual(bearer(req), env.SYNC_KEY);
}

const room = (env, id) => env.SCENE.get(env.SCENE.idFromName(id));

// A browser can't put an Authorization header on a WebSocket, so an authed
// call mints a short-lived signed ticket and the socket presents that instead.
const TICKET_TTL_MS = 60_000;

async function hmac(env, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(env.SYNC_KEY), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mintTicket(env) {
  const body = String(Date.now() + TICKET_TTL_MS);
  return `${body}.${await hmac(env, body)}`;
}

async function ticketValid(env, ticket) {
  const [body, sig] = String(ticket || "").split(".");
  if (!body || !sig) return false;
  const expires = Number(body);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  return timingSafeEqual(sig, await hmac(env, body));
}

/** Index of scenes and share links, kept in one Durable Object. */
const index = (env) => env.SCENE.get(env.SCENE.idFromName("::index"));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;

    // --- read-only share links -------------------------------------------
    // /s/<shareId> serves the app; the app then reads the scene through
    // /api/shared/<shareId>, which needs no passphrase and refuses writes.
    // Older /s/<id> links still work; the app now lives at /?s=<id> so that
    // its relative asset paths resolve the same on any host.
    if (p.startsWith("/s/")) {
      const to = new URL("/", url);
      to.searchParams.set("s", p.slice(3).split("/")[0]);
      return Response.redirect(to.toString(), 302);
    }

    if (p.startsWith("/api/shared/")) {
      const shareId = p.slice("/api/shared/".length).split("/")[0];
      const sceneId = await lookupShare(env, shareId);
      if (!sceneId) return json({ error: "link not found" }, 404);
      if (p.endsWith("/live")) {
        return room(env, sceneId).fetch(liveURL(url, sceneId, "view"), request);
      }
      return room(env, sceneId).fetch(opURL(url, "get"));
    }

    if (!p.startsWith("/api/")) return env.ASSETS.fetch(request);

    // --- everything below needs the passphrase ---------------------------
    const liveMatch = p.match(/^\/api\/cloud\/scene\/([A-Za-z0-9_-]{1,64})\/live$/);
    if (liveMatch) {
      if (!(await ticketValid(env, url.searchParams.get("ticket")))) {
        return json({ error: "ticket expired — reconnecting" }, 401);
      }
      return room(env, liveMatch[1]).fetch(liveURL(url, liveMatch[1], "edit"), request);
    }

    if (!(await authed(request, env))) {
      return json({ error: "sync key required" }, 401);
    }

    if (p === "/api/cloud/ticket") {
      return json({ ticket: await mintTicket(env), ttl: TICKET_TTL_MS });
    }

    if (p === "/api/cloud/list") {
      return index(env).fetch(opURL(url, "get")).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        return json({ scenes: safeParse(d.xml) || [] });
      });
    }

    if (p === "/api/cloud/index") {          // the client owns the index contents
      const body = await request.json();
      return index(env).fetch(putRequest(url, { xml: JSON.stringify(body.scenes) }));
    }

    const m = p.match(/^\/api\/cloud\/scene\/([A-Za-z0-9_-]{1,64})(\/[a-z]+)?$/);
    if (m) {
      const [, sceneId, tail] = m;
      const op = (tail || "").slice(1) || (request.method === "POST" ? "put" : "get");
      if (op === "put") {
        return room(env, sceneId).fetch(putRequest(url, await request.json()));
      }
      return room(env, sceneId).fetch(opURL(url, op));
    }

    if (p === "/api/cloud/share" && request.method === "POST") {
      const { sceneId } = await request.json();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(sceneId || "")) {
        return json({ error: "bad scene id" }, 400);
      }
      const shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
      await index(env).fetch(new Request("https://do/?op=share-put", {
        method: "POST", body: JSON.stringify({ shareId, sceneId }),
      }));
      return json({ shareId, url: `${url.origin}/?s=${shareId}` });
    }

    return json({ error: "unknown endpoint" }, 404);
  },
};

const opURL = (url, op) => new Request(`https://do/?op=${op}${
  url.searchParams.get("seq") ? "&seq=" + url.searchParams.get("seq") : ""}`);

const putRequest = (url, body) => new Request("https://do/?op=put", {
  method: "POST", body: JSON.stringify(body),
});

const liveURL = (url, sceneId, mode) => {
  const u = new URL("https://do/");
  u.searchParams.set("op", "live");
  u.searchParams.set("mode", mode);
  u.searchParams.set("who", url.searchParams.get("who") || "someone");
  u.searchParams.set("colour", url.searchParams.get("colour") || "#255681");
  return u.toString();
};

const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function lookupShare(env, shareId) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(shareId || "")) return null;
  const r = await index(env).fetch(
    `https://do/?op=share-get&share=${encodeURIComponent(shareId)}`);
  const d = await r.json().catch(() => ({}));
  return d.sceneId || null;
}
