/** @type {import('electron-builder').Configuration} */
const base = require("./package.json").build;
const signed = process.env.SIGN_WINDOWS === "true";

module.exports = {
  ...base,
  forceCodeSigning: signed,
  win: {
    ...base.win,
    publisherName: "YCSLINT",
    signAndEditExecutable: signed,
    signDlls: signed,
    signingHashAlgorithms: signed ? ["sha256"] : undefined,
  },
};
