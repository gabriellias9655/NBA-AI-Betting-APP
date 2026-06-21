/** @type {import('electron-builder').Configuration} */
const base = require("./package.json").build;
const path = require("path");
const signed = process.env.SIGN_WINDOWS === "true";
const signMac = process.env.SIGN_MAC === "true";

const installCommand = path.join(__dirname, "build/mac/Install.command");
const readme = path.join(__dirname, "build/mac/README.txt");

/** @type {import('electron-builder').Configuration} */
const config = {
  ...base,
  forceCodeSigning: signed,
  afterSign: signMac ? "scripts/notarize-mac.cjs" : undefined,
  win: {
    ...base.win,
    publisherName: "YCSLINT",
    signAndEditExecutable: false,
    signDlls: signed,
    signingHashAlgorithms: signed ? ["sha256"] : undefined,
  },
  mac: {
    ...base.mac,
    // Ad-hoc sign for unsigned builds (better than identity:null for downloaded apps).
    identity: signMac ? undefined : "-",
    hardenedRuntime: signMac,
    entitlements: signMac ? "build/entitlements.mac.plist" : undefined,
    entitlementsInherit: signMac ? "build/entitlements.mac.plist" : undefined,
    notarize: false,
  },
  dmg: {
    ...base.dmg,
    contents: [
      { x: 130, y: 220, type: "file" },
      { x: 410, y: 220, type: "link", path: "/Applications" },
      { x: 130, y: 360, type: "file", path: installCommand, name: "Install.command" },
      { x: 280, y: 360, type: "file", path: readme, name: "README.txt" },
    ],
  },
};

module.exports = config;
