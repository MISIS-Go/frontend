function env(name: string, fallback?: string) {
  const value = Deno.env.get(name);
  if (value == null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function envNumber(name: string, fallback: number) {
  return Number(env(name, String(fallback)));
}

function html(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { ...init, headers });
}

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

const port = envNumber("FRONTEND_PORT", 8000);
const publicBackendWsPort = env("HOST_BACKEND_PORT", "18001");
const publicChatWsPort = env("HOST_CHAT_PORT", "18007");
const publicBackendWsPath = env("PUBLIC_BACKEND_WS_PATH", "");
const publicChatWsPath = env("PUBLIC_CHAT_WS_PATH", "");
const frontendRoot = new URL(".", import.meta.url);
const authUrl = env("FRONTEND_AUTH_URL", "http://127.0.0.1:18002");
const backendUrl = env("FRONTEND_BACKEND_URL", "http://127.0.0.1:18001");
const chatUrl = env("FRONTEND_CHAT_URL", "http://127.0.0.1:18007");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

function resolvePath(pathname: string) {
  if (pathname === "/") return new URL("./static/index.html", frontendRoot);
  if (pathname.startsWith("/assets/")) return new URL(`.${pathname}`, frontendRoot);
  if (pathname.startsWith("/data/")) return new URL(`.${pathname}`, frontendRoot);
  if (pathname.startsWith("/static/")) return new URL(`.${pathname}`, frontendRoot);
  if (pathname === "/styles.css") return new URL("./static/styles.css", frontendRoot);
  if (pathname === "/app.js") return new URL("./static/app.js", frontendRoot);
  return null;
}

async function serveFile(pathname: string) {
  const filePath = resolvePath(pathname);
  if (!filePath) return null;
  try {
    const body = await Deno.readFile(filePath);
    const headers = new Headers();
    const ext = [...contentTypes.keys()].find((entry) => pathname.endsWith(entry)) ?? ".html";
    headers.set("content-type", contentTypes.get(ext) ?? "application/octet-stream");
    return new Response(body, { headers });
  } catch {
    return null;
  }
}

async function proxyTo(base: string, request: Request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  try {
    const proxied = await fetch(`${base}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });
    return new Response(proxied.body, { status: proxied.status, headers: proxied.headers });
  } catch {
    return json({ ok: false, error: `Upstream unavailable: ${base}` }, { status: 503 });
  }
}

async function proxyToChat(base: string, request: Request) {
  const url = new URL(request.url);
  const nextPath = url.pathname.replace(/^\/chat/, "") || "/";
  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  try {
    const proxied = await fetch(`${base}${nextPath}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });
    return new Response(proxied.body, { status: proxied.status, headers: proxied.headers });
  } catch {
    return json({ ok: false, error: `Upstream unavailable: ${base}` }, { status: 503 });
  }
}

function teapotPage(pathname: string) {
  return html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>418 | Bezum</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="secret-page">
    <main class="secret-shell">
      <p class="eyebrow">418 Instead Of 4xx</p>
      <h1>The teapot does not know this route</h1>
      <p class="lede">The path <code>${pathname}</code> was not found in the outer Bezum world.</p>
      <a class="secret-link" href="/">Return to the plaza</a>
    </main>
  </body>
</html>`,
    { status: 418 },
  );
}

function flagPage() {
  const cinema = env("PUBLIC_FLAG_TEXT", "absolute cinema");
  const hint = env("HINT_PUBLIC_FLAG", "the public secret is only the front door");
  return html(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>/flag | Bezum</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="secret-page">
    <main class="secret-shell">
      <p class="eyebrow">Secret Route</p>
      <h1>${cinema}</h1>
      <p class="lede">You found the public easter egg. The real flags live deeper inside the services.</p>
      <div class="secret-placard">${hint}</div>
      <a class="secret-link" href="/">Hide the find and return</a>
    </main>
  </body>
</html>`,
  );
}

console.log(`Frontend listening on http://localhost:${port}`);

Deno.serve({ port }, async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return new Response("ok");
  }

  if (url.pathname === "/flag") {
    return flagPage();
  }

  if (url.pathname === "/config.js") {
    return new Response(
      `window.BEZUM_CONFIG = ${JSON.stringify({
        backendWsPort: publicBackendWsPort,
        chatWsPort: publicChatWsPort,
        backendWsPath: publicBackendWsPath,
        chatWsPath: publicChatWsPath,
      })};`,
      { headers: { "content-type": "text/javascript; charset=utf-8" } },
    );
  }

  if (url.pathname.startsWith("/auth/")) {
    return await proxyTo(authUrl, request);
  }

  if (url.pathname.startsWith("/chat/")) {
    return await proxyToChat(chatUrl, request);
  }

  if (url.pathname.startsWith("/api/")) {
    return await proxyTo(backendUrl, request);
  }

  const file = await serveFile(url.pathname);
  if (file) return file;

  if (url.pathname === "/") {
    return (await serveFile("/")) ?? teapotPage("/");
  }

  return teapotPage(url.pathname);
});
