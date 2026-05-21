import { readFile } from "node:fs/promises";
import { extname, basename, resolve } from "node:path";
import { readTextAndWordFiles } from "chalk-ycslint";
import { getDriveNameForPath } from "chalk-ycslint";

/** @type {((buffer: Buffer) => Promise<{ text?: string, numpages?: number }>) | null} */
let pdfParse = null;

async function loadPdfParse() {
  if (pdfParse) return pdfParse;
  try {
    const mod = await import("pdf-parse");
    pdfParse = mod.default ?? mod;
    return pdfParse;
  } catch (err) {
    throw new Error(
      "pdf-parse is not installed. Run: npm install (from the app root folder)."
    );
  }
}

/**
 * Read one file for upload. Returns exact absolute path + extracted text (including PDF).
 *
 * @param {string} filePath
 * @param {Map<string, string>} driveMap
 */
export async function readFileForUpload(filePath, driveMap) {
  const absolutePath = resolve(filePath);
  const ext = extname(absolutePath).toLowerCase();

  if (ext === ".pdf") {
    const parse = await loadPdfParse();
    const buffer = await readFile(absolutePath);
    const result = await parse(buffer);
    return {
      path: absolutePath,
      filename: basename(absolutePath),
      driveName: getDriveNameForPath(absolutePath, driveMap),
      mimeType: "application/pdf",
      extension: ".pdf",
      text: result.text || "",
      pageCount: result.numpages ?? null,
    };
  }

  const [item] = await readTextAndWordFiles([absolutePath], { driveMap });
  return {
    ...item,
    path: resolve(item.path || absolutePath),
    extension: extname(item.path || absolutePath).toLowerCase() || null,
  };
}
