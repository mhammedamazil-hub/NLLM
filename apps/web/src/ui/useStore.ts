/**
 * useStore — manages the SQLite DB lifecycle for the UI.
 * In the browser, the DB lives in the WASM VFS and persists via the
 * IndexedDB-backed origin file system or a downloaded blob. For the MVP
 * shell, we keep an in-memory DB per session and persist on demand via
 * export() → download. Local-first means no network required.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Database } from '../core/storage/database.ts';
import { Repository } from '../core/storage/repository.ts';
import { importSource } from '../core/ingestion/pipeline.ts';
import { loadPersistedDb, savePersistedDb } from '../core/storage/persistence.ts';
import type { Notebook, Source } from '../core/domain/types.ts';

export interface Store {
  db: Database | null;
  repo: Repository | null;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  sources: Source[];
  ready: boolean;
  error: string | null;
  /** Import a file into the selected notebook. */
  importFile: (file: File) => Promise<void>;
  /** Create a new notebook. */
  createNotebook: (title: string, description?: string) => Promise<void>;
  /** Select a notebook. */
  selectNotebook: (id: string) => void;
  /** Delete a notebook. */
  deleteNotebook: (id: string) => Promise<void>;
  /** Reload the notebook list (after mutations). */
  reload: () => void;
  /** Persist the current DB to IndexedDB. */
  persist: () => Promise<void>;
}

export function useStore(): Store {
  const [db, setDb] = useState<Database | null>(null);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repoRef = useRef<Repository | null>(null);
  const dbRef = useRef<Database | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Try to load persisted DB from IndexedDB
        const persisted = await loadPersistedDb();
        let db: Database;
        if (persisted) {
          db = await Database.openFromBlob(persisted);
        } else {
          db = await Database.open();
        }
        const repo = new Repository(db);
        if (cancelled) {
          db.close();
          return;
        }
        repoRef.current = repo;
        dbRef.current = db;
        setDb(db);
        setRepo(repo);
        setReady(true);
        // Persist initial state
        if (persisted) {
          // Already persisted, no need to re-save
        } else {
          // Save empty DB to IndexedDB for future sessions
          const blob = db.export();
          await savePersistedDb(blob);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      dbRef.current?.close();
    };
  }, []);

  // Save to IndexedDB after any mutation
  const persist = useCallback(async () => {
    if (!dbRef.current) return;
    try {
      const blob = dbRef.current.export();
      await savePersistedDb(blob);
    } catch {
      // Best-effort persistence
    }
  }, []);

  const reload = useCallback(() => {
    if (!repoRef.current) return;
    const nbs = repoRef.current.listNotebooks();
    setNotebooks(nbs);
    if (!selectedNotebookId && nbs.length > 0) {
      setSelectedNotebookId(nbs[0].id);
    }
    if (selectedNotebookId) {
      setSources(repoRef.current.listSources(selectedNotebookId));
    }
  }, [selectedNotebookId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectNotebook = useCallback((id: string) => {
    setSelectedNotebookId(id);
    if (repoRef.current) setSources(repoRef.current.listSources(id));
  }, []);

  const createNotebook = useCallback(async (title: string, description = '') => {
    if (!repoRef.current) return;
    const nb = repoRef.current.createNotebook({ title, description });
    setSelectedNotebookId(nb.id);
    reload();
    await persist();
  }, [reload, persist]);

  const deleteNotebook = useCallback(async (id: string) => {
    if (!repoRef.current) return;
    repoRef.current.deleteNotebook(id);
    if (selectedNotebookId === id) setSelectedNotebookId(null);
    reload();
    await persist();
  }, [selectedNotebookId, reload, persist]);

  const importFile = useCallback(async (file: File) => {
    if (!repoRef.current || !selectedNotebookId) {
      throw new Error('Select a notebook first');
    }
    await importSource(repoRef.current, selectedNotebookId, file);
    reload();
    await persist();
  }, [selectedNotebookId, reload, persist]);

  return {
    db, repo, notebooks, selectedNotebookId, sources, ready, error,
    importFile, createNotebook, selectNotebook, deleteNotebook, reload, persist,
  };
}
