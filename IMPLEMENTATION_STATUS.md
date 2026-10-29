# Implementation status

Updated 2026-10-29. Active branch: `arena/53208eb5-nllm`. The clean-checkout browser test fix is locally verified and awaits commit/push so hosted CI can rerun. Prioritized details: [`docs/CHALLENGE_CHECKLIST.md`](docs/CHALLENGE_CHECKLIST.md).

## Current state

- **Implemented:** isolated notebooks and source CRUD/duplication, content/title search and source selection, local evidence retrieval with page/line citations and insufficient-evidence behavior, optional direct OpenAI-compatible/Anthropic/Gemini APIs, bounded PDF/DOCX/PPTX/text/GitHub ingestion, evidence digest/flashcards/Markdown/HTML/CSV/JSON exports, offline PWA shell, Rust core prototype, and CI configuration.
- **Clean-checkout fix:** hosted browser tests previously served ignored `dist/` before it was built. `test:browser` now builds the static app before starting its local server. Verified from a clean local state by removing `dist/` and running `npm run test:browser`: build succeeded and browser workflow passed 1/1.
- **Latest `npm run verify`: passed.** JavaScript syntax checks; **22/22 unit tests plus 1/1 browser workflow (23 total)**; `npm audit --audit-level=moderate` reported **0 vulnerabilities**; production bundle built at 0.71 MiB with a 1.35 MiB PDF worker and copied PDF.js standard fonts/CMaps.
- **Browser coverage:** bundled Chromium 138.0.7204.0 exercises source/chat/citation flows, notebook isolation and duplication, HTML/CSV/JSON downloads, backup restore, responsive settings, service-worker activation, and offline reload with the active notebook/source retained in IndexedDB.
- **Hosted CI:** first four push-triggered runs failed at the browser step due to the missing pre-test build. GitHub check annotation exposed `/` returning 404 on the clean runner. Fix passes locally; next push should rerun CI. Rust/Pages jobs have not completed successfully yet.

## Explicitly incomplete/unverified

Rust/Cargo checks and WASM integration; hosted CI after the fix; Pages deployment; live provider requests; OCR, audio/video/YouTube/Instagram ingestion; local AI inference; audio generation; PPTX/PDF export; desktop/mobile installers. REA was not run because local Node is below its declared requirement and no MCP inspection client was available. No deployment or release artifact is claimed.
