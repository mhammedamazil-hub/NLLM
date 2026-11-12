/**
 * ProviderManager — manages API key profiles with proper persistence.
 * - Encrypt key with user passphrase (consistent for encrypt + decrypt)
 * - Save encrypted key to SQLite via repository.saveProviderProfile()
 * - Load profiles on startup
 * - Test API connection
 * - Delete/change keys
 * - Never expose plaintext key to other components
 */
import { useState, useEffect, useCallback } from 'react';
import type { ProviderKind, ProviderProfile } from '../core/domain/types.ts';
import type { Repository } from '../core/storage/repository.ts';
import { encryptSecret, decryptSecret, canDecrypt } from '../core/providers/keyvault.ts';
import { providerFor } from '../core/providers/registry.ts';

export interface ActiveProvider {
  profileId: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKeyEncrypted: string;
}

export interface ProviderManagerProps {
  repo: Repository;
  onActivate: (active: ActiveProvider | null) => void;
  onPassphrase: (passphrase: string) => void;
  onPersist: () => Promise<void>;
}

export function ProviderManager({ repo, onActivate, onPassphrase, onPersist }: ProviderManagerProps) {
  const [profiles, setProfiles] = useState<Array<Omit<ProviderProfile, 'apiKeyEncrypted'>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newKind, setNewKind] = useState<ProviderKind>('gemini');
  const [newBaseUrl, setNewBaseUrl] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  const refreshProfiles = useCallback(() => {
    const list = repo.listProviderProfiles();
    setProfiles(list);
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id);
    }
  }, [repo, selectedId]);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const handleUnlock = useCallback(async () => {
    if (!selectedId || !passphrase) return;
    const profile = repo.getProviderProfile(selectedId);
    if (!profile) return;
    const ok = await canDecrypt(profile.apiKeyEncrypted, passphrase);
    if (ok) {
      setUnlocked(true);
      onActivate({
        profileId: profile.id,
        kind: profile.kind,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKeyEncrypted: profile.apiKeyEncrypted,
      });
      onPassphrase(passphrase);
      setTestStatus('idle');
      setTestMessage('');
    } else {
      setUnlocked(false);
      setSaveError('Passphrase incorrect. Cannot unlock key.');
    }
  }, [selectedId, passphrase, repo, onActivate, onPassphrase]);

  const handleSaveKey = useCallback(async () => {
    if (!newApiKey || !newPassphrase) {
      setSaveStatus('error');
      setSaveError('API key and passphrase are required.');
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);
    try {
      // Use the actual passphrase, not a hardcoded string
      const encrypted = await encryptSecret(newApiKey, newPassphrase);
      // Delete existing profile if editing
      if (selectedId) {
        repo.deleteProviderProfile(selectedId);
      }
      // Save to SQLite
      const profile = repo.saveProviderProfile({
        kind: newKind,
        baseUrl: newBaseUrl || defaultBaseUrl(newKind),
        apiKeyEncrypted: encrypted,
        model: newModel || defaultModel(newKind),
      });
      setSelectedId(profile.id);
      setShowAdd(false);
      setNewApiKey('');
      setNewPassphrase('');
      setNewBaseUrl('');
      setNewModel('');
      setPassphrase(newPassphrase);
      onPassphrase(newPassphrase);
      setSaveStatus('saved');
      await onPersist();
      refreshProfiles();
      // Auto-unlock
      setUnlocked(true);
      onActivate({
        profileId: profile.id,
        kind: profile.kind,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKeyEncrypted: profile.apiKeyEncrypted,
      });
    } catch (e) {
      setSaveStatus('error');
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [newApiKey, newPassphrase, newKind, newBaseUrl, newModel, selectedId, repo, onActivate, onPassphrase, onPersist, refreshProfiles]);

  const handleTestConnection = useCallback(async () => {
    if (!unlocked || !selectedId) return;
    const profile = repo.getProviderProfile(selectedId);
    if (!profile) return;
    setTestStatus('testing');
    setTestMessage('');
    try {
      const apiKey = await decryptSecret(profile.apiKeyEncrypted, passphrase);
      const provider = providerFor(profile.kind);
      const res = await provider.generate(apiKey, profile.model, {
        baseUrl: profile.baseUrl,
        system: 'You are a connectivity test. Reply with exactly: OK',
        prompt: 'Test',
      });
      if (res.text.trim().toUpperCase().includes('OK')) {
        setTestStatus('success');
        setTestMessage('Connection successful. API key is valid.');
      } else {
        setTestStatus('success');
        setTestMessage('Connection successful (unexpected response but no error).');
      }
    } catch (e) {
      setTestStatus('fail');
      setTestMessage(e instanceof Error ? e.message : String(e));
    }
  }, [unlocked, selectedId, repo, passphrase]);

  const handleDelete = useCallback(async (id: string) => {
    repo.deleteProviderProfile(id);
    if (selectedId === id) {
      setSelectedId(null);
      setUnlocked(false);
      onActivate(null);
    }
    setPassphrase('');
    onPassphrase('');
    await onPersist();
    refreshProfiles();
  }, [repo, selectedId, onActivate, onPassphrase, onPersist, refreshProfiles]);

  const handleLock = useCallback(() => {
    setUnlocked(false);
    setPassphrase('');
    onPassphrase('');
    onActivate(null);
  }, [onActivate, onPassphrase]);

  return (
    <div className="provider-manager">
      {/* Profile list */}
      <div className="pm-section">
        <div className="pm-header">
          <h3>API Keys</h3>
          <button className="btn small" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Key'}
          </button>
        </div>
        {profiles.length === 0 && !showAdd && (
          <p className="empty">No API keys saved. Add one to start chatting.</p>
        )}
        <ul className="pm-profiles">
          {profiles.map((p) => (
            <li
              key={p.id}
              className={`pm-profile ${selectedId === p.id ? 'selected' : ''}`}
            >
              <button className="pm-select" onClick={() => { setSelectedId(p.id); setUnlocked(false); setPassphrase(''); }}>
                <span className="pm-name">{p.kind} · {p.model}</span>
                <span className="pm-url">{p.baseUrl}</span>
              </button>
              <button className="btn small danger" onClick={() => handleDelete(p.id)}>Delete</button>
            </li>
          ))}
        </ul>

        {/* Save status (visible after form closes) */}
        {saveStatus === 'saved' && <p className="success">Key saved successfully.</p>}
        {saveStatus === 'error' && <p className="error">{saveError}</p>}
      </div>

      {/* Unlock section */}
      {selectedId && !unlocked && (
        <div className="pm-section">
          <h3>Unlock Key</h3>
          <label className="pm-label">Passphrase
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase to unlock"
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
            />
          </label>
          <button onClick={handleUnlock} disabled={!passphrase}>Unlock</button>
          {saveError && <p className="error">{saveError}</p>}
        </div>
      )}

      {/* Active + test */}
      {unlocked && selectedId && (
        <div className="pm-section">
          <h3>Active Provider</h3>
          <div className="pm-active">
            <span className="pm-active-kind">{profiles.find(p => p.id === selectedId)?.kind}</span>
            <span className="pm-active-model">{profiles.find(p => p.id === selectedId)?.model}</span>
          </div>
          <button className="btn small" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
            {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          {testStatus === 'success' && <p className="success">{testMessage}</p>}
          {testStatus === 'fail' && <p className="error">{testMessage}</p>}
          <button className="btn small" onClick={handleLock}>Lock</button>
        </div>
      )}

      {/* Add new key form */}
      {showAdd && (
        <div className="pm-section pm-add-form">
          <h3>Add API Key</h3>
          <label className="pm-label">Provider
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as ProviderKind)}>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label className="pm-label">Model
            <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder={defaultModel(newKind)} />
          </label>
          <label className="pm-label">Base URL
            <input value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} placeholder={defaultBaseUrl(newKind)} />
          </label>
          <label className="pm-label">API Key
            <input type="password" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} placeholder="sk-… or AIza…" />
          </label>
          <label className="pm-label">Passphrase
            <input type="password" value={newPassphrase} onChange={(e) => setNewPassphrase(e.target.value)} placeholder="Local unlock passphrase" />
          </label>
          <p className="hint">Key is encrypted with AES-GCM (PBKDF2 200k iterations). The passphrase is required to decrypt.</p>
          <button onClick={handleSaveKey} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save Key'}
          </button>
          {saveStatus === 'saved' && <p className="success">Key saved successfully.</p>}
          {saveStatus === 'error' && <p className="error">{saveError}</p>}
        </div>
      )}
    </div>
  );
}

function defaultBaseUrl(kind: ProviderKind): string {
  switch (kind) {
    case 'gemini': return 'https://generativelanguage.googleapis.com';
    case 'openai': return 'https://api.openai.com/v1';
    case 'anthropic': return 'https://api.anthropic.com';
  }
}

function defaultModel(kind: ProviderKind): string {
  switch (kind) {
    case 'gemini': return 'gemini-2.0-flash';
    case 'openai': return 'gpt-4o-mini';
    case 'anthropic': return 'claude-3-5-sonnet';
  }
}
