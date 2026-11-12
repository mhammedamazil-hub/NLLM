/**
 * Local file text extraction. Parsers are pluggable; each returns the extracted
 * text plus extraction warnings (MASTER.md §2.1.6). No server-side extraction.
 */

export interface ExtractedDocument {
  text: string;
  warnings: string[];
}

export interface FileParser {
  extensions: string[];
  mimeTypes: string[];
  extract(fileName: string, bytes: Uint8Array, signal?: AbortSignal): Promise<ExtractedDocument>;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** Plain text / markdown. */
const textParser: FileParser = {
  extensions: ['txt', 'md', 'markdown', 'csv', 'log'],
  mimeTypes: ['text/plain', 'text/markdown'],
  async extract(_fileName, bytes, signal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return { text: decodeText(bytes), warnings: [] };
  },
};

/** HTML → text. Uses DOMParser when available (browser); regex fallback for Node. */
const htmlParser: FileParser = {
  extensions: ['html', 'htm'],
  mimeTypes: ['text/html'],
  async extract(_fileName, bytes) {
    const html = decodeText(bytes);
    const warnings: string[] = [];
    let title = '';
    let body = html;
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      title = doc.title ?? '';
      doc.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());
      body = doc.body?.innerText ?? '';
    } else {
      warnings.push('HTML parsed with a conservative tag-stripping fallback (DOMParser unavailable).');
      body = html
        .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m) title = m[1].trim();
    }
    if (title) {
      body = `# ${title}\n\n${body}`;
    }
    return { text: body, warnings };
  },
};

/** PDF via pdf.js (lazy-loaded; only loaded when a PDF is actually imported). */
const pdfParser: FileParser = {
  extensions: ['pdf'],
  mimeTypes: ['application/pdf'],
  async extract(_fileName, bytes) {
    const warnings: string[] = [];
    try {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      const pdf = await pdfjs.getDocument({ data: bytes.slice().buffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it: unknown) => (it as { str?: string }).str ?? '').join(' ');
        pages.push(text);
      }
      return { text: pages.join('\n\f\n'), warnings };
    } catch (err) {
      throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

export const PARSERS: FileParser[] = [textParser, htmlParser, pdfParser];

export function parserFor(fileName: string, mimeType: string): FileParser | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  for (const p of PARSERS) {
    if (p.extensions.includes(ext) || p.mimeTypes.includes(mimeType)) return p;
  }
  return null;
}

export function isSupported(fileName: string, mimeType: string): boolean {
  return parserFor(fileName, mimeType) !== null;
}
