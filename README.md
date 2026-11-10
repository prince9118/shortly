# Shortly

A URL shortener with a built-in web UI. Paste a long link, get a short one, and keep count of every click.

Built with Node.js, Express 5 and TypeScript, organised as an npm workspaces monorepo. The API serves the web UI, so there is only one server to run.

## Features

- Shorten any `http(s)` URL to a random 7-character code, or choose your own alias
- `302` redirects with a click counter and last-clicked timestamp
- Links persist to disk and survive restarts
- Web UI with:
  - an animated "snip" that cuts your long link down to the short one
  - scrolling URL strips and count-up stats
  - a searchable list showing clicks and characters saved per link
  - copy, open and delete actions
- Small REST API (see below)

## Structure

```
apps/
  api/          Express server: REST API, redirects, static hosting for the UI
    src/
      index.ts  Routes and server setup
      store.ts  JSON-file link store (debounced, atomic writes)
  web/          Web UI: index.html, styles.css, app.js (no build step)
packages/
  db/           Reserved for a future database layer
  types/        Reserved for shared types
```

## Getting started

Requirements: Node.js 22.6+ and npm.

```bash
npm install
npm run dev
```

Then open http://localhost:4000. The server reloads automatically when you edit files in `apps/api`, and the UI files are served fresh on every refresh.

### Configuration

Set these as environment variables.

| Variable    | Default                    | Description                                   |
| ----------- | -------------------------- | --------------------------------------------- |
| `PORT`      | `4000`                     | Port the server listens on                    |
| `BASE_URL`  | `http://localhost:$PORT`   | Public base URL used to build `shortUrl`      |
| `DATA_FILE` | `apps/api/data/links.json` | Where links are saved                         |

Example: `PORT=8080 BASE_URL=https://sho.rt npm run dev`

## API

All bodies are JSON. A link looks like this:

```json
{
  "code": "example",
  "url": "https://example.com/some/long/path",
  "clicks": 0,
  "createdAt": "2026-11-09T10:00:00.000Z",
  "lastClickedAt": null,
  "shortUrl": "http://localhost:4000/example"
}
```

| Method   | Path               | Description                                              |
| -------- | ------------------ | -------------------------------------------------------- |
| `POST`   | `/api/links`       | Create a link. Body: `{ "url", "alias"? }`. Returns `201` |
| `GET`    | `/api/links`       | List links (newest first) plus totals                    |
| `GET`    | `/api/links/:code` | Get one link                                             |
| `DELETE` | `/api/links/:code` | Delete a link. Returns `204`                             |
| `GET`    | `/:code`           | Redirect (`302`) to the original URL and count the click |
| `GET`    | `/health`          | Health check                                             |

### Create a link

```bash
curl -X POST http://localhost:4000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/some/long/path","alias":"example"}'
```

- `url` is required, must be `http` or `https`, and at most 2048 characters.
- `alias` is optional: 3-32 characters of letters, digits, `_` or `-`.
- Errors: `400` for an invalid URL or alias, `409` if the alias is taken or reserved (`api`, `health`, `index`, `app`, `styles`, `favicon`).

### List links

`GET /api/links` returns:

```json
{
  "links": [ /* link objects */ ],
  "totals": { "links": 12, "clicks": 340 }
}
```

## Notes

- Links are stored in a single JSON file (`apps/api/data/links.json`, git-ignored). That is fine for one instance. For multiple instances or heavy traffic, swap `store.ts` for a real database.
- The UI loads Bricolage Grotesque and JetBrains Mono from Google Fonts and falls back to system fonts offline.
- The UI respects the system "reduce motion" setting.

## License

ISC
