import { describe, expect, it } from 'vitest';
import { chunkText, normalizeText, locationLabel, sha256Hex } from '../src/core/ingestion/text.ts';

describe('text normalization', () => {
  it('collapses whitespace and blank lines', () => {
    const out = normalizeText('a\r\n\r\n\r\nb\tc\n\n\n d   e');
    expect(out).toBe('a\n\nb c\n\n d e');
  });
});

describe('chunkText', () => {
  it('splits long text into chunks within target size', () => {
    const para = 'word '.repeat(250); // ~1250 chars
    const text = para.repeat(4);
    const chunks = chunkText(text, { targetChars: 500, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(600);
    }
    // Overlap should mean consecutive chunks share text.
    expect(chunks[0].text.slice(-50)).toBe(chunks[1].text.slice(0, 50));
  });

  it('keeps short text in one chunk', () => {
    const chunks = chunkText('short passage', { targetChars: 800 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('short passage');
  });

  it('tracks markdown headings for provenance', () => {
    const text = '# Introduction\n\nSome content.\n\n# Methods\n\nMore content.';
    const chunks = chunkText(text, { targetChars: 200 });
    const withHeading = chunks.filter((c) => c.heading === 'Methods');
    expect(withHeading.length).toBeGreaterThan(0);
    expect(withHeading[0].text).toContain('More content');
  });

  it('labels locations with source name and page', () => {
    const label = locationLabel({ text: 'x', page: 2, heading: 'Section A' }, 'doc.pdf');
    expect(label).toBe('doc.pdf · page 3 · "Section A"');
  });
});

describe('sha256Hex', () => {
  it('produces a 64-char hex digest', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Known vector for "hello".
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
