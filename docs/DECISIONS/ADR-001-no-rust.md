# ADR-001: No Rust / crates.io / rustup

**Status:** Accepted

## Context
The Notebook Studio stack must build and run entirely in the browser (PWA) and
Node. Rust toolchains (crates.io, rustup) were unavailable in the build
environment (hosts blocked), and a WASM-only stack keeps the deployment
surface minimal: one static bundle, no native dependencies.

## Decision
All components are TypeScript + WASM. Storage uses @sqlite.org/sqlite-wasm
(FTS5), PDF parsing uses pdfjs-dist, and the UI is React 19 + Vite. No Rust,
no Cargo, no native addons.

## Consequences
- Faster iteration, no cross-compilation targets.
- Larger bundle (WASM ~880 kB, gzip ~412 kB) — acceptable for a local-first tool.
- FTS5 full-text search available in WASM (verified working).
