const $ = (id) => document.getElementById(id);
const form = $("form");
const urlInput = $("url");
const aliasInput = $("alias");
const submitBtn = $("submit");
const errorEl = $("error");

let allLinks = [];

$("prefix").textContent = `${location.host}/`;

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch {
    toast("Copy failed. Select and copy manually");
  }
}

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const bare = (u) => u.replace(/^https?:\/\//, "");
const saved = (l) => Math.max(0, bare(l.url).length - bare(l.shortUrl).length);
const fmt = (n) => n.toLocaleString();

const SVG = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>',
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function iconBtn(svg, label, onclick, extra = "") {
  const b = el("button", { className: `icon-btn ${extra}`, type: "button", title: label, onclick });
  b.setAttribute("aria-label", label);
  b.innerHTML = svg;
  return b;
}

/* ---------- list ---------- */
function renderLink(l, i, maxClicks) {
  const s = saved(l);
  const title = el(
    "div",
    { className: "item-title" },
    el("a", { href: l.shortUrl, target: "_blank", rel: "noopener" }, bare(l.shortUrl)),
    ...(s > 0 ? [el("span", { className: "saved" }, `-${s} chars`)] : []),
  );
  const meta = `Created ${ago(l.createdAt)}` + (l.lastClickedAt ? ` · last click ${ago(l.lastClickedAt)}` : "");
  const main = el(
    "div",
    { className: "item-main" },
    title,
    el("div", { className: "dest", title: l.url }, l.url),
    el("div", { className: "meta" }, meta),
  );

  const bar = el("div", { className: "bar" }, el("i", { style: `width:${maxClicks ? (l.clicks / maxClicks) * 100 : 0}%` }));
  const clicks = el(
    "div",
    { className: "clicks" },
    el("strong", {}, fmt(l.clicks)),
    el("span", {}, l.clicks === 1 ? "click" : "clicks"),
    bar,
  );

  const actions = el(
    "div",
    { className: "actions" },
    iconBtn(SVG.copy, "Copy link", () => copy(l.shortUrl)),
    iconBtn(SVG.open, "Open link", () => window.open(l.shortUrl, "_blank", "noopener")),
    iconBtn(SVG.del, "Delete link", async () => {
      if (!confirm(`Delete ${l.shortUrl}?`)) return;
      await fetch(`/api/links/${encodeURIComponent(l.code)}`, { method: "DELETE" });
      toast("Link deleted");
      load();
    }, "del"),
  );

  const li = el("li", { className: "item" }, main, clicks, actions);
  li.style.animationDelay = `${Math.min(i, 8) * 30}ms`;
  return li;
}

function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const links = q ? allLinks.filter((l) => l.code.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)) : allLinks;
  const maxClicks = Math.max(0, ...allLinks.map((l) => l.clicks));
  $("list").replaceChildren(...links.map((l, i) => renderLink(l, i, maxClicks)));
  $("empty").textContent = links.length
    ? ""
    : allLinks.length
      ? "No links match your search."
      : "No links yet. Paste a URL above to create your first short link.";
}

function renderStats({ links, totals }) {
  const savedTotal = links.reduce((n, l) => n + saved(l), 0);
  $("total-links").textContent = fmt(totals.links);
  $("total-clicks").textContent = fmt(totals.clicks);
  $("stat-links").textContent = fmt(totals.links);
  $("stat-clicks").textContent = fmt(totals.clicks);
  $("stat-saved").textContent = fmt(savedTotal);
}

async function load() {
  try {
    const res = await fetch("/api/links");
    const data = await res.json();
    allLinks = data.links;
    renderStats(data);
    renderList();
  } catch {
    toast("Could not load links");
  }
}

$("search").addEventListener("input", renderList);

/* ---------- create ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Shortening...";
  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value.trim(), alias: aliasInput.value.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");

    $("result").hidden = false;
    const link = $("result-link");
    link.href = data.shortUrl;
    link.textContent = bare(data.shortUrl);
    $("copy-result").onclick = () => copy(data.shortUrl);
    copy(data.shortUrl);
    form.reset();
    load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Shorten";
  }
});

/* ---------- hero demo: long url collapses into a short one ---------- */
const SAMPLES = [
  "https://www.example.com/blog/2026/11/how-to-build-a-url-shortener-with-node?utm_source=newsletter&utm_medium=email",
  "https://docs.example.org/guides/getting-started/installation#step-3-configure-your-environment-variables",
  "https://shop.example.com/collections/new-arrivals/products/limited-edition-sneaker?variant=4412093&ref=homepage",
];
const randCode = () => Array.from({ length: 6 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 57)]).join("");

function runDemo() {
  const long = $("demo-long"), short = $("demo-short"), badge = $("demo-saved");
  let i = 0;
  const tick = () => {
    const url = SAMPLES[i++ % SAMPLES.length];
    const code = `${location.host}/${randCode()}`;
    long.classList.add("fade");
    short.classList.add("fade");
    badge.classList.add("fade");
    setTimeout(() => {
      long.textContent = bare(url);
      short.textContent = code;
      badge.textContent = `-${bare(url).length - code.length} chars`;
      long.classList.remove("fade");
      setTimeout(() => {
        short.classList.remove("fade");
        badge.classList.remove("fade");
      }, 450);
    }, 350);
  };
  tick();
  setInterval(tick, 4200);
}

runDemo();
load();
setInterval(load, 15000);
