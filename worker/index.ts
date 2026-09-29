/**
 * Cloudflare Worker in front of the static export, for /media/* only
 * (wrangler.jsonc → assets.run_worker_first). Everything else is served by
 * static assets directly.
 *
 * Static-asset responses ignore HTTP Range requests, and Safari on iOS will not
 * play a <video> without them, so this answers byte ranges (206) from the asset.
 */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // suffix range: the last N bytes
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const range = request.headers.get("Range");
    // Fetch the whole asset (without the Range header) from the asset store.
    const asset = await env.ASSETS.fetch(new Request(request.url, { method: "GET", headers: { "Accept-Encoding": "identity" } }));
    const headers = new Headers(asset.headers);
    headers.set("Accept-Ranges", "bytes");
    if (!asset.ok) return new Response(asset.body, { status: asset.status, headers });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers });
    if (!range) return new Response(asset.body, { status: 200, headers });

    const body = await asset.arrayBuffer();
    const size = body.byteLength;
    const r = parseRange(range, size);
    if (!r) {
      headers.set("Content-Range", `bytes */${size}`);
      headers.delete("Content-Length");
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${r.start}-${r.end}/${size}`);
    headers.set("Content-Length", String(r.end - r.start + 1));
    return new Response(body.slice(r.start, r.end + 1), { status: 206, headers });
  },
};
