// Small dependency-free browser core. Keep behavior deterministic and covered by node:test.
export const MAX_SOURCE_CHARS = 200_000;
export const MAX_CHUNK_CHARS = 900;
export const MIN_EVIDENCE_SCORE = 0.16;

export function normalizeText(text) {
  return String(text).replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trimEnd();
}

export function chunkText(text, maxChars = MAX_CHUNK_CHARS) {
  const lines = normalizeText(text).split("\n");
  const chunks = [];
  let body = [], start = 1, end = 1, length = 0;
  const flush = () => {
    const content = body.join("\n").trim();
    if (content) chunks.push({ text: content, lineStart: start, lineEnd: end });
    body = []; length = 0;
  };
  lines.forEach((line, index) => {
    const n = index + 1;
    if (!line.trim() && body.every(part => !part.trim())) return;
    if (line.length > maxChars) {
      flush();
      for (let i = 0; i < line.length; i += maxChars) chunks.push({ text: line.slice(i, i + maxChars), lineStart: n, lineEnd: n });
      start = n + 1; end = n + 1;
      return;
    }
    if (length + line.length + 1 > maxChars) flush();
    if (!body.length) start = n;
    body.push(line); end = n; length += line.length + 1;
  });
  flush();
  return chunks;
}

const terms = (s) => (String(s).toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);

export function contextualizeQuery(question, history = []) {
  const previousQuestion = [...history].reverse().find(m => m.role === 'user')?.text?.trim();
  const followUp = terms(question).length < 4 || /\b(it|they|them|this|that|these|those|its|their|above|same|more|why|how so)\b/i.test(question);
  return previousQuestion && followUp ? `${previousQuestion} ${question}` : question;
}

export function retrieve(sources, query, { limit = 5, selectedIds = null } = {}) {
  const q = terms(query);
  if (!q.length) return [];
  const candidates = sources.filter(s => s.status === "ready" && s.selected !== false && (!selectedIds || selectedIds.includes(s.id)))
    .flatMap(s => (s.chunks || []).map((c, index) => ({ source: s, chunk: c, index })));
  const df = new Map(q.map(t => [t, candidates.filter(x => terms(x.chunk.text).includes(t)).length]));
  const unique = [...new Set(q)];
  const phrase = String(query).trim().toLocaleLowerCase();
  return candidates.map(item => {
    const words = terms(item.chunk.text);
    const counts = new Map();
    words.forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
    const lexical = unique.reduce((sum, t) => {
      const tf = counts.get(t) || 0;
      const idf = Math.log(1 + (candidates.length - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      return sum + (tf ? idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * words.length / 120)) : 0);
    }, 0);
    const title = terms(item.source.name).filter(t => unique.includes(t)).length;
    const phraseBoost = item.chunk.text.toLocaleLowerCase().includes(phrase) ? 1.5 : 0;
    const score = lexical + title * 0.5 + phraseBoost;
    return { ...item, score, ref: `S${item.source.id.slice(0, 6)}-${item.index + 1}` };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id) || a.index - b.index).slice(0, limit);
}

export function hasSufficientEvidence(results) {
  return results.length > 0 && results[0].score >= MIN_EVIDENCE_SCORE;
}

export function evidenceAnswer(results, question) {
  if (!hasSufficientEvidence(results)) return { insufficient: true, text: "I couldn't find enough evidence in this notebook to answer that. Add a relevant source or ask a narrower question." };
  const bullets = results.slice(0, 3).map(x => `“${x.chunk.text.slice(0, 420)}${x.chunk.text.length > 420 ? "…" : ""}” [${x.ref}]`);
  return { insufficient: false, text: `Evidence I found for “${question}”:\n\n${bullets.join("\n\n")}` };
}

export function validateImport(name, text, sizeBytes = new Blob([text]).size) {
  const ext = String(name).split(".").pop().toLowerCase();
  const allowed = new Set(["txt", "md", "markdown", "csv", "json", "js", "ts", "tsx", "jsx", "rs", "py", "go", "java", "html", "htm", "pdf", "docx", "pptx", "css", "xml", "yaml", "yml", "toml", "sh", "sql", "log", "vtt", "srt"]);
  if (!allowed.has(ext)) throw new Error(`.${ext || "(no extension)"} is not supported yet. Import text, Markdown, CSV, JSON, code, VTT or SRT.`);
  if (sizeBytes > 8 * 1024 * 1024) throw new Error("File exceeds the 8 MiB import limit.");
  const normalized = normalizeText(text);
  if (!normalized.trim()) throw new Error("This file contains no readable text.");
  if (normalized.length > MAX_SOURCE_CHARS) throw new Error("Text exceeds the 200,000 character per-source limit.");
  return normalized;
}

export function makeSource({ id, name, text, type = "file", origin = "local file", url = "", importedAt = new Date().toISOString(), pageBreaks = [], metadata = {} }) {
  const content = validateImport(name || "source.txt", text);
  const boundaries = Array.isArray(pageBreaks) ? pageBreaks.filter(p => Number.isInteger(p?.line) && p.line > 0 && Number.isInteger(p?.page) && p.page > 0).sort((a, b) => a.line - b.line) : [];
  const chunks = chunkText(content).map(chunk => {
    if (!boundaries.length) return chunk;
    const pageAt = line => boundaries.filter(p => p.line <= line).at(-1)?.page;
    return { ...chunk, pageStart: pageAt(chunk.lineStart), pageEnd: pageAt(chunk.lineEnd) };
  });
  return { id, name: name || "Untitled source", type, origin, url, importedAt, status: "ready", error: null, charCount: content.length, content, chunks, pageBreaks: boundaries, metadata: metadata && typeof metadata === 'object' ? metadata : {} };
}

export function parseGitHubRepository(input) {
  let url;
  try { url = new URL(input.includes("://") ? input : input.startsWith("github.com/") ? `https://${input}` : `https://github.com/${input}`); }
  catch { throw new Error("Enter a valid public GitHub repository URL."); }
  if (url.hostname !== "github.com") throw new Error("Use a github.com repository URL.");
  const parts = url.pathname.split("/").filter(Boolean);
  const owner = parts[0], repo = parts[1]?.replace(/\.git$/, "");
  if (!owner || !repo) throw new Error("URL must include an owner and repository name.");
  const mode = parts[2];
  const ref = ["tree", "blob", "commit"].includes(mode) ? (parts[3] || "HEAD") : "HEAD";
  const path = ["tree", "blob"].includes(mode) ? parts.slice(4).join("/") : "";
  return { owner, repo, ref, path, mode: mode === 'tree' ? 'directory' : mode === 'blob' ? 'file' : 'repository' };
}
