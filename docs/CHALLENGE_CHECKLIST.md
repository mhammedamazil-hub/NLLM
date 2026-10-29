# One-run execution checklist

Updated 2026-10-29. This checklist distinguishes code present, locally tested, built, and externally unverified. A checkbox means the stated acceptance gate passed—not that deployment or broad product parity is complete.

## Prioritized implementation and evidence

1. [x] **Notebook/source UX:** isolated notebooks, switching, create/rename/delete/duplicate; source rename/remove/selection; title/content filter; contextual follow-ups and copy actions. Browser workflow exercises the principal paths.
2. [x] **Grounded retrieval and configurable AI:** local lexical ranking, selected-source scope, source/page/line citation chips, explicit insufficient-evidence responses, contradictory passages retained; direct OpenAI-compatible, Anthropic, and Gemini adapters with bounded errors. Deterministic request/retrieval tests pass; no live provider credentials/request used.
3. [x] **Bounded ingestion:** paste/text and selected public GitHub files; in-browser PDF/DOCX/PPTX parsers with provenance/size handling and corrupt-file errors. Parser unit tests pass. No OCR, arbitrary web extraction, audio, video, or caption acquisition.
4. [x] **Offline study/export:** evidence digest, interactive flashcards, Markdown notes, standalone HTML report, CSV flashcards, JSON backup and validated restore. Browser workflow verifies report/CSV/JSON downloads and restore.
5. [x] **PWA/build:** bundled static output, service-worker shell and fetched PDF.js asset caching. Clean build succeeds. Chromium workflow verifies service-worker activation, responsive settings, and offline shell plus IndexedDB data after reload.
6. [x] **Local browser automation and package checks:** pinned Chromium/Playwright workflow passes locally. `npm run verify` runs syntax checks, unit and browser tests, npm audit, and production build.
7. [ ] **Rust/WASM runtime:** Rust domain prototype and CI configuration exist; local `rustc`/`cargo` are unavailable. WASM compilation/integration remains unverified.
8. [ ] **Native/media packaging:** audio/YouTube/Instagram/native installers are not built. No FFmpeg, yt-dlp, desktop SDKs, or Android toolchain were available. Do not claim those outputs.
9. [ ] **External release/deploy:** hosted runs 1–4 failed in browser automation because a clean GitHub runner had no `dist/` when the test server started. `test:browser` now builds `dist/` before running. A clean local rerun and full verification pass; the hosted rerun is pending. Audit/Rust/Pages and releases are not yet verified on GitHub.

## Measured environment and blockers

- Linux x86_64, 2 CPUs, 3.8 GiB RAM; Node 22.22.3/npm 10.9.8. No system browser, Rust/Cargo, Docker, FFmpeg, or yt-dlp. The pinned Chromium package runs with NSS/NSPR libraries from its bundled Amazon Linux archive extracted under `/tmp`; no system packages were installed.
- REA `rea-agents@6.8.0` requires Node `^22.23.4 || ^24.22.1 || >=26.12.1` (installed Node is 22.22.3); no MCP client/browser-observation session is available. REA was not installed/run and is not a language model.
- GitHub API is used for selected public text files. No CORS proxy is introduced. External model use remains direct, optional, and subject to provider CORS/data policies.

## Latest local acceptance results

- `npm ci`: completed; 51 packages audited, **0 vulnerabilities**.
- `npm run test:browser` after deliberately removing ignored `dist/`: the script rebuilt the PWA and passed **1/1 browser workflow** on bundled Chromium 138.0.7204.0.
- `npm run verify`: **passed** after the clean-checkout fix: syntax checks; **22/22 unit tests + 1/1 browser workflow (23 total)**; `npm audit --audit-level=moderate` reported **0 vulnerabilities**; production build succeeded (0.71 MiB app bundle, 1.35 MiB PDF worker, standard fonts/CMaps copied).
- Hosted runs 1–4 (`feb7909` through `f514dca`) ran before the clean-checkout fix. Their browser step served `/` as 404 because no build preceded it. The fix is locally verified but awaits another hosted push run; the raw log host was inaccessible from this sandbox, but the final run's check annotation exposed the 404 and startup timeout.
- Rust commands, hosted CI after the fix, Pages deployment, live provider calls, OCR/media processing, and native packages are **not yet verified/not implemented**.
