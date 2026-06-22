Windows install notes (unsigned build)
======================================

If a desktop shortcut says "Missing Shortcut" / cannot find WorldCup2026Lab.exe:

1. Uninstall "World Cup 2026 Lab" from Settings → Apps.
2. Reinstall using the official Setup .exe (not a copied folder from dist/).
3. Check this file exists after install:
   C:\Program Files\World Cup 2026 Lab\WorldCup2026Lab.exe
4. If missing, Windows Defender may have quarantined it:
   - Windows Security → Protection history → allow / restore
   - Or add an exclusion for the install folder, then reinstall.

Build from Mac: always use 64-bit Intel Windows target:
  npm run build:win
(Do not upload win-arm64-unpacked unless users have ARM Windows.)

SmartScreen on first run: More info → Run anyway.
