# Architecture

## Current vertical slice

- **Distribution:** source HTML/CSS/ES modules are bundled by esbuild into a static distributable at ignored `dist/`. The browser app has no runtime backend. PWA install/service-worker behavior requires HTTPS or localhost.
- **Browser shell:** responsive research workspace, notebook switcher, source list/search/selection, conversation, study studio, provider settings, theme, storage estimate, and offline status.
- **Persistence:** IndexedDB (`sourceforge-local`, schema v1) stores notebook records, extracted source text/chunks, chat history, and preferences on the user's device. Service worker caches the app shell and PDF.js assets when fetched. JSON export is the portable backup; browser storage is not a backup.
- **Ingestion:** bounded file upload/paste → extraction → validation → line-aware chunks → IndexedDB. Supported imports include plain text, Markdown, CSV, JSON, code-like text, PDF (PDF.js), DOCX (Mammoth), and PPTX slide text (JSZip/XML). Provenance includes page/slide breaks where available. PDF OCR is not provided. Public GitHub tree/content APIs support user-selected bounded text files when browser/network policy permits. No whole-repository clone, arbitrary-site scraper, or CORS proxy.
- **Retrieval:** deterministic, notebook-scoped lexical ranking (term frequency/inverse document frequency, phrase and source-title boosts); only enabled sources are searched. References retain source ID, name, page and line ranges. A thresholded insufficient-evidence path has no citation chips; contradictory passages are kept as separate evidence.
- **Chat:** local evidence excerpt mode is the default. Optional OpenAI-compatible chat completions, Anthropic Messages, or Gemini `generateContent` requests go directly from the browser on explicit submission. The prompt treats source passages as untrusted. UI references are derived from locally retrieved chunks, not model-authored citation links. Browser CORS, provider terms, retention, and possible usage costs apply.
- **Study/export:** evidence digest, passage-backed interactive flashcards, Markdown notes, standalone HTML report, CSV flashcards, and versioned JSON notebook export/import. Restore reassigns notebook/source IDs and validates evidence mappings. No generative output is represented as a verified source fact.
- **Rust boundary:** `crates/sourceforge-core` is a dependency-free Rust domain prototype with CI checks. Rust/Cargo are absent locally, so the crate was not compiled here and is not the browser execution engine. `web/core.js` is the executable JavaScript equivalent. WASM build/runtime wiring is a follow-up, not a shipped claim.

## Data flow and safety

`Local file / paste / selected GitHub file → bounded extraction (8 MiB upload; 200k extracted characters) → normalize → chunk with page/line metadata → IndexedDB → local selected-source search → retrieved passages → optional user-triggered direct provider request → UI citations from local retrieval references.`

Imported text is untrusted data and is never executed. Provider keys are memory-only by default; optional persistence is explicit. Keys are not in notebook backups or logs. External providers receive the user's prompt/context and retrieved excerpts only on explicit submission, subject to their privacy, CORS, quota, and billing rules.

## Verified and unverified

Local Node tests cover backup integrity, parser behavior, retrieval/citation boundaries, provider request construction/errors, and hostile source text. A bundled Chromium workflow has exercised the built browser app, including imports, citations, notebook isolation/duplication, study/download output, backup restore, responsive settings, service-worker activation, and offline reload with IndexedDB data. CI itself has not run. Rust formatting/tests/lints, WASM, live provider requests, OCR, media extraction, arbitrary web scraping, sharing/sync, speech, PPTX/PDF export, and native desktop/mobile packages remain unverified or unimplemented.
