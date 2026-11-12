/**
 * Text normalization + chunking for the local ingestion pipeline.
 */

export interface ChunkPiece {
  text: string;
  page?: number;
  heading?: string;
}

/** Collapse whitespace runs but preserve paragraph breaks. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return digest.then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''));
}

interface Unit {
  text: string;
  heading?: string;
  page?: number;
}

/** Split an over-long unit into word-bounded slices of at most `target` chars. */
function hardSplit(unit: string, target: number): string[] {
  const words = unit.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let buf: string[] = [];
  let len = 0;
  for (const w of words) {
    const wlen = w.length + 1;
    if (buf.length > 0 && len + wlen > target) {
      out.push(buf.join(' '));
      buf = [];
      len = 0;
    }
    buf.push(w);
    len += wlen;
  }
  if (buf.length > 0) out.push(buf.join(' '));
  return out;
}

/**
 * Split text into chunks of roughly `targetChars` with `overlapChars` overlap.
 * Lines are processed one by one: markdown headings set each chunk's provenance
 * heading and flush the current segment. Over-long units are hard-split. Overlap
 * is dropped at heading boundaries so a new section never inherits the previous
 * section's text. Form feeds (\f) mark page breaks.
 */
export function chunkText(
  text: string,
  opts: { targetChars?: number; overlapChars?: number } = {},
): ChunkPiece[] {
  const target = opts.targetChars ?? 800;
  const overlap = opts.overlapChars ?? 120;

  // 1. Build units from lines, tracking headings and pages.
  const rawPages = text.split('\f');
  const hasPages = rawPages.length > 1;
  const units: Unit[] = [];
  let heading: string | undefined;

  for (let p = 0; p < rawPages.length; p++) {
    const pageNo = hasPages ? p : undefined;
    const lines = rawPages[p].split('\n');
    let segText: string[] = [];

    const flushSeg = (): void => {
      if (segText.length === 0) return;
      const segTextStr = segText.join('\n');
      const sentences = segTextStr.split(/(?<=[.!?])\s+/);
      for (const raw of sentences) {
        const t = raw.trim();
        if (!t) continue;
        if (t.length > target) {
          for (const piece of hardSplit(t, target)) {
            units.push({ text: piece, heading, page: pageNo });
          }
        } else {
          units.push({ text: t, heading, page: pageNo });
        }
      }
      segText = [];
    };

    for (const line of lines) {
      const hMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (hMatch) {
        flushSeg();
        heading = hMatch[1].trim();
        continue;
      }
      segText.push(line);
    }
    flushSeg();
  }

  // 2. Pack units into chunks ≤ target, carrying overlap between chunks.
  const pieces: ChunkPiece[] = [];
  let current = '';
  let currentHeading: string | undefined;
  let currentPage: number | undefined;

  const flush = (): void => {
    if (!current.trim()) return;
    // Trim trailing whitespace only: the leading characters may be an overlap
    // slice whose exact contents must match the previous chunk's tail.
    pieces.push({ text: current.replace(/\s+$/, ''), page: currentPage, heading: currentHeading });
  };

  for (const unit of units) {
    // A new section starts: flush without overlap so provenance stays clean.
    if (unit.heading !== undefined && unit.heading !== currentHeading && current.trim()) {
      flush();
      current = '';
    }
    if (unit.heading !== undefined) currentHeading = unit.heading;
    if (current.length === 0) currentPage = unit.page;

    const next = current.length === 0 ? unit.text : `${current}\n${unit.text}`;
    if (next.length > target && current.length > 0) {
      flush();
      // Use the trimmed current for the tail so overlap matches the chunk text.
      const trimmed = current.trim();
      current = overlap > 0 ? trimmed.slice(-overlap) : '';
      currentHeading = unit.heading ?? currentHeading;
      currentPage = unit.page ?? currentPage;
    }
    current = current.length === 0 ? unit.text : `${current}\n${unit.text}`;
  }
  flush();

  return pieces.filter((p) => p.text.length > 0);
}

/** Build a human-readable location label for a chunk. */
export function locationLabel(piece: ChunkPiece, sourceName: string): string {
  const parts = [sourceName];
  if (piece.page !== undefined) parts.push(`page ${piece.page + 1}`);
  if (piece.heading) parts.push(`"${piece.heading}"`);
  return parts.join(' · ');
}
