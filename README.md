# Frontend

External gateway and browser game shell for Bezum.

- `server.ts` serves the static UI, `/flag`, and proxies `auth` and `api` requests to internal services.
- `static/` contains the SPA shell for the world, chat, notes, bank, and arcade.
- `assets/` preserve the cartoon style and are used as room/profile stickers.
- `data/world.json` contains the seed room configuration.

Local run:

```bash
deno run --allow-net --allow-read --allow-env server.ts
```
