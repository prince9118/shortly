# Shortly

A simple URL shortener built with Node.js, Express 5 and TypeScript, organised as an npm workspaces monorepo.

## Structure

```
apps/
  api/        Express REST API + redirect service
  web/        Static web UI (HTML/CSS/JS), served by the API
packages/
  db/         Reserved for a future database layer
  types/      Shared types (placeholder)
```

## Getting started

Requirements: Node.js 22.6+ and npm. Open http://localhost:4000 for the web UI.

```bash
npm install
npm run dev        # API + web UI with hot reload on http://localhost:4000
```

### Configuration

| Variable   | Default                  | Description                          |
| ---------- | ------------------------ | ------------------------------------ |
| `PORT`     | `4000`                   | Port the API listens on              |
| `BASE_URL` | `http://localhost:$PORT` | Public base URL used in `shortUrl`   |
| `DATA_FILE`| `apps/api/data/links.json` | Where links are persisted          |

## API

### `POST /api/links`
Create a short link. `alias` is optional (3-32 chars: letters, digits, `_`, `-`).

```bash
curl -X POST http://localhost:4000/api/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/some/long/path","alias":"example"}'
```

```json
{
  "code": "example",
  "url": "https://example.com/some/long/path",
  "clicks": 0,
  "createdAt": "2026-11-09T10:00:00.000Z",
  "shortUrl": "http://localhost:4000/example"
}
```

Errors: `400` invalid URL/alias, `409` alias taken.

### `GET /:code`
Redirects (`302`) to the original URL and increments the click counter. `404` if unknown.

### `GET /api/links`
Lists all links (newest first) with totals: `{ links, totals: { links, clicks } }`.

### `GET /api/links/:code`
Returns link details and click count.

### `DELETE /api/links/:code`
Deletes a link. Returns `204`.

### `GET /health`
Health check.

## Notes

- Links persist to a JSON file (`apps/api/data/links.json`, git-ignored). Fine for a single instance; use a real database for scale.
- The UI supports custom aliases, copy-to-clipboard, click stats, deleting links, and light/dark mode.
- Only `http` and `https` URLs are accepted.

## License

ISC
