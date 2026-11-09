import express from "express";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LinkStore, type LinkRecord } from "./store.ts";

const PORT = Number(process.env.PORT ?? 4000);
const BASE_URL = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const DATA_FILE =
  process.env.DATA_FILE ?? fileURLToPath(new URL("../data/links.json", import.meta.url));
const WEB_DIR = fileURLToPath(new URL("../../web", import.meta.url));

const store = new LinkStore(DATA_FILE);
const app = express();

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED = new Set(["api", "health", "index", "app", "styles", "favicon"]);

function generateCode(length = 7): string {
  let code = "";
  for (const b of randomBytes(length)) code += ALPHABET[b % ALPHABET.length];
  return code;
}

function uniqueCode(): string {
  let code = generateCode();
  while (store.has(code) || RESERVED.has(code)) code = generateCode();
  return code;
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const view = (r: LinkRecord) => ({ ...r, shortUrl: `${BASE_URL}/${r.code}` });

app.use(express.json({ limit: "10kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/links", (_req, res) => {
  const links = store.list();
  res.json({
    links: links.map(view),
    totals: { links: links.length, clicks: links.reduce((n, l) => n + l.clicks, 0) },
  });
});

app.post("/api/links", (req, res) => {
  const { url, alias } = (req.body ?? {}) as { url?: unknown; alias?: unknown };

  if (!isValidUrl(url)) {
    res.status(400).json({ error: "Enter a valid http(s) URL" });
    return;
  }

  let code: string;
  if (alias !== undefined && alias !== "") {
    if (typeof alias !== "string" || !CODE_RE.test(alias)) {
      res.status(400).json({ error: "Alias must be 3-32 characters: letters, digits, _ or -" });
      return;
    }
    if (RESERVED.has(alias.toLowerCase()) || store.has(alias)) {
      res.status(409).json({ error: "That alias is already taken" });
      return;
    }
    code = alias;
  } else {
    code = uniqueCode();
  }

  res.status(201).json(view(store.create(code, url)));
});

app.get("/api/links/:code", (req, res) => {
  const record = store.get(req.params.code);
  if (!record) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  res.json(view(record));
});

app.delete("/api/links/:code", (req, res) => {
  if (!store.delete(req.params.code)) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  res.status(204).end();
});

// Web UI (static). Registered before /:code so assets resolve first.
app.use(express.static(WEB_DIR));

app.get("/:code", (req, res) => {
  const record = store.click(req.params.code);
  if (!record) {
    res.status(404).type("text/plain").send("Link not found");
    return;
  }
  res.redirect(302, record.url);
});

const server = app.listen(PORT, () => {
  console.log(`Shortly running at ${BASE_URL}`);
});

function shutdown() {
  store.flush();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
