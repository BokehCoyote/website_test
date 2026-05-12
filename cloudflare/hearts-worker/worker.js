const DEFAULT_ALLOWED_ORIGINS = [
  "https://bokehcoyote.github.io",
  "https://bokeh.dog",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
];

const HEART_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH_IDS = 100;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

export class HeartCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS heart_counts (
        id TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS heart_interactions (
        client_hash TEXT PRIMARY KEY,
        last_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/count") {
      return json({ count: this.getCount() });
    }

    if (request.method === "POST" && url.pathname === "/heart") {
      const clientHash = request.headers.get("x-client-hash") || "";
      if (!clientHash) {
        return json({ error: "Missing client hash." }, 400);
      }

      const now = Date.now();
      this.sql.exec("DELETE FROM heart_interactions WHERE last_at < ?", now - HEART_WINDOW_MS);
      const previous = this.sql.exec(
        "SELECT last_at FROM heart_interactions WHERE client_hash = ?",
        clientHash
      ).toArray()[0];

      if (previous && now - Number(previous.last_at) < HEART_WINDOW_MS) {
        return json({ count: this.getCount(), accepted: false, throttled: true });
      }

      this.sql.exec(
        "INSERT INTO heart_counts (id, count) VALUES ('heart', 1) ON CONFLICT(id) DO UPDATE SET count = count + 1"
      );
      this.sql.exec(
        "INSERT INTO heart_interactions (client_hash, last_at) VALUES (?, ?) ON CONFLICT(client_hash) DO UPDATE SET last_at = excluded.last_at",
        clientHash,
        now
      );

      return json({ count: this.getCount(), accepted: true, throttled: false });
    }

    return json({ error: "Not found." }, 404);
  }

  getCount() {
    const row = this.sql.exec("SELECT count FROM heart_counts WHERE id = 'heart'").toArray()[0];
    return Number(row?.count) || 0;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = makeCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!isAllowedOrigin(origin, env)) {
      return json({ error: "Origin not allowed." }, 403, corsHeaders);
    }

    try {
      return await handleRequest(request, env, corsHeaders);
    } catch (error) {
      return json({ error: error.message || "Request failed." }, 400, corsHeaders);
    }
  }
};

async function handleRequest(request, env, corsHeaders) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/hearts") {
    const ids = parseIds(url.searchParams.get("ids") || "");
    if (ids.length === 0) {
      return json({ hearts: {} }, 200, corsHeaders);
    }

    const results = {};
    await Promise.all(ids.map(async (id) => {
      const object = env.HEART_COUNTERS.get(env.HEART_COUNTERS.idFromName(id));
      const response = await object.fetch("https://heart.internal/count");
      const data = await response.json();
      results[id] = { count: Number(data.count) || 0 };
    }));

    return json({ hearts: results }, 200, corsHeaders);
  }

  const match = url.pathname.match(/^\/hearts\/([^/]+)$/);
  if (request.method === "POST" && match) {
    const id = decodeURIComponent(match[1]);
    validateId(id);
    const clientHash = await hashClient(request, env, id);
    const object = env.HEART_COUNTERS.get(env.HEART_COUNTERS.idFromName(id));
    const response = await object.fetch("https://heart.internal/heart", {
      method: "POST",
      headers: { "x-client-hash": clientHash }
    });
    const data = await response.json();
    return json({ id, ...data }, response.status, corsHeaders);
  }

  return json({ error: "Not found." }, 404, corsHeaders);
}

function parseIds(value) {
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))]
    .slice(0, MAX_BATCH_IDS)
    .map((id) => {
      validateId(id);
      return id;
    });
}

function validateId(id) {
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Invalid artwork id: ${id}`);
  }
}

async function hashClient(request, env, artworkId) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown-ip";
  const ua = request.headers.get("User-Agent") || "unknown-agent";
  const salt = env.IP_HASH_SALT || "change-this-salt";
  const input = `${salt}:${artworkId}:${ip}:${ua}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function makeCorsHeaders(origin, env) {
  const allowedOrigin = isAllowedOrigin(origin, env) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };
}

function isAllowedOrigin(origin, env) {
  if (!origin) {
    return false;
  }

  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
  return allowed.includes(origin);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
import { DurableObject } from "cloudflare:workers";
