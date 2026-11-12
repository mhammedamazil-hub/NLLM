/**
 * Root app — Notebook Studio shell.
 * Notebook list (sidebar) + tabbed workspace (Sources, Chat, Artifacts).
 * Local-first: SQLite in WASM, keys encrypted at rest, no network calls
 * except direct to the configured provider.
 */
import { useState } from 'react';
import { useStore } from './ui/useStore.ts';
import { NotebookList } from './ui/NotebookList.tsx';
import { SourcesPanel } from './ui/SourcesPanel.tsx';
import { ChatPanel, type ProviderConfig } from './ui/ChatPanel.tsx';
import { ArtifactPanel } from './ui/ArtifactPanel.tsx';

type Tab = 'sources' | 'chat' | 'artifacts';

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('sources');
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);

  const { notebooks, selectedNotebookId, sources, repo } = store;
  const sourceCounts: Record<string, number> = {};
  if (repo) {
    for (const nb of notebooks) {
      sourceCounts[nb.id] = repo.listSources(nb.id).length;
    }
  }

  return (
    <div className="app-shell">
      <NotebookList
        notebooks={notebooks}
        selectedId={selectedNotebookId}
        sourceCounts={sourceCounts}
        onSelect={store.selectNotebook}
        onCreate={store.createNotebook}
        onDelete={store.deleteNotebook}
      />
      <main className="workspace">
        {store.error ? (
          <div className="error banner">Storage error: {store.error}</div>
        ) : !store.ready ? (
          <p className="loading">Loading Notebook Studio…</p>
        ) : !selectedNotebookId ? (
          <p className="empty">Select or create a notebook to get started.</p>
        ) : (
          <>
            <nav className="tabs">
              <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>Sources</button>
              <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
              <button className={tab === 'artifacts' ? 'active' : ''} onClick={() => setTab('artifacts')}>Artifacts</button>
            </nav>
            <div className="tab-body">
              {tab === 'sources' && (
                <SourcesPanel sources={sources} onImportFile={store.importFile} />
              )}
              {tab === 'chat' && repo && (
                <ChatPanel
                  notebookId={selectedNotebookId}
                  repo={repo}
                  onProviderSave={setProviderConfig}
                />
              )}
              {tab === 'artifacts' && repo && (
                <ArtifactPanel
                  notebookId={selectedNotebookId}
                  repo={repo}
                  providerConfig={providerConfig}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
