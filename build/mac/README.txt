World Cup 2026 Lab — macOS install (unsigned build)
====================================================

RECOMMENDED DOWNLOAD: the .dmg file (not the zip).
The DMG includes this app, Install.command, and README.

If macOS says the app is "damaged", that is normal for downloads from a
public URL without Apple code signing. The app is not broken.

OPTION A — Recommended
  Open the .dmg → double-click "Install.command"
  It clears the quarantine flag and installs to Applications.

OPTION B — Manual
  1. Drag "World Cup 2026 Lab.app" to Applications
  2. Open Terminal and run:
     xattr -cr "/Applications/World Cup 2026 Lab.app"
  3. Open the app from Applications (or right-click → Open the first time)

OPTION C — First launch only
  Right-click the app → Open → Open (do not double-click the first time)

For a fully trusted install with no extra steps, the publisher must sign
and notarize with an Apple Developer ID (npm run build:mac:signed).
