/**
 * CORS for Deno HTTP servers.
 *
 * - Default: **no** `Access-Control-Allow-Origin` (same-origin / non-browser clients work).
 * - Set `CORS_ALLOW_ORIGINS` to a comma-separated list of origins (e.g. `https://app.example.com,https://admin.example.com`) to allow browser cross-origin calls from those origins only (reflected `Origin`).
 * - `ALLOW_INSECURE_CORS_ALL=true` restores `*` (dev only).
 */

export function parseAllowedOrigins(): string[] {
  const raw = Deno.env.get("CORS_ALLOW_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** JSON + HTML responses: merge these into headers when returning a body. */
export function corsHeadersForRequest(req: Request): Record<string, string> {
  if (Deno.env.get("ALLOW_INSECURE_CORS_ALL") === "true") {
    return {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
      "access-control-allow-headers": "content-type, x-api-key, authorization",
    };
  }

  const origin = req.headers.get("Origin");
  if (!origin) {
    return {};
  }

  const allowed = parseAllowedOrigins();
  if (allowed.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      vary: "Origin",
      "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
      "access-control-allow-headers": "content-type, x-api-key, authorization",
    };
  }

  return {};
}

export function corsPreflightResponse(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;

  if (Deno.env.get("ALLOW_INSECURE_CORS_ALL") === "true") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
        "access-control-allow-headers": "content-type, x-api-key, authorization",
        "access-control-max-age": "86400",
      },
    });
  }

  const origin = req.headers.get("Origin");
  const allowed = parseAllowedOrigins();
  if (origin && allowed.includes(origin)) {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        vary: "Origin",
        "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
        "access-control-allow-headers": "content-type, x-api-key, authorization",
        "access-control-max-age": "86400",
      },
    });
  }

  return new Response(null, { status: 403 });
}
