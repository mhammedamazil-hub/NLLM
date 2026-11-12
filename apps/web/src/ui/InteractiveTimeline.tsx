/**
 * Interactive timeline — vertical timeline visualization with event cards.
 * Events displayed chronologically with date badges and descriptions.
 */

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
}

export function InteractiveTimeline({ events, title }: { events: TimelineEvent[]; title: string }) {
  return (
    <article>
      <h2>{title}</h2>
      <div className="timeline-container">
        <div className="timeline-line" />
        {events.map((event, i) => (
          <div key={i} className="timeline-event">
            <div className="timeline-dot" />
            <div className="timeline-card">
              <div className="timeline-date">{event.date}</div>
              <h3 className="timeline-title">{event.title}</h3>
              {event.description && (
                <p className="timeline-desc">{event.description}</p>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="empty">No timeline events.</p>}
      </div>
    </article>
  );
}
