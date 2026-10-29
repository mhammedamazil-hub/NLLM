# SourceForge

A local-first, source-grounded research workspace, provisionally named **SourceForge**. The GitHub project is **NLLM**. This independent project is not affiliated with Google and does not use Google's branding, assets, or private APIs.

> **Early vertical slice (0.1):** isolated notebooks; browser-local text, PDF, DOCX, and PPTX extraction; selected public GitHub text-file imports; deterministic evidence retrieval and citation chips; optional direct-to-provider AI adapters; passage-backed study tools and exports; and an installable offline app shell. This is not a complete NotebookLM alternative, does not include an AI model, and is not yet a Rust/WASM application.

## Run locally

Requires Node.js 22+ and npm. The first build installs pinned parser and bundler dependencies; the app itself has no hosted backend.

```sh
npm ci
npm run build
python3 -m http.server 4173 --bind 0.0.0.0 --directory dist
```

Open `http://localhost:4173`. A secure HTTPS origin (or localhost) is required for service-worker installation. The static server serves files only; it is not an application API.

```sh
npm test          # deterministic unit tests plus bundled-Chromium browser workflow
npm run check     # JavaScript syntax checks
npm run verify    # syntax/tests, npm audit, and production PWA build
```

Rust core (requires a stable Rust toolchain):

```sh
cargo fmt --all -- --check
cargo test --workspace --locked
cargo clippy --workspace --all-targets -- -D warnings
```

Rust commands have **not** been run locally because Rust/Cargo are unavailable in this sandbox. GitHub Actions is configured to run them; no remote CI run has been observed yet.

## Use it

1. Create a notebook, paste notes, or import a supported file. PDF text, DOCX paragraphs, PPTX slide text, plain text, Markdown, CSV, JSON, HTML, and code-like files are extracted in-browser. Each file is limited to 8 MiB and each extracted source to 200,000 characters. Scanned PDFs have no OCR.
2. Search source names/content, select the sources to use, then ask a question. **Evidence mode is the default**: ranked local passages, source/page/line references, and an explicit insufficient-evidence response. Contradictory evidence is retained rather than silently collapsed.
3. Optionally configure an OpenAI-compatible, Anthropic, or Gemini API under **Settings → AI provider**, then submit a question. The question, conversation context, and retrieved evidence go directly from your browser to that provider. Provider CORS, terms, privacy, quotas, and charges apply. Keys stay in memory unless you explicitly opt into local persistence.
4. **Study studio** offers a deterministic source digest, interactive passage-backed flashcards, citation-ready Markdown, a standalone HTML report, and flashcards CSV. Notebook JSON backup/export and validated import are also available. Exports are derived from actual source passages—not model-authored facts.
5. The PWA caches its static shell and fetched PDF.js assets; notebooks and chat remain in browser IndexedDB. Export backups before clearing site data or changing browser profiles.

Public GitHub import can list a directory and lets you choose up to 10 supported text files, or import one file directly. It is bounded by per-file and aggregate limits, uses the public GitHub API and browser fetch, and does not clone a repository. GitHub rate limits and browser/network policy apply. Arbitrary websites, YouTube, and Instagram are not scraped; no CORS proxy is used.

## Privacy and security

- No account, application backend, telemetry, analytics, automatic cloud sync, or application-owned proxy.
- Notebooks and source text live in this browser's IndexedDB. Anyone with access to the same browser profile may be able to access them. Browser policy can clear storage; keep backups.
- A provider receives the submitted prompt, relevant conversation context, and retrieved source excerpts only when you explicitly submit AI chat. Provider policies and external usage costs/limits apply.
- API credentials are not sent to an application server or included in notebook exports. Persistent key storage is opt-in and local to this browser profile.
- Imported files and code are treated as inert text. They are never executed. Retrieved content is marked as untrusted in the provider prompt. Keep sensitive material away from external models unless you approve that disclosure.
- Offline mode supports the app shell and saved local material only. AI generation still needs the network and a compatible provider; no local model is bundled.

## Architecture and scope

See [architecture](docs/architecture.md), [environment audit](docs/environment-audit.md), [feature/evidence matrix](docs/feature-matrix.md), [implementation status](IMPLEMENTATION_STATUS.md), and the live [challenge checklist](docs/CHALLENGE_CHECKLIST.md).

A dependency-free Rust crate provides a core-domain prototype and tests. The browser currently runs its JavaScript counterpart; Rust compilation and WASM integration remain unverified. The product name SourceForge is provisional. REA was not run: its published Node engine requirement exceeds this environment's installed version, and an MCP client/browser-observation setup is not present.

## Build and deployment

`npm run build` creates the static distributable in ignored `dist/`. GitHub Actions is configured to run JavaScript/browser tests, audit/build, and Rust format/test/lint checks; Pages deployment is gated on that job and builds the bundled static app. The first hosted CI run on this branch failed in the combined npm verification step; the workflow is now split for diagnosis, but that follow-up run has not completed. Rust and Pages jobs therefore remain unverified. There are no Android, Linux desktop, Windows desktop, APK, installer, or signed-release targets.

See [MIT License](LICENSE) and [third-party notices](docs/THIRD_PARTY.md).
