# Implementation status

Updated 2026-10-29. Active branch: `arena/53208eb5-nllm`.

## Current state

- **Implemented:** isolated notebooks and source CRUD/duplication; content/title search and source selection; local evidence retrieval with page/line citations and insufficient-evidence behavior; optional direct OpenAI-compatible/Anthropic/Gemini APIs; bounded PDF/DOCX/PPTX/text/GitHub ingestion; evidence digest/flashcards/Markdown/HTML/CSV/JSON exports; offline PWA shell; Rust core prototype and CI configuration.
- **Latest local `npm run verify`: passed:** JavaScript syntax checks; **22/22 unit tests plus 1/1 browser workflow (23 total)**; `npm audit --audit-level=moderate` reported **0 vulnerabilities**; production build passed (0.71 MiB app bundle, 1.35 MiB PDF worker, PDF.js standard fonts/CMaps copied).
- **Clean-checkout browser verification:** removed ignored `dist/`; `npm run test:browser` rebuilt the PWA from scratch and passed on bundled Chromium 138.0.7204.0.
- **Latest hosted CI run `40867947533`:** passed npm install, syntax, 22 unit tests, browser workflow, audit, build, `cargo fmt`, and `cargo test`; Clippy found one test-only `cloned_ref_to_slice_refs` warning. The Rust test now uses `std::slice::from_ref(&p)`. Hosted Clippy rerun is pending.
- **Browser coverage:** imports, chat/citations, notebook isolation/duplication, HTML/CSV/JSON downloads, backup restore, responsive settings, service-worker activation, and offline reload preserving the selected notebook/source in IndexedDB.

## Explicitly incomplete/unverified

Clippy after diagnosing/fixing its warning; WASM integration; Pages deployment; live provider requests; OCR, audio/video/YouTube/Instagram ingestion; local AI inference; audio generation; PPTX/PDF export; desktop/mobile installers. REA was not run because local Node is below its declared requirement and no MCP inspection client was available. No deployment or release artifact is claimed.
