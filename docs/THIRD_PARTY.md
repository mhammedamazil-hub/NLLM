# Third-party runtime dependencies

Versions are pinned in `package.json` and `package-lock.json`. These dependencies are used only in the static browser bundle for client-side parsing; documents are not uploaded to an app server.

| Package | Version | License | Purpose |
|---|---:|---|---|
| `pdfjs-dist` | 4.10.38 | Apache-2.0 | PDF text extraction in the browser |
| `mammoth` | 1.13.0 | BSD-2-Clause | DOCX text conversion; directory traversal advisory fixed in 1.11.0+ |
| `jszip` | 3.10.1 | MIT OR GPL-3.0-or-later | PPTX ZIP/container parsing |
| `@xmldom/xmldom` | 0.8.15 | MIT | Safe XML parser fallback for deterministic parser tests |
| `esbuild` | 0.25.5 | MIT | Static bundle generation at build time |

The bundled JavaScript retains dependency license notices (`legalComments: eof`). The corresponding package license files are available in `node_modules` after `npm ci`. Dependency audit is included in the documented build checks; do not upgrade pinned parser versions without running the parsing fixtures and `npm audit`.
