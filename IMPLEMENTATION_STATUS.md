# Implementation status

Updated 2026-10-29. See [`docs/CHALLENGE_CHECKLIST.md`](docs/CHALLENGE_CHECKLIST.md) for prioritized scope and the continuously updated test/deployment checklist.

## Implemented

- Responsive static PWA shell, browser-local IndexedDB persistence, notebook/source operations, theme and provider settings.
- Bounded paste/text, public GitHub selected-file, PDF, DOCX, and PPTX text ingestion; file/page/slide provenance; deterministic local retrieval with source-grounded citations and insufficient-evidence behavior.
- Optional direct OpenAI-compatible, Anthropic, and Gemini adapters; no mandatory key or hosted AI/service.
- Source digest, interactive flashcards, Markdown notes, HTML report, CSV flashcards, JSON export/import with citation validation.
- Bundled build, PWA service worker with offline app shell and fetched PDF.js assets, parser/provider/retrieval unit tests, and bundled Chromium browser workflow.

## Verification state

- `npm run verify`: **passed** after the latest browser/PWA fixes. JavaScript syntax checks passed; **23/23 tests passed**; `npm audit --audit-level=moderate` reported **0 vulnerabilities**; production build completed (app bundle 0.71 MiB, PDF worker 1.35 MiB, with standard fonts and CMaps copied).
- Browser subtest ran on bundled Chromium **138.0.7204.0**, including notebook/source/chat/citation flows, notebook isolation/duplication, HTML/CSV/JSON downloads, backup restore, PWA activation, responsive settings, and offline reload with IndexedDB data.
- The first GitHub Actions run (push-triggered on `feb7909`) failed at the combined `npm run verify` step. The check summary did not identify a sub-check and the raw log host was inaccessible from this sandbox. CI is now split into individual validation steps; the follow-up run is pending. Rust and Pages jobs did not execute. Live provider calls and release publication were not performed.

## Explicit limits

No scanned-PDF OCR, arbitrary web scraping, audio/YouTube/Instagram ingestion, local LLM, offline inference, audio generation, PPTX/PDF export, sharing/sync, or native Android/desktop installers. Rust source and CI job exist, but there is no verified local Rust toolchain or compiled/WASM browser runtime. REA was not run because the available Node is below its package engine requirement and no MCP browser-observation client is available. SourceForge is a provisional product name; repository identity is NLLM.
