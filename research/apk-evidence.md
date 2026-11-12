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

## Artifact Types (from APK strings + Lottie files)
The APK reveals the complete artifact taxonomy via `NOTEBOOK_LM_ARTIFACT_LINK_SHARE_*`
constants and Lottie animation filenames:

| APK Constant | Lottie Animation | Notebook Studio Schema |
|---|---|---|
| `LINK_SHARE_AUDIO` | `audio_overview_generating_icon` | `audio_overview` ✅ |
| `LINK_SHARE_FLASHCARDS` | `flashcards_generating_icon` | `flashcards` ✅ |
| `LINK_SHARE_INFOGRAPHIC` | `infographic_generating_icon` | — (closest: `table` or `report`) |
| `LINK_SHARE_QUIZ` | `quiz_generating_icon` | `quiz` ✅ |
| `LINK_SHARE_REPORT` | `report_generating_icon` | `report` ✅ |
| `LINK_SHARE_SLIDES` | `slides_generating_icon` | `slides` ✅ |
| `LINK_SHARE_VIDEO` | `explainer_video_generating_icon` | `video_overview` ✅ |
| `LINK_SHARE_MIND_MAP` | `mindmap_generating_icon` | `mindmap` ✅ |
| `LINK_SHARE_TIMELINE` | (no lottie) | `timeline` ✅ |

Additional artifact types from `GEMINI_LINK_SHARE_ARTIFACT_*` constants:
- `ANNOTATED_MULTIMEDIA`, `AUTOMATION_PLAN_IMMERSIVE`, `CODE_IMMERSIVE`
- `DEEP_RESEARCH_IMMERSIVE`, `DOC_IMMERSIVE`, `EMAIL_IMMERSIVE`
- `LEARNING_IMMERSIVE`, `MAP_IMMERSIVE`, `STORYBOOK_IMMERSIVE`
- `UNSPECIFIED` (default/fallback)

These "immersive" variants appear to be newer Gemini-integrated artifact types
beyond the core NotebookLM set. Our 15 schemas cover the core set; the immersive
variants are enhancement opportunities.

## Infographic Styles (from APK assets)
The APK includes 10 infographic style templates:
- `anime`, `bentogrid`, `bricks`, `claymation`, `editorial`, `kawaii`,
  `professional`, `scientific`, `sketchnote`, `storyboard`

These are visual style presets for infographic artifacts — useful for future
artifact renderer customization.

## Implications for Notebook Studio
- The reference app is a **native Android app** (Kotlin/Java), not a web app.
- NotebookLM web (notebook.google.com) is the web reference for parity.
- Our PWA approach (React + WASM SQLite) is a valid local-first alternative.
- Key parity targets: notebook management, source import, grounded chat,
  artifact generation (mind maps, audio overviews, etc.).
- Our 15 artifact schemas cover the core 7-8 types; infographic and immersive
  variants are future enhancement opportunities.
- The APK uses Firebase (messaging, analytics, installations) and Google Play
  billing — not relevant for local-first design.

## Notes
- APKM bundle: APKMirror's format wraps split APKs in a single file with
  an installer URL and signature.
- The `base.apk` is the app code + base resources; split APKs carry
  density/locale/ABI-specific resources.
- Extraction tool: `py7zr` (pip install). No system 7z available in sandbox.
