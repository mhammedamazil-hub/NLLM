# One-run execution checklist

Updated 2026-10-29. This checklist distinguishes code present, locally tested, built, and externally unverified. A checkbox means the stated local acceptance gate passed—not that deployment or broad product parity is complete.

## Prioritized implementation and evidence

1. [x] **Notebook/source UX:** isolated notebooks, switching, create/rename/delete/duplicate; source rename/remove/selection; name/content filter; contextual follow-ups and copy actions. Browser workflow exercises the principal paths.
2. [x] **Grounded retrieval and configurable AI:** local lexical ranking, selected-source scope, source/page/line citation chips, explicit insufficient-evidence responses, contradictory passages retained; direct OpenAI-compatible, Anthropic, and Gemini adapters with bounded errors. Deterministic request/retrieval tests pass; no live provider credentials/request used.
3. [x] **Bounded ingestion:** paste/text and selected public GitHub files; in-browser PDF/DOCX/PPTX parsers with provenance/size handling and corrupt-file errors. Parser unit tests pass. No OCR, arbitrary web extraction, audio, video, or caption acquisition.
4. [x] **Offline study/export:** evidence digest, interactive flashcards, Markdown notes, standalone HTML report, CSV flashcards, JSON backup and validated restore. Browser workflow verifies report/CSV/JSON downloads and restore.
5. [x] **PWA/build:** bundled static output, service worker shell and fetched PDF.js asset caching. Build succeeds. Chromium workflow verifies service-worker activation, responsive settings view, and offline shell plus IndexedDB data after reload.
6. [x] **Browser automation and package checks:** pinned Chromium/Playwright workflow is included and passes locally after using the package's NSS/NSPR libraries. `npm run verify` is the complete local gate; latest result below.
7. [ ] **Rust/WASM runtime:** Rust domain prototype and CI configuration exist; local `rustc`/`cargo` are unavailable. WASM compilation/integration and GitHub CI results remain unverified.
8. [ ] **Native/media packaging:** audio/YouTube/Instagram/native installers are not built. No FFmpeg, yt-dlp, desktop SDKs, or Android toolchain were available. Do not claim those outputs.
9. [ ] **External release/deploy:** GitHub Actions and Pages/release packaging are configured but have not run in this session; no published artifact or deployment is claimed.

## Measured environment and blockers

- Linux x86_64, 2 CPUs, 3.8 GiB RAM; Node 22.22.3/npm 10.9.8. No system browser, Rust/Cargo, Docker, FFmpeg, or yt-dlp. npm's pinned Chromium can run with NSS/NSPR libraries from its bundled Amazon Linux archive extracted under `/tmp`; no system packages were installed.
- REA `rea-agents@6.8.0` requires Node `^22.23.4 || ^24.22.1 || >=26.12.1` (installed Node is 22.22.3); no MCP client/browser-observation session is available. REA was not installed/run and is not a language model.
- GitHub API is used for selected public text files. No untrusted CORS proxy is introduced. External model use remains direct, optional, and subject to provider CORS/data policies.

## Latest local acceptance results

- `node --check web/parsers.js && node --test tests/parsers.test.js`: **4/4 passed** (DOCX, PPTX, PDF page mapping, corrupt Office input).
- `npm test`: **23/23 passed** (serial Node test runner; includes parser, backup, retrieval, provider, and browser workflow suites).
- `npm run verify`: **passed** after the browser/PWA fixes. Syntax checks passed; **23/23 tests passed**; `npm audit --audit-level=moderate` reported **0 vulnerabilities**; production build succeeded (0.71 MiB app bundle, 1.35 MiB PDF worker, with standard fonts/CMaps copied into `dist/`).
- Rust commands, hosted CI, Pages deployment, live provider calls, OCR/media processing, and native packages: **not verified/not implemented**, as stated above.
