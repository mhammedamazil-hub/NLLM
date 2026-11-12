import { describe, expect, it } from 'vitest';
import { renderArtifact } from '../src/core/artifacts/renderers.ts';
import { jsonSchemaFor, validateArtifactModel } from '../src/core/artifacts/schemas.ts';
import type { ArtifactModel } from '../src/core/domain/types.ts';

describe('artifact schemas', () => {
  it('builds a JSON schema for each kind', () => {
    const kinds = ['mindmap', 'slides', 'flashcards', 'quiz', 'summary', 'table'] as const;
    for (const kind of kinds) {
      const schema = jsonSchemaFor(kind);
      expect(schema.type).toBe('object');
      expect(schema.required).toBeDefined();
    }
  });

  it('validates artifact models', () => {
    const mindmap: ArtifactModel = { nodes: [{ id: 'a', label: 'Root' }] };
    expect(validateArtifactModel('mindmap', mindmap)).toBe(true);
    expect(validateArtifactModel('mindmap', { nodes: [] })).toBe(false);
    expect(validateArtifactModel('quiz', { questions: [{ question: 'q', options: ['a'], answerIndex: 0 }] })).toBe(true);
    expect(validateArtifactModel('table', { headers: ['a'], rows: [['1']] })).toBe(true);
    expect(validateArtifactModel('table', { headers: [], rows: [] })).toBe(false);
  });
});

describe('artifact renderers', () => {
  it('renders a mindmap as nested lists', () => {
    const html = renderArtifact('mindmap', {
      nodes: [{ id: 'a', label: 'Root', children: [{ id: 'b', label: 'Leaf' }] }],
    }, 'My Mind Map');
    expect(html).toContain('My Mind Map');
    expect(html).toContain('Root');
    expect(html).toContain('Leaf');
    expect(html).toContain('<ul class="mindmap">');
  });

  it('renders flashcards as details cards', () => {
    const html = renderArtifact('flashcards', { cards: [{ front: 'Q?', back: 'A!' }] }, 'Cards');
    expect(html).toContain('Cards');
    expect(html).toContain('Q?');
    expect(html).toContain('A!');
    expect(html).toContain('class="card"');
  });

  it('renders a quiz with radio options', () => {
    const html = renderArtifact('quiz', {
      questions: [{ question: '2+2?', options: ['3', '4'], answerIndex: 1 }],
    }, 'Math Quiz');
    expect(html).toContain('Math Quiz');
    expect(html).toContain('2+2?');
    expect(html).toContain('value="1"');
  });

  it('renders a table with headers and rows', () => {
    const html = renderArtifact('table', { headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] }, 'T');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<td>4</td>');
  });

  it('renders an FAQ and glossary', () => {
    const faq = renderArtifact('faq', { pairs: [{ question: 'Q', answer: 'A' }] }, 'FAQ');
    expect(faq).toContain('FAQ');
    expect(faq).toContain('class="faq"');
    const glossary = renderArtifact('glossary', { definitions: [{ term: 'T', definition: 'D' }] }, 'G');
    expect(glossary).toContain('<dt>T</dt>');
    expect(glossary).toContain('<dd>D</dd>');
  });

  it('escapes HTML in model content', () => {
    const html = renderArtifact('flashcards', { cards: [{ front: '<script>x</script>', back: 'safe' }] }, 'T');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
