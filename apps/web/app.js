const $ = (id) => document.getElementById(id);
const form = $("form");
const urlInput = $("url");
const aliasInput = $("alias");
const submitBtn = $("submit");
const errorEl = $("error");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let allLinks = [];
let known = new Set(); // codes already rendered (so only new ones animate in)
let clickMap = new Map(); // code -> clicks (to bump counters that changed)
let firstLoad = true;

$("prefix").textContent = `${location.host}/`;

/* ---------- helpers ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 1800);
}

async function copy(text, msg = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Copy failed");
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
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms));

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** Count a number up/down to its new value. */
function countTo(node, to) {
  const from = Number(node.dataset.v ?? 0);
  node.dataset.v = to;
  if (reduceMotion || from === to) { node.textContent = fmt(to); return; }
  const start = performance.now(), dur = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    node.textContent = fmt(Math.round(from + (to - from) * e));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- ledger ---------- */
function renderLink(l, i) {
  const s = saved(l);
  const isNew = !known.has(l.code);
  const prev = clickMap.get(l.code);
  const bumped = prev !== undefined && l.clicks > prev;

  const code = el(
    "div",
    { className: "code" },
    el("a", { href: l.shortUrl, target: "_blank", rel: "noopener" }, bare(l.shortUrl)),
    ...(s > 0 ? [el("span", { className: "saved" }, `-${s} chars`)] : []),
  );
  const dest = el("div", { className: "dest", title: l.url }, l.url);
  const meta = el(
    "div",
    { className: "meta" },
    `snipped ${ago(l.createdAt)}` + (l.lastClickedAt ? ` / last click ${ago(l.lastClickedAt)}` : ""),
  );

  const count = el("div", { className: `count${bumped ? " bump" : ""}` }, el("strong", {}, fmt(l.clicks)), el("span", {}, l.clicks === 1 ? "click" : "clicks"));

  const li = el("li", { className: `item${isNew ? " enter" : ""}` });
  const acts = el(
    "div",
    { className: "acts" },
    el("button", { type: "button", onclick: () => copy(l.shortUrl) }, "copy"),
    el("button", { type: "button", onclick: () => window.open(l.shortUrl, "_blank", "noopener") }, "open"),
    el("button", {
      type: "button",
      className: "del",
      onclick: async () => {
        if (!confirm(`Delete ${l.shortUrl}?`)) return;
        await fetch(`/api/links/${encodeURIComponent(l.code)}`, { method: "DELETE" });
        known.delete(l.code);
        clickMap.delete(l.code);
        allLinks = allLinks.filter((x) => x.code !== l.code);
        // collapse the row, then refresh numbers
        const h = li.offsetHeight;
        await li.animate(
          [{ height: `${h}px`, opacity: 1, transform: "none" }, { height: 0, opacity: 0, paddingTop: 0, paddingBottom: 0, transform: "translateX(40px)" }],
          { duration: reduceMotion ? 1 : 380, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
        ).finished;
        toast("Link deleted");
        load();
      },
    }, "delete"),
  );
  li.append(code, dest, meta, el("div", { className: "side" }, count, acts));
  if (isNew) li.style.animationDelay = `${firstLoad ? Math.min(i, 8) * 70 : 0}ms`;
  return li;
}

function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const links = q ? allLinks.filter((l) => l.code.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)) : allLinks;
  $("list").replaceChildren(...links.map(renderLink));
  for (const l of allLinks) { known.add(l.code); clickMap.set(l.code, l.clicks); }
  firstLoad = false;
  $("empty").textContent = links.length
    ? ""
    : allLinks.length
      ? "// nothing matches that"
      : "// no links yet. paste one above and snip it.";
}

