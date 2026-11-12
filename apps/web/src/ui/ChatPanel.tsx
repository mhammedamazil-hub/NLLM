/**
 * Chat panel — ask questions, get grounded answers with citations.
 * Supports multiple chat sessions per notebook.
 * Requires a provider profile (OpenAI/Gemini/Anthropic) with an API key.
 */
import { useState, useEffect } from 'react';
import type { ChatTurn, ChatSession, ProviderKind } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';
import { retrieve } from '../core/retrieval/engine.ts';
import { buildChatPrompt, resolveCitations } from '../core/providers/grounding.ts';
import { providerFor } from '../core/providers/registry.ts';
import { decryptSecret, encryptSecret } from '../core/providers/keyvault.ts';

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  passphrase: string;
}

export interface ChatPanelProps {
  notebookId: string;
  repo: Repository;
  onProviderSave?: (cfg: ProviderConfig) => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const { notebookId, repo, onProviderSave } = props;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<ProviderConfig>({
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    passphrase: '',
  });
  const [keyBlob, setKeyBlob] = useState<string | null>(null);

  function refreshSessions(selectNew = false) {
    const list = repo.listChatSessions(notebookId);
    setSessions(list);
    if (selectNew || !currentSessionId) {
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      } else {
        // Create an initial session
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

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
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setAnswer('');
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
        return;
      }

      // 2. Build the grounded prompt.
      const prompt = buildChatPrompt(q, evidence);

      // 3. Call the provider.
      if (!keyBlob) throw new Error('Configure an API key below to ask questions.');
      const apiKey = await decryptSecret(keyBlob, cfg.passphrase);
      const provider = providerFor(cfg.kind);
      const res = await provider.generate(apiKey, cfg.model, {
        baseUrl: cfg.baseUrl,
        system: prompt.system,
        prompt: prompt.user,
      });

      // 4. Resolve citations (map [S1] refs back to real chunks).
      const rawCitations = resolveCitations(res.text, evidence);
      const citations = rawCitations
        .map((c) => {
          const evidencePiece = evidence[c.index - 1];
          return evidencePiece
            ? { chunkId: c.chunkId, sourceId: evidencePiece.sourceId, location: { label: evidencePiece.locationLabel } }
            : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      setAnswer(res.text);

      // 5. Persist turns to current session.
      const sessionId = currentSessionId ?? repo.createChatSession(notebookId, q).id;
      if (!currentSessionId) {
        setCurrentSessionId(sessionId);
        refreshSessions();
      }
      repo.addChatTurn({ notebookId, sessionId, role: 'user', content: q });
      repo.addChatTurn({ notebookId, sessionId, role: 'assistant', content: res.text, citations, model: cfg.model });
      refreshTurns();
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveKey = async () => {
    if (!cfg.apiKey) return;
    try {
      const blob = await encryptSecret(cfg.apiKey, 'passphrase');
      setKeyBlob(blob);
      onProviderSave?.(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="panel chat-panel">
      <header>
        <h2>Chat</h2>
        <span className="hint">Grounded answers with [S1] citations</span>
      </header>

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
          </div>
        )}
        {turns.length === 0 && !answer && <p className="empty">Ask anything about your sources.</p>}
      </div>

      {error && <p className="error">{error}</p>}

      {/* Input */}
      <div className="chat-input">
        <input
          type="text"
          placeholder="Ask about your sources…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
        />
        <button onClick={ask} disabled={busy || !question.trim()}>{busy ? '…' : 'Ask'}</button>
      </div>

      {/* Provider config */}
      <details className="provider-config">
        <summary>Provider settings</summary>
        <label>Kind
          <select value={cfg.kind} onChange={(e) => setCfg({ ...cfg, kind: e.target.value as ProviderKind })}>
            <option value="openai">OpenAI-compatible</option>
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label>Model
          <input value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
        </label>
        <label>API key
          <input type="password" value={cfg.apiKey} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} placeholder="sk-…" />
        </label>
        <label>Unlock passphrase
          <input type="password" value={cfg.passphrase} onChange={(e) => setCfg({ ...cfg, passphrase: e.target.value })} placeholder="Local unlock" />
        </label>
        <label>Base URL (OpenAI-compatible)
          <input value={cfg.baseUrl} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
        </label>
        <button onClick={saveKey}>Save key</button>
        <span className="hint">Key is encrypted at rest (PBKDF2 + AES-GCM).</span>
      </details>
    </section>
  );
}
