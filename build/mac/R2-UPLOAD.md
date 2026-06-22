Upload Mac builds to Cloudflare R2 (>300 MB)
============================================

The R2 **web dashboard** limits uploads to **300 MB**.
Electron Mac builds are often **200–280 MB (DMG)** or **300+ MB (zip)**.

## Recommended: upload the DMG (not the zip)

After `npm run build:mac`, use:

```
dist/World Cup 2026 Lab-1.0.0.dmg
```

The DMG already includes **Install.command** and **README.txt**.

## Upload with AWS CLI (any size)

1. Create R2 API token (Cloudflare dashboard → R2 → Manage API tokens).

2. Configure profile (`~/.aws/credentials`):

```ini
[r2]
aws_access_key_id = YOUR_ACCESS_KEY
aws_secret_access_key = YOUR_SECRET_KEY
```

3. Upload:

```bash
aws s3 cp "dist/World Cup 2026 Lab-1.0.0.dmg" \
  s3://yieldlyx/releases/ \
  --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com \
  --profile r2
```

4. Enable public access on the bucket or use a custom domain for the download URL.

## Wrangler (alternative)

```bash
npx wrangler r2 object put yieldlyx/releases/World-Cup-2026-Lab-1.0.0.dmg \
  --file="dist/World Cup 2026 Lab-1.0.0.dmg"
```

## Rebuild slimmer (optional)

The project strips extra locales and pdf-parse bloat. Rebuild:

```bash
npm run build:mac
```

Check sizes printed by `[mac-release]` at the end of the build.
