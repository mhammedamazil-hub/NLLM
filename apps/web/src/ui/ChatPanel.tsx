/**
 * Chat panel — ask questions, get grounded answers with citations.
 * Supports multiple chat sessions per notebook.
 * Uses an ActiveProvider from ProviderManager (encrypted key, never plaintext).
 * Streaming responses via provider onDelta callback.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatTurn, ChatSession } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';
import { retrieve } from '../core/retrieval/engine.ts';
import { buildChatPrompt, resolveCitations } from '../core/providers/grounding.ts';
import { providerFor } from '../core/providers/registry.ts';
import { decryptSecret } from '../core/providers/keyvault.ts';
import type { ActiveProvider } from './ProviderManager.tsx';

export interface ChatPanelProps {
  notebookId: string;
  repo: Repository;
  activeProvider: ActiveProvider | null;
  providerPassphrase: string;
}

export function ChatPanel(props: ChatPanelProps) {
  const { notebookId, repo, activeProvider, providerPassphrase } = props;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [decryptedKey, setDecryptedKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  function refreshSessions(selectNew = false) {
    const list = repo.listChatSessions(notebookId);
    setSessions(list);
    if (selectNew || !currentSessionId) {
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      } else {
        const s = repo.createChatSession(notebookId, 'New chat');
        setSessions([s]);
        setCurrentSessionId(s.id);
      }
    }
  }

  function refreshTurns() {
    if (currentSessionId) {
      setTurns(repo.listChatTurns(notebookId, currentSessionId));
    } else {
      setTurns([]);
    }
  }

  useEffect(() => {
    refreshSessions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId]);

  useEffect(() => {
    refreshTurns();
    setTimeout(scrollToBottom, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (streaming) scrollToBottom();
  }, [answer, streaming, scrollToBottom]);

  // Decrypt the API key when provider changes (keeps it in memory only)
  useEffect(() => {
    if (activeProvider && providerPassphrase) {
      decryptSecret(activeProvider.apiKeyEncrypted, providerPassphrase)
        .then(setDecryptedKey)
        .catch(() => setDecryptedKey(null));
    } else {
      setDecryptedKey(null);
    }
  }, [activeProvider, providerPassphrase]);

  const newSession = () => {
    const s = repo.createChatSession(notebookId, 'New chat');
    setSessions((prev) => [s, ...prev]);
    setCurrentSessionId(s.id);
    setAnswer('');
    setError(null);
    refreshTurns();
  };

  const selectSession = (id: string) => {
    setCurrentSessionId(id);
    setAnswer('');
    refreshTurns();
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || streaming) return;
    if (!activeProvider || !decryptedKey) {
      setError('Unlock your API key in Settings to ask questions.');
      return;
    }
    setStreaming(true);
    setError(null);
    setAnswer('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1. Retrieve evidence.
      const result = retrieve(repo, notebookId, q, { limit: 6 });
      const evidence = result.hits.map((h) => ({
        chunkId: h.chunk.id,
        sourceId: h.chunk.sourceId,
        text: h.chunk.text,
        locationLabel: h.chunk.location.label,
      }));
      if (evidence.length === 0) {
        setAnswer('I could not find any relevant passages in this notebook. Add more sources and try again.');
        setStreaming(false);
        return;
      }

      // 2. Build the grounded prompt.
      const prompt = buildChatPrompt(q, evidence);

      // 3. Stream the response.
      const provider = providerFor(activeProvider.kind);
      let fullText = '';
      const res = await provider.generate(decryptedKey, activeProvider.model, {
        baseUrl: activeProvider.baseUrl,
        system: prompt.system,
        prompt: prompt.user,
        signal: controller.signal,
        onDelta: (delta: string) => {
          fullText += delta;
          setAnswer(fullText);
        },
      });

      // Use provider result as fallback if no deltas were received
      if (!fullText && res.text) {
        fullText = res.text;
        setAnswer(fullText);
      }

      // 4. Resolve citations.
      const rawCitations = resolveCitations(fullText, evidence);
      const citations = rawCitations
        .map((c) => {
          const evidencePiece = evidence[c.index - 1];
          return evidencePiece
            ? { chunkId: c.chunkId, sourceId: evidencePiece.sourceId, location: { label: evidencePiece.locationLabel } }
            : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      // 5. Persist turns.
      const sessionId = currentSessionId ?? repo.createChatSession(notebookId, q).id;
      if (!currentSessionId) {
        setCurrentSessionId(sessionId);
        refreshSessions();
      }
      repo.addChatTurn({ notebookId, sessionId, role: 'user', content: q });
      repo.addChatTurn({ notebookId, sessionId, role: 'assistant', content: fullText, citations, model: activeProvider.model });
      refreshTurns();
      setTimeout(scrollToBottom, 50);
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const copyAnswer = () => {
    if (answer) navigator.clipboard.writeText(answer).catch(() => {});
  };

  return (
    <section className="panel chat-panel">
      <header>
        <h2>Chat</h2>
        <span className="hint">
          {activeProvider ? `${activeProvider.kind} · ${activeProvider.model}` : 'Configure API key in Settings'}
        </span>
      </header>

      {!activeProvider && (
        <div className="chat-no-provider">
          <p className="empty">No API key configured.</p>
          <p className="hint">Go to Settings → API Keys to add and unlock a key.</p>
        </div>
      )}

      {activeProvider && (
        <>
          {/* Session list */}
          <div className="chat-sessions">
            <button className="btn small" onClick={newSession}>+ New chat</button>
            {sessions.map((s) => (
              <button
                key={s.id}
                className={`session-item ${currentSessionId === s.id ? 'active' : ''}`}
                onClick={() => selectSession(s.id)}
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Turn history */}
          <div className="chat-turns">
            {turns.map((t) => (
              <div key={t.id} className={`chat-turn ${t.role}`}>
                <span className="turn-role">{t.role}</span>
                <span className="turn-content">{t.content}</span>
                {t.citations.length > 0 && (
                  <div className="turn-citations">
                    {t.citations.map((c, i) => (
                      <span key={i} className="citation">[S{i + 1}] {c.location.label}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {answer && (
              <div className="chat-turn assistant">
                <span className="turn-role">assistant</span>
                <span className="turn-content" dangerouslySetInnerHTML={{ __html: answer }} />
                <button className="btn small copy-btn" onClick={copyAnswer}>Copy</button>
              </div>
            )}
            {streaming && answer && (
              <div className="chat-turn assistant">
                <span className="turn-role">assistant</span>
                <span className="turn-content">
                  <span className="streaming-cursor" />
                </span>
              </div>
            )}
            {turns.length === 0 && !answer && !streaming && <p className="empty">Ask anything about your sources.</p>}
            <div ref={turnsEndRef} />
          </div>

          {error && <p className="error">{error}</p>}

          {/* Input */}
          <div className="chat-input">
            <input
              type="text"
              placeholder="Ask about your sources…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={stop} className="stop-btn">Stop</button>
            ) : (
              <button onClick={ask} disabled={!question.trim()}>Ask</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
