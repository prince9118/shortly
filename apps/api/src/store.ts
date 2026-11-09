import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LinkRecord {
  code: string;
  url: string;
  clicks: number;
  createdAt: string;
  lastClickedAt: string | null;
}

/** Tiny JSON-file backed store. Writes are debounced and atomic (tmp + rename). */
export class LinkStore {
  private links = new Map<string, LinkRecord>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, "utf8")) as LinkRecord[];
        for (const r of data) this.links.set(r.code, { ...r, lastClickedAt: r.lastClickedAt ?? null });
      } catch (err) {
        console.error(`Could not read ${file}, starting empty:`, err);
      }
    }
  }

  has(code: string) {
    return this.links.has(code);
  }

  get(code: string) {
    return this.links.get(code);
  }

  list(): LinkRecord[] {
    return [...this.links.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  create(code: string, url: string): LinkRecord {
    const record: LinkRecord = {
      code,
      url,
      clicks: 0,
      createdAt: new Date().toISOString(),
      lastClickedAt: null,
    };
    this.links.set(code, record);
    this.scheduleSave();
    return record;
  }

  click(code: string): LinkRecord | undefined {
    const r = this.links.get(code);
    if (!r) return undefined;
    r.clicks += 1;
    r.lastClickedAt = new Date().toISOString();
    this.scheduleSave();
    return r;
  }

  delete(code: string): boolean {
    const ok = this.links.delete(code);
    if (ok) this.scheduleSave();
    return ok;
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.list(), null, 2));
    renameSync(tmp, this.file);
  }

  private scheduleSave() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 200);
  }
}
