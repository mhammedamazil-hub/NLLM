/**
 * Artifact panel — generate and view artifacts (mind maps, slides,
 * flashcards, quiz, summaries, etc.) from notebook evidence.
 */
import { useState } from 'react';
import type { ArtifactKind, ProviderKind } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';
import { renderArtifact } from '../core/artifacts/renderers.ts';
import { generateArtifactModel } from '../core/artifacts/generate.ts';
import { retrieve } from '../core/retrieval/engine.ts';
import { providerFor } from '../core/providers/registry.ts';
import { decryptSecret } from '../core/providers/keyvault.ts';
import { AudioVideoPlayer } from './AudioVideoPlayer.tsx';

export interface ArtifactPanelProps {
  notebookId: string;
  repo: Repository;
  providerConfig?: {
    kind: ProviderKind;
    baseUrl: string;
    model: string;
    apiKey: string;
    passphrase: string;
  } | null;
}

const KINDS: ArtifactKind[] = [
  'mindmap', 'slides', 'flashcards', 'quiz', 'audio_overview',
  'video_overview', 'guide', 'briefing', 'summary', 'faq',
  'outline', 'glossary', 'timeline', 'table', 'report',
];

export function ArtifactPanel(props: ArtifactPanelProps) {
  const { notebookId, repo, providerConfig } = props;
  const [kind, setKind] = useState<ArtifactKind>('mindmap');
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState<string | null>(null);
  const [generatedModel, setGeneratedModel] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState(() => repo.listArtifacts(notebookId));

  const generate = async () => {
    if (!providerConfig || !providerConfig.apiKey) {
      setError('Configure a provider in the Chat panel first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = retrieve(repo, notebookId, title || kind, { limit: 8 });
      const evidence = result.hits.map((h) => ({
        chunkId: h.chunk.id,
        text: h.chunk.text,
        location: { label: h.chunk.location.label },
      }));
      const apiKey = await decryptSecret(providerConfig.apiKey, providerConfig.passphrase);
      const provider = providerFor(providerConfig.kind);
      const gen = await generateArtifactModel({
        notebookId,
        kind,
        title: title || kind,
        evidence,
        provider,
        model: providerConfig.model,
        apiKey,
        baseUrl: providerConfig.baseUrl,
      });
      repo.createArtifact({
        notebookId,
        kind,
        title: title || kind,
        model: gen.model,
        evidenceChunkIds: evidence.map((e) => e.chunkId),
      });
      setHtml(renderArtifact(kind, gen.model, title || kind));
      setGeneratedModel(gen.model);
      setArtifacts(repo.listArtifacts(notebookId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel artifact-panel">
      <header>
        <h2>Artifacts</h2>
      </header>
      <div className="artifact-controls">
        <select value={kind} onChange={(e) => setKind(e.target.value as ArtifactKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input placeholder="Artifact title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="artifact-view">
        {html ? (
          <ArtifactView
            kind={kind}
            html={html}
            model={generatedModel}
            title={title || kind}
          />
        ) : (
          <p className="empty">Generate an artifact from your sources.</p>
        )}
      </div>
      <ul className="artifact-items">
        {artifacts.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => {
                setHtml(renderArtifact(a.kind, a.model, a.title));
                setGeneratedModel(a.model);
                setKind(a.kind);
                setTitle(a.title);
              }}
            >
              {a.title} <span className="kind">{a.kind}</span>
            </button>
          </li>
        ))}
        {artifacts.length === 0 && <li className="empty">No artifacts yet</li>}
      </ul>
    </section>
  );
}

/**
 * ArtifactView — renders artifact content.
 * Uses AudioVideoPlayer for audio/video artifacts, HTML render for others.
 */
function ArtifactView({
  kind,
  html,
  model,
  title,
}: {
  kind: ArtifactKind;
  html: string;
  model: Record<string, unknown> | null;
  title: string;
}) {
  if (kind === 'audio_overview' || kind === 'video_overview') {
    return (
      <AudioVideoPlayer
        kind={kind}
        model={model as { segments?: Array<{ title: string; startSeconds: number; script: string }>; scenes?: Array<{ title: string; visual: string; narration: string }> }}
        title={title}
      />
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
