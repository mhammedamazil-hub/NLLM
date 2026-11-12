// @vitest-environment jsdom
/**
 * Component tests for interactive artifact renderers.
 * Verifies flashcards flip, quiz scoring, mind map toggle, slides nav, timeline render.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InteractiveFlashcards } from '../src/ui/InteractiveArtifacts.tsx';
import { InteractiveQuiz } from '../src/ui/InteractiveArtifacts.tsx';
import { InteractiveMindMap } from '../src/ui/InteractiveMindMap.tsx';
import { InteractiveSlides } from '../src/ui/InteractiveSlides.tsx';
import { InteractiveTimeline } from '../src/ui/InteractiveTimeline.tsx';

beforeEach(() => {
  cleanup();
});

describe('InteractiveFlashcards', () => {
  const model = {
    cards: [
      { front: 'What is photosynthesis?', back: 'The process plants use to convert light into energy.' },
      { front: 'What is mitochondria?', back: 'The powerhouse of the cell.' },
    ],
  };

  it('renders all cards with front text visible', () => {
    render(<InteractiveFlashcards model={model} title="Biology Flashcards" />);
    expect(screen.getByText('Biology Flashcards')).toBeInTheDocument();
    expect(screen.getByText('What is photosynthesis?')).toBeInTheDocument();
    expect(screen.getByText('What is mitochondria?')).toBeInTheDocument();
    expect(screen.getByText('0 / 2 reviewed')).toBeInTheDocument();
  });

  it('flips a card on click', () => {
    render(<InteractiveFlashcards model={model} title="Test" />);
    const card = screen.getByText('What is photosynthesis?').closest('.flashcard')!;
    fireEvent.click(card);
    expect(card).toHaveClass('flipped');
    expect(screen.getByText('1 / 2 reviewed')).toBeInTheDocument();
  });

  it('flips a card back on second click', () => {
    render(<InteractiveFlashcards model={model} title="Test" />);
    const card = screen.getByText('What is photosynthesis?').closest('.flashcard')!;
    fireEvent.click(card);
    expect(card).toHaveClass('flipped');
    fireEvent.click(card);
    expect(card).not.toHaveClass('flipped');
    expect(screen.getByText('0 / 2 reviewed')).toBeInTheDocument();
  });
});

describe('InteractiveQuiz', () => {
  const model = {
    questions: [
      { question: 'What is 2+2?', options: ['3', '4', '5'], correctIndex: 1, explanation: 'Basic arithmetic.' },
      { question: 'What is the capital of France?', options: ['London', 'Paris', 'Berlin'], correctIndex: 1 },
    ],
  };

  it('renders all questions with options', () => {
    render(<InteractiveQuiz model={model} title="Quiz Test" />);
    expect(screen.getByText('Quiz Test')).toBeInTheDocument();
    expect(screen.getByText(/What is 2\+2/)).toBeInTheDocument();
    expect(screen.getByText(/capital of France/)).toBeInTheDocument();
    expect(screen.getByText('Submit Quiz')).toBeInTheDocument();
  });

  it('selects an answer', () => {
    render(<InteractiveQuiz model={model} title="Test" />);
    const option4 = screen.getByText('4').closest('button')!;
    fireEvent.click(option4);
    expect(option4).toHaveClass('selected');
  });

  it('shows score after submission', () => {
    render(<InteractiveQuiz model={model} title="Test" />);
    const opt4 = screen.getByText('4').closest('button')!;
    const optParis = screen.getByText('Paris').closest('button')!;
    fireEvent.click(opt4);
    fireEvent.click(optParis);
    fireEvent.click(screen.getByText('Submit Quiz'));
    expect(screen.getByText('Perfect!')).toBeInTheDocument();
  });

  it('shows wrong answer feedback', () => {
    render(<InteractiveQuiz model={model} title="Test" />);
    const opt3 = screen.getByText('3').closest('button')!;
    fireEvent.click(opt3);
    const optParis = screen.getByText('Paris').closest('button')!;
    fireEvent.click(optParis);
    fireEvent.click(screen.getByText('Submit Quiz'));
    expect(screen.getByText('Keep studying!')).toBeInTheDocument();
  });
});

describe('InteractiveMindMap', () => {
  const model = {
    nodes: [
      {
        id: 'root',
        label: 'Biology',
        children: [
          { id: 'cell', label: 'Cell Biology', children: [
            { id: 'mito', label: 'Mitochondria' },
            { id: 'nucleus', label: 'Nucleus' },
          ]},
          { id: 'eco', label: 'Ecology' },
        ],
      },
    ],
  };

  it('renders root and first-level nodes', () => {
    render(<InteractiveMindMap nodes={model.nodes} title="Mind Map Test" />);
    expect(screen.getByText('Mind Map Test')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.getByText('Cell Biology')).toBeInTheDocument();
    expect(screen.getByText('Ecology')).toBeInTheDocument();
  });

  it('toggles a node to collapse children', () => {
    render(<InteractiveMindMap nodes={model.nodes} title="Test" />);
    const cellNode = screen.getByText('Cell Biology').closest('.mindmap-node')!;
    const toggle = cellNode.querySelector('.mindmap-toggle') as HTMLButtonElement;
    fireEvent.click(toggle);
    // After collapsing, Mitochondria should not be in the visible tree
    expect(cellNode.querySelector('.mindmap-children')).toBeNull();
  });

  it('expand/collapse all buttons work', () => {
    render(<InteractiveMindMap nodes={model.nodes} title="Test" />);
    fireEvent.click(screen.getByText('Collapse all'));
    // Root should still show (it's level 0), but children should be collapsed
    expect(screen.getByText('Biology')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Expand all'));
    expect(screen.getByText('Cell Biology')).toBeInTheDocument();
  });
});

describe('InteractiveSlides', () => {
  const slides = [
    { title: 'Introduction', bullets: ['Welcome', 'Overview'], notes: 'Speaker notes' },
    { title: 'Main Points', bullets: ['Point A', 'Point B'] },
    { title: 'Conclusion', bullets: ['Summary'] },
  ];

  it('renders first slide by default', () => {
    render(<InteractiveSlides slides={slides} title="Slides Test" />);
    expect(screen.getByText('Slides Test')).toBeInTheDocument();
    // Slide title appears in both thumb and content — use getAllByText
    expect(screen.getAllByText('Introduction').length).toBeGreaterThan(0);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('navigates to next slide', () => {
    render(<InteractiveSlides slides={slides} title="Test" />);
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Point A')).toBeInTheDocument();
  });

  it('navigates to previous slide', () => {
    render(<InteractiveSlides slides={slides} title="Test" />);
    fireEvent.click(screen.getByText('Next →'));
    fireEvent.click(screen.getByText('← Prev'));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('shows thumbnail strip', () => {
    render(<InteractiveSlides slides={slides} title="Test" />);
    // Thumbnails should show all slide titles
    expect(screen.getAllByText('Introduction').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Main Points').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Conclusion').length).toBeGreaterThan(0);
  });
});

describe('InteractiveTimeline', () => {
  const events = [
    { date: '2024-01-01', title: 'Project Started', description: 'Initial launch' },
    { date: '2024-06-15', title: 'Milestone 1', description: 'First release' },
    { date: '2024-12-31', title: 'Year End', description: 'Annual review' },
  ];

  it('renders all timeline events', () => {
    render(<InteractiveTimeline events={events} title="Timeline Test" />);
    expect(screen.getByText('Timeline Test')).toBeInTheDocument();
    expect(screen.getByText('Project Started')).toBeInTheDocument();
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    expect(screen.getByText('Year End')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01')).toBeInTheDocument();
  });

  it('renders descriptions', () => {
    render(<InteractiveTimeline events={events} title="Test" />);
    expect(screen.getByText('Initial launch')).toBeInTheDocument();
    expect(screen.getByText('First release')).toBeInTheDocument();
  });

  it('handles empty events', () => {
    render(<InteractiveTimeline events={[]} title="Empty Timeline" />);
    expect(screen.getByText('No timeline events.')).toBeInTheDocument();
  });
});
