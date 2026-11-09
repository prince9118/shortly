const $ = (id) => document.getElementById(id);
const form = $("form");
const urlInput = $("url");
const aliasInput = $("alias");
const submitBtn = $("submit");
const errorEl = $("error");

$("prefix").textContent = `${location.host}/`;

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

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function renderLink(l) {
  const meta = `Created ${ago(l.createdAt)}` + (l.lastClickedAt ? ` · last click ${ago(l.lastClickedAt)}` : "");
  const main = el(
    "div",
    { className: "item-main" },
    el("a", { className: "short", href: l.shortUrl, target: "_blank", rel: "noopener" }, l.shortUrl.replace(/^https?:\/\//, "")),
    el("div", { className: "dest", title: l.url }, l.url),
    el("div", { className: "meta" }, meta),
  );
  const badge = el("span", { className: "badge" }, `${l.clicks} click${l.clicks === 1 ? "" : "s"}`);
  const copyBtn = el("button", { className: "ghost", type: "button", onclick: () => copy(l.shortUrl) }, "Copy");
  const delBtn = el(
    "button",
    {
      className: "ghost danger",
      type: "button",
      onclick: async () => {
        if (!confirm(`Delete ${l.shortUrl}?`)) return;
        await fetch(`/api/links/${encodeURIComponent(l.code)}`, { method: "DELETE" });
        toast("Link deleted");
        load();
      },
    },
    "Delete",
  );
  return el("li", { className: "item" }, main, badge, el("div", { className: "actions" }, copyBtn, delBtn));
}

function render({ links, totals }) {
  $("total-links").textContent = totals.links;
  $("total-clicks").textContent = totals.clicks;
  $("empty").hidden = links.length > 0;
  $("list").replaceChildren(...links.map(renderLink));
}

async function load() {
  try {
    const res = await fetch("/api/links");
    render(await res.json());
  } catch {
    toast("Could not load links");
  }
}

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
    link.textContent = data.shortUrl;
    $("copy-result").onclick = () => copy(data.shortUrl);
    copy(data.shortUrl);
    form.reset();
    load();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Shorten link";
  }
});

load();
setInterval(load, 15000);
