/**
 * Interactive slides — presentation view with navigation.
 * Supports keyboard navigation (arrows, space), slide counter,
 * and a full-screen toggle.
 */
import { useState, useEffect, useCallback } from 'react';

export interface Slide {
  title: string;
  bullets?: string[];
  notes?: string;
}

export function InteractiveSlides({ slides, title }: { slides: Slide[]; title: string }) {
  const [current, setCurrent] = useState(0);
  const [presentMode, setPresentMode] = useState(false);

  const next = useCallback(() => setCurrent((c) => Math.min(c + 1, slides.length - 1)), [slides.length]);
  const prev = useCallback(() => setCurrent((c) => Math.max(c - 1, 0)), []);

  useEffect(() => {
    if (!presentMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'n') next();
      if (e.key === 'ArrowLeft' || e.key === 'p') prev();
      if (e.key === 'Escape') setPresentMode(false);
      if (e.key === 'f') setPresentMode((p) => !p);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, presentMode]);

  const slide = slides[current];

  return (
    <article>
      <div className="slides-header">
        <h2>{title}</h2>
        <div className="slides-controls">
          <button className="btn small" onClick={prev} disabled={current === 0}>← Prev</button>
          <span className="slides-counter">{current + 1} / {slides.length}</span>
          <button className="btn small" onClick={next} disabled={current === slides.length - 1}>Next →</button>
          <button className="btn small" onClick={() => setPresentMode(true)}>⛶ Present</button>
        </div>
      </div>

      {/* Slide thumbnails */}
      <div className="slides-thumbs">
        {slides.map((s, i) => (
          <button
            key={i}
            className={`slide-thumb ${i === current ? 'active' : ''}`}
            onClick={() => setCurrent(i)}
          >
            <span className="slide-thumb-num">{i + 1}</span>
            <span className="slide-thumb-title">{s.title}</span>
          </button>
        ))}
      </div>

      {/* Current slide */}
      <div className={`slide-view ${presentMode ? 'present' : ''}`}>
        <div className="slide-content" key={current}>
          <h3 className="slide-title">{slide.title}</h3>
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="slide-bullets">
              {slide.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {slide.notes && (
            <div className="slide-notes">
              <strong>Notes:</strong> {slide.notes}
            </div>
          )}
        </div>
        {presentMode && (
          <button className="btn small slides-exit" onClick={() => setPresentMode(false)}>Exit (Esc)</button>
        )}
      </div>
    </article>
  );
}
