# APK Evidence — Gemini Notebook (Tailwind)

## Source
- Archive: `google_drive/gemininotebook_apkmirror.com.7z` (61,632,700 bytes, sha256 `72cd5f7de2be44975bfec815168a6be8aa9e9299d1024c3aa20ff5bd7931a398`)
- Recovered from Google Drive via connector.
- Format: APKM bundle (APKMirror installer) containing split APKs.

## Extracted artifacts (`apk-work/`)
- `gemini-notebook.apk` — APKM bundle (61.7 MB)
- `base.apk` — main app (38.2 MB, 1,380 entries)
- `split_config.arm64_v8a.apk` (19.3 MB) — ARM64 native libs
- `split_config.x86_64.apk` (19.8 MB) — x86_64 native libs
- `split_config.{ldpi,mdpi,hdpi,xhdpi,xxhdpi,tvdpi}.apk` — density resources

## Key facts from AndroidManifest.xml
- **Package:** `com.google.android.apps.labs.language.tailwind`
- **App name:** Gemini Notebook (internal label `GeminiNotebook_prod`)
- **Version:** `1.66.7.1013673261-172860`
- **Version code:** 172860
- **minSdkVersion:** 26 (Android 8.0)
- **targetSdkVersion:** 36
- **Build:** Android (Java/Kotlin, not Flutter/React Native — native Android app)
- **DEX files:** classes.dex, classes2.dex, classes3.dex, classes4.dex (4 dex files)

## Observed features (from manifest strings)
- Notification channel (`NOTIFICATION_ACTION_CHANNEL`)
- BOOT_COMPLETED receiver (foreground service)
- Chrome integration (`apps.chrome`)
- Cloud sync (`play.google.com/store`, `accounts.google.com`)
- Media playback (audio/video)
- NotebookLM branding (`notebook.google.com`, `notebooklm.google.com`)
- Deep links: `com.google.android.apps.labs.language.tailwind://...`
- Export/share via `Intent.ACTION_SEND`

## Implications for Notebook Studio
- The reference app is a **native Android app** (Kotlin/Java), not a web app.
- NotebookLM web (notebook.google.com) is the web reference for parity.
- Our PWA approach (React + WASM SQLite) is a valid local-first alternative.
- Key parity targets: notebook management, source import, grounded chat,
  artifact generation (mind maps, audio overviews, etc.).

## Notes
- APKM bundle: APKMirror's format wraps split APKs in a single file with
  an installer URL and signature.
- The `base.apk` is the app code + base resources; split APKs carry
  density/locale/ABI-specific resources.
- Extraction tool: `py7zr` (pip install). No system 7z available in sandbox.
