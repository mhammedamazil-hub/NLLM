/**
 * Local artifact renderers — pure functions turning an artifact model into
 * HTML strings. No provider required (NotebookLM parity: local rendering).
 */
import type { ArtifactKind, ArtifactModel } from '../domain/types.ts';
import type {
  AudioOverviewSegment, BriefingItem, Definition, FaqPair, Flashcard,
  GuideSection, MindMapNode, OutlineSection, QuizQuestion, ReportSection,
  Slide, TableRow, TimelineEvent, VideoScene,
} from './schemas.ts';

type Model<K extends ArtifactKind> = K extends keyof ModelMap ? ModelMap[K] : ArtifactModel;

interface ModelMap {
  mindmap: { nodes: MindMapNode[] };
  slides: { slides: Slide[] };
  flashcards: { cards: Flashcard[] };
  quiz: { questions: QuizQuestion[] };
  audio_overview: { segments: AudioOverviewSegment[] };
  video_overview: { scenes: VideoScene[] };
  guide: { sections: GuideSection[] };
  briefing: { items: BriefingItem[] };
  summary: { sections: ReportSection[] };
  faq: { pairs: FaqPair[] };
  outline: { sections: OutlineSection[] };
  glossary: { definitions: Definition[] };
  timeline: { events: TimelineEvent[] };
  table: TableRow;
  report: { sections: ReportSection[] };
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderArtifact(kind: ArtifactKind, model: ArtifactModel, title = ''): string {
  const m = model as unknown as Model<typeof kind>;
  switch (kind) {
    case 'mindmap':
      return renderMindMap(m as ModelMap['mindmap'], title);
    case 'slides':
      return renderSlides(m as ModelMap['slides'], title);
    case 'flashcards':
      return renderFlashcards(m as ModelMap['flashcards'], title);
    case 'quiz':
      return renderQuiz(m as ModelMap['quiz'], title);
    case 'audio_overview':
      return renderAudioOverview(m as ModelMap['audio_overview'], title);
    case 'video_overview':
      return renderVideoOverview(m as ModelMap['video_overview'], title);
    case 'guide':
      return renderGuide(m as ModelMap['guide'], title);
    case 'briefing':
      return renderBriefing(m as ModelMap['briefing'], title);
    case 'summary':
      return renderSummary(m as ModelMap['summary'], title);
    case 'faq':
      return renderFaq(m as ModelMap['faq'], title);
    case 'outline':
      return renderOutline(m as ModelMap['outline'], title);
    case 'glossary':
      return renderGlossary(m as ModelMap['glossary'], title);
    case 'timeline':
      return renderTimeline(m as ModelMap['timeline'], title);
    case 'table':
      return renderTable(m as ModelMap['table'], title);
    case 'report':
      return renderReport(m as ModelMap['report'], title);
    default:
      return `<article><h2>${esc(title)}</h2><pre>${esc(model)}</pre></article>`;
  }
}

function renderMindMap(model: { nodes: MindMapNode[] }, title: string): string {
  const renderNode = (n: MindMapNode, depth: number): string => {
    const children = (n.children ?? []).map((c) => renderNode(c, depth + 1)).join('');
    return `<li><span>${esc(n.label)}</span>${children ? `<ul>${children}</ul>` : ''}</li>`;
  };
  const tree = model.nodes.map((n) => renderNode(n, 0)).join('');
  return `<article><h2>${esc(title)}</h2><ul class="mindmap">${tree}</ul></article>`;
}

function renderSlides(model: { slides: Slide[] }, title: string): string {
  const slides = model.slides
    .map(
      (s, i) => `<section class="slide"><h3>${i + 1}. ${esc(s.title)}</h3>${
        (s.bullets ?? []).map((b) => `<ul><li>${esc(b)}</li></ul>`).join('')
      }${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}</section>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2>${slides}</article>`;
}

function renderFlashcards(model: { cards: Flashcard[] }, title: string): string {
  const cards = model.cards
    .map(
      (c) => `<details class="card"><summary>${esc(c.front)}</summary><div class="back">${esc(c.back)}</div></details>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2><div class="flashcards">${cards}</div></article>`;
}

function renderQuiz(model: { questions: QuizQuestion[] }, title: string): string {
  const questions = model.questions
    .map((q, i) => {
      const options = q.options.map((o, j) => `<li><label><input type="radio" name="q${i}" value="${j}" /> ${esc(o)}</label></li>`).join('');
      return `<details class="quiz-question"><summary>${i + 1}. ${esc(q.question)}</summary><ol>${options}</ol></details>`;
    })
    .join('');
  return `<article><h2>${esc(title)}</h2>${questions}</article>`;
}

function renderAudioOverview(model: { segments: AudioOverviewSegment[] }, title: string): string {
  const segs = model.segments
    .map(
      (s) => `<section class="segment"><h3>${esc(s.title)}</h3><p class="timestamp">${s.startSeconds}s</p><p>${esc(s.script)}</p></section>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2>${segs}</article>`;
}

function renderVideoOverview(model: { scenes: VideoScene[] }, title: string): string {
  const scenes = model.scenes
    .map(
      (s) => `<section class="scene"><h3>${esc(s.title)}</h3><p class="visual">Visual: ${esc(s.visual)}</p><p>${esc(s.narration)}</p></section>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2>${scenes}</article>`;
}

function renderGuide(model: { sections: GuideSection[] }, title: string): string {
  const secs = model.sections
    .map(
      (s) => `<section><h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p>${
        (s.tips ?? []).map((t) => `<ul><li>Tip: ${esc(t)}</li></ul>`).join('')
      }</section>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2>${secs}</article>`;
}

function renderBriefing(model: { items: BriefingItem[] }, title: string): string {
  const items = model.items
    .map(
      (i) => `<li class="briefing-item ${i.priority ?? 'medium'}"><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></li>`,
    )
    .join('');
  return `<article><h2>${esc(title)}</h2><ul class="briefing">${items}</ul></article>`;
}

function renderSummary(model: { sections: ReportSection[] }, title: string): string {
  const secs = model.sections.map((s) => `<section><h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p></section>`).join('');
  return `<article><h2>${esc(title)}</h2>${secs}</article>`;
}

function renderFaq(model: { pairs: FaqPair[] }, title: string): string {
  const pairs = model.pairs
    .map((p) => `<details class="faq"><summary>${esc(p.question)}</summary><p>${esc(p.answer)}</p></details>`)
    .join('');
  return `<article><h2>${esc(title)}</h2>${pairs}</article>`;
}

function renderOutline(model: { sections: OutlineSection[] }, title: string): string {
  const secs = model.sections
    .map((s) => `<li><strong>${esc(s.heading)}</strong>${(s.points ?? []).map((p) => `<ul><li>${esc(p)}</li></ul>`).join('')}</li>`)
    .join('');
  return `<article><h2>${esc(title)}</h2><ul class="outline">${secs}</ul></article>`;
}

function renderGlossary(model: { definitions: Definition[] }, title: string): string {
  const defs = model.definitions
    .map((d) => `<dt>${esc(d.term)}</dt><dd>${esc(d.definition)}</dd>`)
    .join('');
  return `<article><h2>${esc(title)}</h2><dl class="glossary">${defs}</dl></article>`;
}

function renderTimeline(model: { events: TimelineEvent[] }, title: string): string {
  const events = model.events
    .map((e) => `<li><span class="date">${esc(e.date)}</span><strong>${esc(e.title)}</strong>${e.description ? `<p>${esc(e.description)}</p>` : ''}</li>`)
    .join('');
  return `<article><h2>${esc(title)}</h2><ol class="timeline">${events}</ol></article>`;
}

function renderTable(model: TableRow, title: string): string {
  const head = model.headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const rows = model.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<article><h2>${esc(title)}</h2><table>${head ? `<thead><tr>${head}</tr></thead>` : ''}<tbody>${rows}</tbody></table></article>`;
}

function renderReport(model: { sections: ReportSection[] }, title: string): string {
  const secs = model.sections.map((s) => `<section><h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p></section>`).join('');
  return `<article><h2>${esc(title)}</h2>${secs}</article>`;
}
