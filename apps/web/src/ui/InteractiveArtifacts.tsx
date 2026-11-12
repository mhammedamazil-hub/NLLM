/**
 * Interactive artifact components — React-based rendering for flashcards and quiz.
 * These replace the static HTML renderers with interactive UI.
 */
import { useState } from 'react';

/* ===== Flashcards ===== */

export interface FlashcardModel {
  cards: Array<{ front: string; back: string }>;
}

export function InteractiveFlashcards({ model, title }: { model: FlashcardModel; title: string }) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const flip = (i: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const reviewed = flipped.size;
  const total = model.cards.length;

  return (
    <article>
      <h2>{title}</h2>
      <div className="flashcards-container">
        <div className="flashcards-progress">
          {reviewed} / {total} reviewed
        </div>
        <div className="flashcards-grid">
          {model.cards.map((card, i) => (
            <div
              key={i}
              className={`flashcard ${flipped.has(i) ? 'flipped' : ''}`}
              onClick={() => flip(i)}
            >
              <div className="flashcard-face flashcard-front">
                <span>{card.front}</span>
              </div>
              <div className="flashcard-face flashcard-back">
                <span>{card.back}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* ===== Quiz ===== */

export interface QuizModel {
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }>;
}

export function InteractiveQuiz({ model, title }: { model: QuizModel; title: string }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const selectAnswer = (qIndex: number, optionIndex: number) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [qIndex]: optionIndex }));
  };

  const submit = () => setSubmitted(true);

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const score = model.questions.reduce((acc, q, i) => {
    return acc + (answers[i] === q.correctIndex ? 1 : 0);
  }, 0);

  const total = model.questions.length;

  return (
    <article>
      <h2>{title}</h2>
      {submitted && (
        <div className="quiz-score">
          <span className="quiz-score-number">{score}</span>
          <span className="quiz-score-total">/ {total}</span>
          <span className="quiz-score-label">
            {score === total ? 'Perfect!' : score >= total * 0.7 ? 'Good job!' : 'Keep studying!'}
          </span>
        </div>
      )}
      <div className="quiz-questions">
        {model.questions.map((q, i) => {
          const userAnswer = answers[i];
          const isCorrect = submitted && userAnswer === q.correctIndex;
          const isWrong = submitted && userAnswer !== q.correctIndex && userAnswer !== undefined;

          return (
            <div key={i} className={`quiz-question-card ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}>
              <h3 className="quiz-question-text">{i + 1}. {q.question}</h3>
              <div className="quiz-options">
                {q.options.map((opt, j) => {
                  const selected = userAnswer === j;
                  const correct = submitted && j === q.correctIndex;
                  return (
                    <button
                      key={j}
                      className={`quiz-option ${selected ? 'selected' : ''} ${correct ? 'correct-answer' : ''} ${selected && !correct ? 'wrong-answer' : ''}`}
                      onClick={() => selectAnswer(i, j)}
                      disabled={submitted}
                    >
                      <span className="quiz-option-letter">{String.fromCharCode(65 + j)}</span>
                      <span className="quiz-option-text">{opt}</span>
                      {correct && <span className="quiz-option-badge">✓</span>}
                      {selected && !correct && <span className="quiz-option-badge">✗</span>}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className="quiz-explanation">
                  <strong>Explanation:</strong> {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="quiz-actions">
        {!submitted ? (
          <button className="btn" onClick={submit} disabled={Object.keys(answers).length < total}>
            Submit Quiz
          </button>
        ) : (
          <button className="btn" onClick={reset}>Retry</button>
        )}
      </div>
    </article>
  );
}
