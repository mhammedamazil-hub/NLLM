import { makeSource, retrieve, hasSufficientEvidence, evidenceAnswer, parseGitHubRepository, contextualizeQuery } from './core.js';
import { requestChat } from './provider.js';
import { restoreNotebookBackup } from './backup.js';
import { extractDocument } from './parsers.js';

const DB_NAME = 'sourceforge-local', DB_VERSION = 1;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const id = () => crypto.randomUUID();
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fileExt = n => (n.split('.').pop() || 'TXT').toUpperCase().slice(0, 4);
let db, currentNotebookId, toastTimer, providerKey = '', flashcards = [], flashIndex = 0, showAnswer = false;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const store of ['notebooks', 'sources', 'messages', 'settings']) if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
function all(store) { return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function get(store, key) { return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
function put(store, value) { return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); }); }
function del(store, key) { return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
function clear(store) { return new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
function say(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }
function saveIndicator(text = '● Saved locally') { $('#save-state').textContent = text; }
const activeNotebook = async () => (await all('notebooks')).find(n => n.id === currentNotebookId);
const notebookSources = async () => (await all('sources')).filter(s => s.notebookId === currentNotebookId && s.status === 'ready');

async function init() {
  if (!('indexedDB' in window)) { document.body.innerHTML = '<main style="padding:3rem;font:16px sans-serif">This browser does not support IndexedDB, which SourceForge needs for local notebook storage.</main>'; return; }
  db = await openDB();
  const notebooks = await all('notebooks');
  if (!notebooks.length) { const n = { id: id(), name: 'Research notebook', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await put('notebooks', n); currentNotebookId = n.id; }
  else { const lastActive = await get('settings', 'activeNotebook'); currentNotebookId = notebooks.find(n => n.id === lastActive?.notebookId)?.id || notebooks[0].id; }
  const prefs = await get('settings', 'preferences') || { id: 'preferences', theme: 'light', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', persistKey: false, savedKey: '' };
  providerKey = prefs.persistKey ? (prefs.savedKey || '') : '';
  if (prefs.theme === 'dark') document.body.classList.add('dark');
  $('#provider-kind').value = prefs.provider || 'openai';
  $('#provider-url').value = prefs.baseUrl || '';
  $('#provider-model').value = prefs.model || '';
  $('#persist-key').checked = !!prefs.persistKey;
  $('#provider-key').value = providerKey;
  await render();
  wire(); updateNetwork(); updateStorage();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => say('Offline cache could not be updated. The app still works online.'));
}

async function render() {
  const notebooks = await all('notebooks');
  if (!notebooks.some(n => n.id === currentNotebookId)) currentNotebookId = notebooks[0]?.id;
  const selected = notebooks.find(n => n.id === currentNotebookId);
  const select = $('#notebook-select'); select.innerHTML = notebooks.map(n => `<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');
  if (selected) { select.value = selected.id; $('#notebook-title').textContent = selected.name; await put('settings', { id: 'activeNotebook', notebookId: selected.id }); }
  const sources = await notebookSources();
  $('#source-count').textContent = sources.length;
  $('#notebook-subtitle').textContent = `${sources.length} source${sources.length === 1 ? '' : 's'} · local evidence search`;
  const welcome = $('#welcome');
  if (sources.length) {
    $('.welcome h2').innerHTML = 'Your sources are<br>ready to explore.';
    $('.welcome>p').textContent = 'Ask a question to find relevant passages. Answers are grounded in the material you imported.';
    $('#welcome-add').classList.add('hidden');
  } else {
    $('.welcome h2').innerHTML = 'Start with what<br>you know.';
    $('.welcome>p').textContent = "Add a source, then ask a question. Answers in evidence mode come directly from your material—not a model's memory.";
    $('#welcome-add').classList.remove('hidden');
  }
  renderSources(sources);
  const messages = (await all('messages')).filter(m => m.notebookId === currentNotebookId).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  $('#welcome').classList.toggle('hidden', messages.length > 0);
  const feed = $('#conversation-feed');
  feed.innerHTML = messages.map(messageHTML).join('');
  feed.scrollTop = feed.scrollHeight;
  saveIndicator();
}
function messageHTML(m) {
  const sources = (m.evidence || []).map(e => `<button class="citation-chip" data-source="${esc(e.sourceId)}" data-line="${e.lineStart}" title="${esc(e.sourceName)} · lines ${e.lineStart}–${e.lineEnd}">${esc(e.ref)} · ${esc(e.sourceName)}${e.pageStart ? ` · p.${e.pageStart}` : ''}${e.lineStart ? ` · L${e.lineStart}` : ''}</button>`).join('');
  return `<article class="message ${m.role === 'user' ? 'user' : ''}"><div class="message-head">${m.role === 'user' ? 'YOU' : 'SOURCEFORGE'} · ${new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}${m.role === 'assistant' ? `<button class="copy-answer" data-copy="${esc(m.id)}">Copy</button>` : ''}</div><div class="message-bubble">${esc(m.text)}</div>${m.insufficient ? '<div class="evidence-label">INSUFFICIENT SOURCE EVIDENCE</div>' : m.evidence?.length ? `<div class="evidence-label">${m.remote ? 'AI RESPONSE · SOURCES RETRIEVED LOCALLY' : 'SOURCE EXCERPTS · EVIDENCE MODE'}</div><div class="citations">${sources}</div>` : ''}</article>`;
}
function renderSources(sources) {
  const query = $('#source-filter').value.trim().toLocaleLowerCase();
  const shown = sources.filter(s => !query || s.name.toLocaleLowerCase().includes(query) || s.content.toLocaleLowerCase().includes(query));
  const selected = sources.filter(s => s.selected !== false).length;
  $('#selection-count').textContent = `${selected} of ${sources.length} selected`;
  $('#toggle-all-sources').textContent = selected === sources.length ? 'Select none' : 'Select all';
  $('#source-list').innerHTML = shown.length ? shown.map(s => `<div class="source-item ${s.selected === false ? 'source-disabled' : ''}" data-id="${esc(s.id)}" tabindex="0"><input class="source-check" data-select="${esc(s.id)}" type="checkbox" aria-label="Use ${esc(s.name)} in research" ${s.selected === false ? '' : 'checked'}><span class="source-type">${esc(fileExt(s.name))}</span><span class="source-info"><b title="${esc(s.name)}">${esc(s.name)}</b><small>${s.charCount.toLocaleString()} chars · ${new Date(s.importedAt).toLocaleDateString()}</small></span><button class="source-action" data-rename="${esc(s.id)}" aria-label="Rename ${esc(s.name)}" title="Rename source">✎</button><button class="remove-source" data-remove="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">×</button><div class="source-preview">${esc(s.content.slice(0, 900))}${s.content.length > 900 ? '…' : ''}</div></div>`).join('') : `<div class="source-empty">${sources.length ? 'No source title or content matches your search.' : 'No sources yet. Add a text source or import a file to get started.'}</div>`;
}
function wire() {
  $('#notebook-select').onchange = async e => { currentNotebookId = e.target.value; await render(); };
  $('#new-notebook').onclick = createNotebook; $('#rename-notebook').onclick = renameNotebook; $('#delete-notebook').onclick = deleteNotebook; $('#duplicate-notebook').onclick = duplicateNotebook;
  $('#export-notebook').onclick = exportNotebook; $('#add-source').onclick = () => $('#file-input').click(); $('#add-text-source').onclick = () => $('#source-dialog').showModal(); $('#welcome-add').onclick = () => $('#source-dialog').showModal();
  $('#file-input').onchange = async e => { const files = [...e.target.files]; e.target.value = ''; for (const file of files) await importFile(file); };
  let searchTimer; $('#source-filter').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(async () => renderSources(await notebookSources()), 150); };
  $('#toggle-all-sources').onclick = async () => { const sources = await notebookSources(); const select = sources.some(s => s.selected === false); for (const source of sources) { source.selected = select; await put('sources', source); } renderSources(sources); };
  $('#source-list').onchange = async e => { const checkbox = e.target.closest('[data-select]'); if (!checkbox) return; const source = await get('sources', checkbox.dataset.select); if (source) { source.selected = checkbox.checked; await put('sources', source); renderSources(await notebookSources()); } };
  $('#source-list').onclick = async e => {
    if (e.target.closest('[data-select]')) return;
    const rename = e.target.closest('[data-rename]'); if (rename) { e.stopPropagation(); await renameSource(rename.dataset.rename); return; }
    const rm = e.target.closest('[data-remove]'); if (rm) { e.stopPropagation(); await del('sources', rm.dataset.remove); await render(); say('Source removed from this notebook.'); return; }
    if (e.target.closest('button')) return;
    const row = e.target.closest('.source-item'); if (row) row.classList.toggle('expanded');
  };
  $('#source-list').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('source-item')) { e.preventDefault(); e.target.classList.toggle('expanded'); } };
  $('#github-import').onclick = importGithub;
  $('#source-dialog .close-dialog').onclick = () => $('#source-dialog').close();
  $('#source-dialog').onclose = () => $('#source-form').reset();
  $('#source-form').onsubmit = async e => { e.preventDefault(); const name = $('#source-name').value.trim() || 'Pasted notes.txt'; const text = $('#source-text').value; try { await storeSource({ name, text, type: 'pasted text', origin: 'pasted by user' }); $('#source-dialog').close(); await render(); say('Source added and indexed locally.'); } catch (err) { say(err.message); } };
  $('#chat-form').onsubmit = sendQuestion;
  $('#conversation-feed').onclick = async e => { const copy = e.target.closest('[data-copy]'); if (copy) { const message = await get('messages', copy.dataset.copy); if (message && navigator.clipboard) { await navigator.clipboard.writeText(message.text); say('Answer copied.'); } else say('Clipboard is not available in this browser context.'); return; } const c = e.target.closest('[data-source]'); if (c) jumpToSource(c.dataset.source, Number(c.dataset.line)); };
  $$('.studio-card').forEach(b => b.onclick = () => runStudio(b.dataset.output));
  $('#theme-toggle').onclick = async () => { document.body.classList.toggle('dark'); const p = await preferences(); p.theme = document.body.classList.contains('dark') ? 'dark' : 'light'; await put('settings', p); };
  $('#provider-kind').onchange = e => { const defaults = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta' }; const previous = { openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta' }; if (Object.values(previous).includes($('#provider-url').value.trim())) $('#provider-url').value = defaults[e.target.value]; };
  $('#save-settings').onclick = saveProvider; $('#forget-key').onclick = forgetKey;
  $('#clear-all').onclick = clearEverything;
  $('#import-backup').onclick = () => $('#backup-input').click();
  $('#backup-input').onchange = async e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) await importBackup(file); };
  $('#close-flashcards').onclick = () => $('#flashcard-dialog').close();
  $('#flashcard-body').onclick = e => { if (e.target.closest('[data-flip]')) { showAnswer = !showAnswer; drawFlashcard(); } if (e.target.closest('[data-next]')) { flashIndex = (flashIndex + 1) % flashcards.length; showAnswer = false; drawFlashcard(); } if (e.target.closest('[data-prev]')) { flashIndex = (flashIndex - 1 + flashcards.length) % flashcards.length; showAnswer = false; drawFlashcard(); } };
  $('#flashcard-body').onkeydown = e => { if (e.target.matches('.flashcard') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); showAnswer = !showAnswer; drawFlashcard(); } };
  $$('.nav-item,.mobile-tab').forEach(b => b.onclick = () => switchPage(b.dataset.page));
  window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
  $('#provider-key').addEventListener('input', e => { providerKey = e.target.value; });
  $('#persist-key').onchange = async e => { if (!e.target.checked) { const p = await preferences(); p.persistKey = false; p.savedKey = ''; await put('settings', p); say('Saved API key removed from this browser.'); } };
  $('#question').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
}
async function createNotebook() {
  const name = prompt('Name your new notebook:'); if (!name?.trim()) return;
  const n = { id: id(), name: name.trim().slice(0, 100), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await put('notebooks', n); currentNotebookId = n.id; await render(); say('Notebook created. Your sources are kept separate.');
}
async function renameNotebook() {
  const n = await activeNotebook(); if (!n) return; const name = prompt('Rename notebook:', n.name); if (!name?.trim()) return;
  n.name = name.trim().slice(0, 100); n.updatedAt = new Date().toISOString(); await put('notebooks', n); await render();
}
async function duplicateNotebook() {
  const original = await activeNotebook(); if (!original) return;
  const duplicate = { id: id(), name: `${original.name.slice(0, 90)} copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const oldSources = await notebookSources(); const sourceMap = new Map(); const copies = [];
  for (const old of oldSources) { const copy = structuredClone(old); copy.id = id(); copy.notebookId = duplicate.id; copy.importedAt = new Date().toISOString(); sourceMap.set(old.id, copy); copies.push(copy); }
  const oldMessages = (await all('messages')).filter(m => m.notebookId === original.id); const messageCopies = oldMessages.map(old => ({ ...structuredClone(old), id: id(), notebookId: duplicate.id, evidence: (old.evidence || []).flatMap(ref => { const source = sourceMap.get(ref.sourceId); const index = source?.chunks.findIndex(c => c.lineStart === ref.lineStart && c.lineEnd === ref.lineEnd && c.text === ref.text) ?? -1; if (!source || index < 0) return []; const chunk = source.chunks[index]; return [{ ...ref, ref: `S${source.id.slice(0, 6)}-${index + 1}`, sourceId: source.id, sourceName: source.name, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd, text: chunk.text }]; }) }));
  await put('notebooks', duplicate); for (const source of copies) await put('sources', source); for (const message of messageCopies) await put('messages', message);
  currentNotebookId = duplicate.id; await render(); say('Notebook duplicated with independent source IDs and conversation.');
}
async function renameSource(sourceId) {
  const source = await get('sources', sourceId); if (!source || source.notebookId !== currentNotebookId) return;
  const name = prompt('Rename source:', source.name); if (!name?.trim()) return;
  const next = name.trim().slice(0, 160);
  try { makeSource({ id: source.id, name: next, text: source.content }); } catch (err) { say(`Source name must retain a supported text extension (.txt, .md, .csv, .json or code): ${err.message}`); return; }
  source.name = next; await put('sources', source); await render(); say('Source renamed.');
}
async function deleteNotebook() {
  const n = await activeNotebook(); if (!n || !confirm(`Delete “${n.name}” and its imported sources and conversation? This cannot be undone.`)) return;
  const [sources, messages, notebooks] = await Promise.all([all('sources'), all('messages'), all('notebooks')]);
  await Promise.all([...sources.filter(s => s.notebookId === n.id).map(s => del('sources', s.id)), ...messages.filter(m => m.notebookId === n.id).map(m => del('messages', m.id)), del('notebooks', n.id)]);
  const remaining = notebooks.filter(x => x.id !== n.id);
  if (remaining.length) currentNotebookId = remaining[0].id;
  else { const fresh = { id: id(), name: 'Research notebook', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await put('notebooks', fresh); currentNotebookId = fresh.id; }
  await render(); say('Notebook and its local data deleted.');
}
async function storeSource({ name, text, type = 'file', origin = 'local file', url = '', pageBreaks = [], metadata = {} }) {
  const sourceName = /\.[a-z0-9]{1,8}$/i.test(name) ? name : `${name}.txt`;
  const source = makeSource({ id: id(), name: sourceName, text, type, origin, url, pageBreaks, metadata }); source.notebookId = currentNotebookId;
  const dup = (await notebookSources()).find(s => s.content === source.content);
  if (dup) throw new Error(`This content is already in the notebook as “${dup.name}”.`);
  await put('sources', source); return source;
}
async function importFile(file) {
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: file exceeds the 8 MiB limit.`);
    saveIndicator(`◌ Reading ${file.name}…`);
    const extracted = await extractDocument(file);
    const source = await storeSource({ name: file.name, text: extracted.text, type: extracted.type, origin: 'local file upload', pageBreaks: extracted.pageBreaks, metadata: extracted.metadata });
    await render(); say(`${file.name} imported · ${source.chunks.length} passages${source.metadata.pageCount ? ` · ${source.metadata.pageCount} pages` : source.metadata.slideCount ? ` · ${source.metadata.slideCount} slides` : ''}.`);
  } catch (err) { saveIndicator(); say(`${file.name}: ${err.message}`); }
}
function isTextGitPath(path) {
  return /\.(txt|md|markdown|csv|json|js|ts|tsx|jsx|rs|py|go|java|html|css|xml|yaml|yml|toml|sh|sql|log|vtt|srt)$/i.test(path);
}
async function importGithub() {
  const repoInput = prompt('Public GitHub repository, directory, or file URL (owner/repo):'); if (!repoInput) return;
  let parsed;
  try { parsed = parseGitHubRepository(repoInput); } catch (err) { say(err.message); return; }
  const { owner, repo, ref, mode } = parsed;
  let paths;
  if (mode === 'file') paths = [parsed.path];
  else if (mode === 'directory') {
    if (!parsed.path) { say('Choose a directory URL or repository URL.'); return; }
    try {
      const treeUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
      const treeRes = await fetch(treeUrl, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
      if (treeRes.status === 403 || treeRes.status === 429) throw new Error('GitHub API rate limit reached. Try again later.');
      if (!treeRes.ok) throw new Error(`GitHub directory listing failed (HTTP ${treeRes.status}); check the branch or import a file URL instead.`);
      const tree = await treeRes.json();
      const prefix = parsed.path.replace(/\/$/, '') + '/';
      const candidates = (tree.tree || []).filter(x => x.type === 'blob' && x.path.startsWith(prefix) && isTextGitPath(x.path) && x.size <= 1024 * 1024).slice(0, 40).map(x => x.path);
      if (!candidates.length) { say('No supported text files under 1 MiB were found in this directory.'); return; }
      const answer = prompt(`Choose up to 10 files from this directory by entering comma-separated paths:\n\n${candidates.slice(0, 30).join('\n')}`, candidates.slice(0, 3).join(', '));
      if (!answer) return;
      paths = answer.split(',').map(p => p.trim()).filter(Boolean);
      if (paths.length > 10 || paths.some(p => !candidates.includes(p))) { say('Choose at most 10 paths exactly as listed.'); return; }
    } catch (err) { say(err.name === 'TimeoutError' ? 'GitHub directory request timed out.' : err.message.includes('Failed to fetch') ? 'GitHub request was blocked by browser CORS or network policy.' : err.message); return; }
  } else {
    const path = prompt('Single text file path (blank imports README.md):', 'README.md'); if (path === null) return;
    paths = [path.trim() || 'README.md'];
  }
  if (paths.some(path => !path || path.startsWith('/') || path.split('/').includes('..') || !isTextGitPath(path))) { say('Only supported relative text-file paths can be imported.'); return; }
  let totalBytes = 0, added = 0;
  for (const path of paths) {
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref || 'HEAD')}`;
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
      if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate limit reached.');
      if (!res.ok) throw new Error(`GitHub could not fetch ${path} (HTTP ${res.status}).`);
      const data = await res.json();
      if (data.type !== 'file' || data.size > 1024 * 1024 || data.encoding !== 'base64') throw new Error(`${path} is binary, too large, or unavailable as text.`);
      totalBytes += data.size; if (totalBytes > 2 * 1024 * 1024) throw new Error('Selected files exceed the 2 MiB aggregate limit.');
      const raw = atob(data.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const source = await storeSource({ name: `${owner}/${repo}/${data.path}`, text, type: 'GitHub', origin: `public GitHub · ${ref} · ${data.path}`, url: data.html_url });
      source.revision = ref; await put('sources', source); added++;
    } catch (err) {
      const reason = err.name === 'TimeoutError' ? 'request timed out' : err.message.includes('Failed to fetch') ? 'browser CORS/network blocked the request' : err.message;
      say(`GitHub import stopped after ${added} file(s): ${reason}`); if (added) await render(); return;
    }
  }
  await render(); say(`Imported ${added} selected file(s) from ${owner}/${repo} at ${ref}. The repository was not cloned.`);
}
function chunkEvidence(results) { return results.map(x => ({ ref: x.ref, sourceId: x.source.id, sourceName: x.source.name, lineStart: x.chunk.lineStart, lineEnd: x.chunk.lineEnd, pageStart: x.chunk.pageStart, pageEnd: x.chunk.pageEnd, text: x.chunk.text })); }
async function sendQuestion(e) {
  e.preventDefault(); const input = $('#question'); const question = input.value.trim(); if (!question) return;
  input.value = ''; const sources = await notebookSources();
  const history = (await all('messages')).filter(m => m.notebookId === currentNotebookId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const retrievalQuery = contextualizeQuery(question, history);
  const settings = await preferences(); const results = retrieve(sources, retrievalQuery, { limit: 5 });
  await put('messages', { id: id(), notebookId: currentNotebookId, role: 'user', text: question, createdAt: new Date().toISOString() });
  let answer;
  if (!hasSufficientEvidence(results)) answer = { text: evidenceAnswer(results, question).text, insufficient: true, evidence: [] };
  else if (providerKey.trim() && settings.model.trim()) {
    try { answer = { text: await requestChat(question, results, settings, providerKey, { history }), insufficient: false, evidence: chunkEvidence(results), remote: true }; }
    catch (err) { answer = { text: `The configured AI request failed: ${err.message}\n\nYour evidence is still available below. Please retry or switch to local evidence mode.`, insufficient: false, evidence: chunkEvidence(results) }; }
  } else { const local = evidenceAnswer(results, question); answer = { ...local, evidence: chunkEvidence(results) }; }
  await put('messages', { id: id(), notebookId: currentNotebookId, role: 'assistant', ...answer, createdAt: new Date().toISOString() });
  await render();
}
async function preferences() { return await get('settings', 'preferences') || { id: 'preferences', theme: 'light', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', persistKey: false, savedKey: '' }; }
async function saveProvider() {
  const p = await preferences(); p.provider = $('#provider-kind').value; p.baseUrl = $('#provider-url').value.trim(); p.model = $('#provider-model').value.trim(); p.persistKey = $('#persist-key').checked; p.savedKey = p.persistKey ? providerKey : '';
  try { if (p.baseUrl && new URL(p.baseUrl).protocol !== 'https:' && !/localhost|127\.0\.0\.1/.test(p.baseUrl)) throw new Error('Use HTTPS for a provider URL.'); } catch { say('Enter a valid provider URL.'); return; }
  await put('settings', p); $('#provider-status').textContent = p.model ? `Saved. ${providerKey ? 'Key available for this session.' : 'Add your key to enable AI answers.'}` : 'Saved. Set a model name and API key to enable AI answers.'; $('#provider-key').value = providerKey; say('Provider settings saved on this device.');
}
async function forgetKey() { providerKey = ''; $('#provider-key').value = ''; const p = await preferences(); p.savedKey = ''; p.persistKey = false; await put('settings', p); $('#persist-key').checked = false; $('#provider-status').textContent = 'API key forgotten.'; say('API key removed from this session and local settings.'); }
function download(name, content, mime) { const blob = new Blob([content], { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function exportNotebook() {
  const n = await activeNotebook(); const sources = await notebookSources(); const messages = (await all('messages')).filter(m => m.notebookId === currentNotebookId);
  const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), notebook: n, sources, messages };
  download(`${n.name.replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '') || 'notebook'}.json`, JSON.stringify(backup, null, 2), 'application/json'); say('Notebook JSON backup downloaded. It contains your imported source text.');
}
async function importBackup(file) {
  try {
    if (file.size > 12 * 1024 * 1024) throw new Error('Backup exceeds the 12 MiB import limit.');
    const data = JSON.parse(await file.text());
    const restored = restoreNotebookBackup(data, id());
    await put('notebooks', restored.notebook);
    for (const source of restored.sources) await put('sources', source);
    for (const message of restored.messages) await put('messages', message);
    currentNotebookId = restored.notebook.id; await render(); updateStorage();
    say(`Restored “${restored.notebook.name}” with ${restored.sources.length} sources.`);
  } catch (err) { say(err instanceof SyntaxError ? 'This file is not valid JSON.' : `Could not import backup: ${err.message}`); }
}
async function runStudio(kind) {
  const sources = (await notebookSources()).filter(s => s.selected !== false); if (!sources.length) { say('Select at least one source before making study outputs.'); return; }
  if (kind === 'flashcards') { makeFlashcards(sources); return; }
  const allChunks = sources.flatMap(s => s.chunks.map((chunk, index) => ({ source: s, chunk, index })));
  const selected = allChunks.slice(0, kind === 'csv' ? 300 : 8);
  const output = $('#studio-output');
  const title = kind === 'summary' ? 'Source digest' : kind === 'report' ? 'Printable study report' : kind === 'csv' ? 'Flashcards CSV' : 'Research notes';
  const body = selected.map(x => `<div class="output-line">${esc(x.chunk.text.slice(0, 300))}${x.chunk.text.length > 300 ? '…' : ''}<div class="output-cite">${esc(x.source.name)}${x.chunk.pageStart ? ` · p.${x.chunk.pageStart}` : ''} · lines ${x.chunk.lineStart}–${x.chunk.lineEnd}</div></div>`).join('');
  const markdown = `# ${title}\n\n${selected.map(x => `> ${x.chunk.text.replace(/\n/g, '\n> ')}\n\n— **${x.source.name}**${x.chunk.pageStart ? `, page ${x.chunk.pageStart}` : ''}, lines ${x.chunk.lineStart}–${x.chunk.lineEnd}\n`).join('\n')}`;
  if (kind === 'report') {
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc((await activeNotebook()).name)} — study report</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:850px;margin:3rem auto;padding:0 1.25rem;color:#252722}h1{font-size:2rem}article{border-top:1px solid #ddd;padding:1rem 0;white-space:pre-wrap}small{color:#657a62}@media print{body{margin:0;max-width:none}}</style><h1>${esc((await activeNotebook()).name)} — study report</h1><p>Evidence passages from your local notebook · Generated ${new Date().toLocaleString()}</p>${selected.map((x,i)=>`<article><b>Passage ${i+1}</b><p>${esc(x.chunk.text)}</p><small>${esc(x.source.name)}${x.chunk.pageStart?` · page ${x.chunk.pageStart}`:''} · lines ${x.chunk.lineStart}–${x.chunk.lineEnd} · [S${esc(x.source.id.slice(0,6))}-${x.index+1}]</small></article>`).join('')}<script>window.print=window.print.bind(window)</script></html>`;
    output.className='studio-output output-rich'; output.innerHTML=`<div class="output-title">${title} · ${selected.length} cited passages</div>${body}<button class="button button-quiet output-download" id="download-report">⇩ Download HTML report</button>`;
    $('#download-report').onclick=()=>download('study-report.html',html,'text/html;charset=utf-8'); return;
  }
  if (kind === 'csv') {
    const cell = value => { let safe=String(value).replace(/"/g,'""'); if (/^[=+@-]/.test(safe)) safe=`'${safe}`; return `"${safe}"`; };
    const csv = ['Question,Answer,Source,Page,Lines', ...selected.map(x=>[cell(`What does this passage from ${x.source.name} say?`),cell(x.chunk.text),cell(x.source.name),cell(x.chunk.pageStart||''),cell(`${x.chunk.lineStart}-${x.chunk.lineEnd}`)].join(','))].join('\r\n');
    output.className='studio-output output-rich'; output.innerHTML=`<div class="output-title">${title} · ${selected.length} cards</div><p>Each row contains a source passage, not a model-generated answer.</p><button class="button button-quiet output-download" id="download-csv">⇩ Download CSV</button>`;
    $('#download-csv').onclick=()=>download('sourceforge-flashcards.csv',csv,'text/csv;charset=utf-8'); return;
  }
  output.className = 'studio-output output-rich'; output.innerHTML = `<div class="output-title">${title} · ${selected.length} evidence passages</div>${body}<button class="button button-quiet output-download" id="download-notes">⇩ Download Markdown</button>`;
  $('#download-notes').onclick = () => download(`${title.toLowerCase().replaceAll(' ', '-')}.md`, markdown, 'text/markdown;charset=utf-8');
}
function makeFlashcards(sources) {
  flashcards = sources.flatMap(s => s.chunks.map(c => ({ source: s.name, pageStart: c.pageStart, lineStart: c.lineStart, lineEnd: c.lineEnd, question: `What does this passage from “${s.name}” say?`, answer: c.text }))).slice(0, 30);
  if (!flashcards.length) { say('No passages available to review.'); return; }
  flashIndex = 0; showAnswer = false; drawFlashcard(); $('#flashcard-dialog').showModal();
}
function drawFlashcard() {
  const c = flashcards[flashIndex];
  $('#flashcard-body').innerHTML = `<div class="flashcard" data-flip tabindex="0" role="button" aria-label="Flip flashcard"><small>${showAnswer ? 'ANSWER · SOURCE EVIDENCE' : 'QUESTION · TAP TO REVEAL'}</small><p>${esc(showAnswer ? c.answer : c.question)}</p>${showAnswer ? `<small>${esc(c.source)}${c.pageStart ? ` · p.${c.pageStart}` : ''} · lines ${c.lineStart}–${c.lineEnd}</small>` : ''}</div><div class="flashcard-controls"><button data-prev>← Previous</button><span class="flashcard-count">${flashIndex + 1} / ${flashcards.length}</span><button data-next>Next →</button></div>`;
}
async function jumpToSource(sourceId, line) {
  switchPage('research'); const row = $(`.source-item[data-id="${CSS.escape(sourceId)}"]`);
  if (!row) { say(`Source passage at line ${line} is in this notebook's source list.`); return; }
  const source = await get('sources', sourceId);
  const chunk = source?.chunks.find(c => c.lineStart <= line && c.lineEnd >= line) || source?.chunks[0];
  if (chunk) row.querySelector('.source-preview').textContent = `Lines ${chunk.lineStart}–${chunk.lineEnd}\n${chunk.text}`;
  row.classList.add('expanded'); row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function switchPage(page) {
  document.body.dataset.mobilePage = page;
  $$('.nav-item,.mobile-tab').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $('#page-research').classList.toggle('hidden', page !== 'research' && window.innerWidth > 790);
  $('#page-settings').classList.toggle('hidden', page !== 'settings');
  if (page === 'studio' && window.innerWidth > 790) { $('#page-research').classList.remove('hidden'); document.querySelector('.studio-panel').scrollIntoView({ block: 'nearest' }); }
}
async function clearEverything() {
  if (!confirm('Permanently delete every notebook, imported source, chat message and saved provider setting from this browser? This cannot be undone.')) return;
  await Promise.all(['notebooks','sources','messages','settings'].map(clear)); providerKey = ''; currentNotebookId = null;
  const n = { id: id(), name: 'Research notebook', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await put('notebooks', n); currentNotebookId = n.id; await render(); updateStorage(); say('All local notebook data deleted.');
}
async function updateStorage() {
  if (navigator.storage?.estimate) { const { usage, quota } = await navigator.storage.estimate(); $('#storage-usage').textContent = `Browser storage: ${usage ? `${(usage / 1048576).toFixed(1)} MiB used` : 'less than 1 MiB used'}${quota ? ` of ${(quota / 1048576).toFixed(0)} MiB available` : ''}.`; }
}
function updateNetwork() { const online = navigator.onLine; $('#network-indicator').textContent = online ? '● Online' : '● Offline'; $('#network-indicator').style.color = online ? '#6b8c70' : '#bd795c'; }

init().catch(err => { console.error('SourceForge startup failed:', err.name); document.body.innerHTML = '<main style="padding:3rem;font:14px sans-serif"><h1>Could not open local workspace</h1><p>Browser storage could not be initialized. Check that site storage is available and reload.</p></main>'; });
