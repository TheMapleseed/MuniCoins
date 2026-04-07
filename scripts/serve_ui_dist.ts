/**
 * Serves `ui/dist` after `trunk build` (Leptos WASM + wasm-bindgen glue).
 * Deno-only: no npm; no extra deps beyond the runtime.
 */
const root = `${Deno.cwd()}/ui/dist`.replaceAll("\\", "/");
const port = Number(Deno.env.get("UI_PORT") ?? "3000");

function contentType(path: string): string {
  if (path.endsWith(".wasm")) return "application/wasm";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function safePath(urlPath: string): string | null {
  const dec = decodeURIComponent(urlPath);
  const rel = dec === "/" ? "index.html" : dec.replace(/^\//, "");
  if (rel.includes("..") || rel.startsWith("/")) return null;
  const full = `${root}/${rel}`.replaceAll("//", "/");
  if (!full.startsWith(root)) return null;
  return full;
}

try {
  await Deno.stat(root);
} catch {
  console.error(`Missing ${root}. Build: cd ui && trunk build --release`);
  Deno.exit(1);
}

console.log(`Leptos dist → http://127.0.0.1:${port}/ (${root})`);

Deno.serve({ port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  let path = safePath(url.pathname);
  if (!path) return new Response("bad path", { status: 400 });

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(path);
  } catch {
    return new Response("not found", { status: 404 });
  }

  if (stat.isDirectory) {
    path = `${path}/index.html`.replaceAll("//", "/");
    try {
      await Deno.stat(path);
    } catch {
      return new Response("not found", { status: 404 });
    }
  }

  const body = await Deno.readFile(path);
  return new Response(body, {
    headers: { "content-type": contentType(path) },
  });
});