function renderStats({ links, totals }) {
  const savedTotal = links.reduce((n, l) => n + saved(l), 0);
  countTo($("stat-links"), totals.links);
  countTo($("stat-clicks"), totals.clicks);
  countTo($("stat-saved"), savedTotal);
  $("total-links").textContent = fmt(totals.links);
  $("total-clicks").textContent = fmt(totals.clicks);
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

/* ---------- the snip: scissors cut the long url down to the short one ---------- */
const GLYPHS = "abcdefghijkmnpqrstuvwxyz23456789";
let snipRun = 0;

async function snip(data) {
  const run = ++snipRun;
  const box = $("result"), line = $("snip-line"), head = $("snip-head"), tail = $("snip-tail");
  const sc = $("snip-scissors"), fin = $("snip-final"), label = $("snip-label");
  const short = bare(data.shortUrl);
  const full = bare(data.url);
  const long = full.length > 70 ? `${full.slice(0, 70)}...` : full;
  const cut = Math.min(short.length, long.length);

  box.hidden = false;
  fin.hidden = true;
  line.hidden = false;
  label.textContent = "Snipping...";
  $("result-link").href = data.shortUrl;
  $("result-link").textContent = short;
  $("copy-result").onclick = () => copy(data.shortUrl);

  const finish = () => {
    if (run !== snipRun) return;
    line.hidden = true;
    fin.hidden = false;
    label.textContent = `Snipped. ${Math.max(0, full.length - short.length)} characters shorter.`;
  };

  if (reduceMotion || long.length <= cut + 2) return finish();

  head.textContent = long.slice(0, cut);
  tail.textContent = long.slice(cut);
  tail.style.cssText = "";
  sc.style.cssText = "";
  sc.style.opacity = 1;
  await sleep(250);
  if (run !== snipRun) return;

  // scissors travel right -> left to the cut point
  const stop = head.offsetWidth;
  const startX = line.clientWidth - 24;
  sc.classList.add("chomp");
  await sc.animate([{ left: `${startX}px` }, { left: `${stop}px` }], { duration: 1100, easing: "cubic-bezier(.6,0,.3,1)", fill: "forwards" }).finished;
  if (run !== snipRun) return;
  sc.classList.remove("chomp");

  // the tail falls away
  tail.animate(
    [{ transform: "none", opacity: 0.55 }, { transform: "translateY(70px) rotate(9deg)", opacity: 0 }],
    { duration: 650, easing: "cubic-bezier(.5,0,1,.6)", fill: "forwards" },
  );
  sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });

  // the head scrambles into the short link
  const target = short.padEnd(cut, " ").slice(0, Math.max(cut, short.length));
  const frames = 22;
  for (let f = 0; f <= frames; f++) {
    if (run !== snipRun) return;
    const resolved = Math.floor((f / frames) * target.length);
    head.textContent = target
      .split("")
      .map((c, i) => (i < resolved || c === " " ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
      .join("");
    await sleep(28);
  }
  await sleep(350);
  finish();
}

/* ---------- create ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.querySelector("span").textContent = "Snipping";
  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value.trim(), alias: aliasInput.value.trim() || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");

    copy(data.shortUrl, "Short link copied");
    form.reset();
    await load();
    snip(data);
    $("result").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  } catch (err) {
    errorEl.hidden = true;
    errorEl.textContent = err.message;
    void errorEl.offsetWidth; // restart shake animation
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector("span").textContent = "Snip it";
  }
});

/* ---------- marquee strips ---------- */
const LONG_URLS = [
  "https://www.example.com/blog/2026/11/how-to-build-a-url-shortener-with-node?utm_source=newsletter&utm_medium=email&utm_campaign=autumn",
  "https://docs.example.org/guides/getting-started/installation#step-3-configure-your-environment-variables",
  "https://shop.example.com/collections/new-arrivals/products/limited-edition-sneaker?variant=4412093&ref=homepage",
];
const SHORT_DEMOS = ["shortly/k7Qm2x", "shortly/launch", "shortly/docs", "shortly/Xp9aRt", "shortly/menu", "shortly/b3Nw8e", "shortly/promo", "shortly/4gHtZz"];

function fillTrack(id, items, sep) {
  const group = () => items.flatMap((t) => [el("span", {}, t), el("em", {}, sep)]);
  $(id).replaceChildren(...group(), ...group()); // duplicated so the loop is seamless
}
fillTrack("track-a", LONG_URLS, "✂");
fillTrack("track-b", SHORT_DEMOS, "→");

load();
setInterval(load, 15000);
