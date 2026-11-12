/**
 * Artifact model schemas — typed shapes for each artifact kind.
 * Generation asks the provider for one of these; validation runs locally.
 */
import type { ArtifactKind, ArtifactModel } from '../domain/types.ts';

export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export interface Slide {
  title: string;
  bullets?: string[];
  notes?: string;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
}

export interface Definition {
  term: string;
  definition: string;
}

export interface FaqPair {
  question: string;
  answer: string;
}

export interface TableRow {
  headers: string[];
  rows: Array<Array<string | number>>;
}

export interface OutlineSection {
  heading: string;
  points?: string[];
}

export interface ReportSection {
  heading: string;
  body: string;
}

export interface GuideSection {
  heading: string;
  body: string;
  tips?: string[];
}

export interface BriefingItem {
  title: string;
  detail: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface AudioOverviewSegment {
  startSeconds: number;
  title: string;
  script: string;
}

export interface VideoScene {
  title: string;
  narration: string;
  visual: string;
}

export type ArtifactSchemas = {
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
};

export type ArtifactKindSchema = ArtifactKind;

/** JSON schema constraint sent to providers that support structured output. */
export function jsonSchemaFor(kind: ArtifactKind): Record<string, unknown> {
  const shapes: Record<ArtifactKind, Record<string, unknown>> = {
    mindmap: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              children: { type: 'array', items: { type: 'object' } },
            },
            required: ['id', 'label'],
          },
        },
      },
      required: ['nodes'],
    },
    slides: {
      type: 'object',
      properties: {
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string' },
            },
            required: ['title'],
          },
        },
      },
      required: ['slides'],
    },
    flashcards: {
      type: 'object',
      properties: {
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              front: { type: 'string' },
              back: { type: 'string' },
            },
            required: ['front', 'back'],
          },
        },
      },
      required: ['cards'],
    },
    quiz: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answerIndex: { type: 'number' },
            },
            required: ['question', 'options', 'answerIndex'],
          },
        },
      },
      required: ['questions'],
    },
    audio_overview: {
      type: 'object',
      properties: {
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startSeconds: { type: 'number' },
              title: { type: 'string' },
              script: { type: 'string' },
            },
            required: ['startSeconds', 'title', 'script'],
          },
        },
      },
      required: ['segments'],
    },
    video_overview: {
      type: 'object',
      properties: {
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              narration: { type: 'string' },
              visual: { type: 'string' },
            },
            required: ['title', 'narration', 'visual'],
          },
        },
      },
      required: ['scenes'],
    },
    guide: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              body: { type: 'string' },
              tips: { type: 'array', items: { type: 'string' } },
            },
            required: ['heading', 'body'],
          },
        },
      },
      required: ['sections'],
    },
    briefing: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              detail: { type: 'string' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['title', 'detail'],
          },
        },
      },
      required: ['items'],
    },
    summary: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['heading', 'body'],
          },
        },
      },
      required: ['sections'],
    },
    faq: {
      type: 'object',
      properties: {
        pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
            },
            required: ['question', 'answer'],
          },
        },
      },
      required: ['pairs'],
    },
    outline: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              points: { type: 'array', items: { type: 'string' } },
            },
            required: ['heading'],
          },
        },
      },
      required: ['sections'],
    },
    glossary: {
      type: 'object',
      properties: {
        definitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              definition: { type: 'string' },
            },
            required: ['term', 'definition'],
          },
        },
      },
      required: ['definitions'],
    },
    timeline: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['date', 'title'],
          },
        },
      },
      required: ['events'],
    },
    table: {
      type: 'object',
      properties: {
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array' } },
      },
      required: ['headers', 'rows'],
    },
    report: {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              body: { type: 'string' },
            },
            required: ['heading', 'body'],
          },
        },
      },
      required: ['sections'],
    },
  };
  return shapes[kind];
}

/**
 * Validate an artifact model against its expected shape (lightweight, local).
 * Returns true when the model is usable; otherwise false and the caller
 * falls back to rendering raw text.
 */
export function validateArtifactModel(kind: ArtifactKind, model: ArtifactModel): boolean {
  try {
    const data = model as unknown as Record<string, unknown>;
    switch (kind) {
      case 'mindmap': {
        const nodes = data.nodes as unknown[];
        return Array.isArray(nodes) && nodes.length > 0 && nodes.every((n) => n && typeof n === 'object');
      }
      case 'slides': {
        const slides = data.slides as unknown[];
        return Array.isArray(slides) && slides.length > 0 && slides.every((s) => s && typeof s === 'object');
      }
      case 'flashcards': {
        const cards = data.cards as unknown[];
        return Array.isArray(cards) && cards.length > 0 && cards.every((c) => c && typeof c === 'object');
      }
      case 'quiz': {
        const qs = data.questions as unknown[];
        return Array.isArray(qs) && qs.length > 0 && qs.every((q) => q && typeof q === 'object');
      }
      case 'audio_overview': {
        const segs = data.segments as unknown[];
        return Array.isArray(segs) && segs.length > 0;
      }
      case 'video_overview': {
        const sc = data.scenes as unknown[];
        return Array.isArray(sc) && sc.length > 0;
      }
      case 'guide':
      case 'briefing':
      case 'summary':
      case 'report': {
        const secs = data.sections as unknown[];
        return Array.isArray(secs) && secs.length > 0;
      }
      case 'faq': {
        const pairs = data.pairs as unknown[];
        return Array.isArray(pairs) && pairs.length > 0;
      }
      case 'outline': {
        const secs = data.sections as unknown[];
        return Array.isArray(secs) && secs.length > 0;
      }
      case 'glossary': {
        const defs = data.definitions as unknown[];
        return Array.isArray(defs) && defs.length > 0;
      }
      case 'timeline': {
        const ev = data.events as unknown[];
        return Array.isArray(ev) && ev.length > 0;
      }
      case 'table': {
        const headers = data.headers as unknown[];
        const rows = data.rows as unknown[];
        return Array.isArray(headers) && Array.isArray(rows) && headers.length > 0 && rows.length > 0;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
