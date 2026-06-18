/**
 * Spawn options that hide console windows on Windows.
 * @param {import('node:child_process').SpawnOptions} [extra]
 */
export function hiddenSpawnOptions(extra = {}) {
  /** @type {import('node:child_process').SpawnOptions} */
  const opts = {
    windowsHide: true,
    ...extra,
  };
  if (process.platform === "win32") {
    opts.creationFlags = (opts.creationFlags ?? 0) | 0x08000000; // CREATE_NO_WINDOW
  }
  return opts;
}

/**
 * @param {import('node:child_process').SpawnSyncOptions} [extra]
 */
export function hiddenSpawnSyncOptions(extra = {}) {
  /** @type {import('node:child_process').SpawnSyncOptions} */
  const opts = {
    windowsHide: true,
    ...extra,
  };
  if (process.platform === "win32") {
    opts.creationFlags = (opts.creationFlags ?? 0) | 0x08000000;
  }
  return opts;
}
