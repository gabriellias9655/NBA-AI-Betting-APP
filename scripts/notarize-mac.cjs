/**
 * Optional Apple notarization after sign (requires Apple Developer account).
 * Set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID before build.
 *
 * @param {import('electron-builder').AfterSignContext} context
 */
exports.default = async function notarizeMac(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID?.trim();
  const applePassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD?.trim() || process.env.APPLE_ID_PASSWORD?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!appleId || !applePassword || !teamId) {
    console.log(
      "[notarize] Skipped — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID to notarize."
    );
    return;
  }

  const { notarize } = await import("@electron/notarize");
  const appName = context.packager.appInfo.productFilename;

  console.log(`[notarize] Submitting ${appName}.app…`);

  await notarize({
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: applePassword,
    teamId,
  });

  console.log("[notarize] Done — app is ready for public download.");
};
