import express from "express";
import { randomBytes } from "node:crypto";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

interface LinkRecord {
  code: string;
  url: string;
  clicks: number;
  createdAt: string;
}

// In-memory store (resets on restart). Swap for packages/db later.
const links = new Map<string, LinkRecord>();

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

function generateCode(length = 7): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

function uniqueCode(): string {
  let code = generateCode();
  while (links.has(code)) code = generateCode();
  return code;
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Create a short link. Body: { url, alias? }
app.post("/api/links", (req, res) => {
  const { url, alias } = (req.body ?? {}) as { url?: unknown; alias?: unknown };

  if (!isValidUrl(url)) {
    res.status(400).json({ error: "A valid http(s) `url` is required" });
    return;
  }

  let code: string;
  if (alias !== undefined) {
    if (typeof alias !== "string" || !CODE_RE.test(alias)) {
      res.status(400).json({ error: "`alias` must be 3-32 chars: letters, digits, _ or -" });
      return;
    }
    if (links.has(alias)) {
      res.status(409).json({ error: "Alias already in use" });
      return;
    }
    code = alias;
  } else {
    code = uniqueCode();
  }

  const record: LinkRecord = { code, url, clicks: 0, createdAt: new Date().toISOString() };
  links.set(code, record);
  res.status(201).json({ ...record, shortUrl: `${BASE_URL}/${code}` });
});

// Link stats
app.get("/api/links/:code", (req, res) => {
  const record = links.get(req.params.code);
  if (!record) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  res.json({ ...record, shortUrl: `${BASE_URL}/${record.code}` });
});

// Delete a link
app.delete("/api/links/:code", (req, res) => {
  if (!links.delete(req.params.code)) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  res.status(204).end();
});

// Redirect
app.get("/:code", (req, res) => {
  const record = links.get(req.params.code);
  if (!record) {
    res.status(404).json({ error: "Link not found" });
    return;
  }
  record.clicks += 1;
  res.redirect(302, record.url);
});

app.listen(PORT, () => {
  console.log(`Shortly API listening on ${BASE_URL}`);
});
