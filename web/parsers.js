import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';

const MAX_CHARS = 200_000;
const MAX_OFFICE_UNCOMPRESSED = 24 * 1024 * 1024;
const XML_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xmlList = nodes => { const items = []; for (let i = 0; i < (nodes?.length || 0); i++) items.push(nodes.item?.(i) ?? nodes[i]); return items; };
const pdfAssetUrl = folder => { const url = new URL(typeof window === 'undefined' ? `../node_modules/pdfjs-dist/${folder}/` : `../${folder}/`, import.meta.url); return typeof window === 'undefined' ? url.pathname : url.toString(); };

function bounded(text, type, pageBreaks = [], metadata = {}) {
  const clean = String(text).replace(/\u0000/g, '').trimEnd();
  if (!clean.trim()) throw new Error(`${type} contains no extractable text.`);
  if (clean.length > MAX_CHARS) throw new Error(`${type} text exceeds the 200,000 character extraction limit.`);
  return { text: clean, type, pageBreaks, metadata };
}

export async function extractPdf(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('PDF exceeds the 8 MiB file limit.');
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, standardFontDataUrl: pdfAssetUrl('standard_fonts'), cMapUrl: pdfAssetUrl('cmaps'), cMapPacked: true });
  let doc;
  try { doc = await task.promise; } catch (err) { throw new Error(/password|encrypt/i.test(err.message) ? 'This PDF is encrypted or password-protected; remove protection before importing.' : `PDF could not be read: ${err.message}`); }
  if (doc.numPages > 500) { await doc.destroy(); throw new Error('PDF exceeds the 500-page extraction limit.'); }
  const parts = [], pageBreaks = []; let line = 1;
  try {
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number); const content = await page.getTextContent();
      let pageText = '', lastY = null;
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const y = item.transform?.[5];
        if (lastY !== null && Number.isFinite(y) && Math.abs(y - lastY) > 2) pageText += '\n';
        else if (pageText && !pageText.endsWith('\n')) pageText += ' ';
        pageText += item.str; if (Number.isFinite(y)) lastY = y;
      }
      pageText = pageText.trim();
      if (!pageText) continue;
      if (parts.length) { parts.push(''); line++; }
      pageBreaks.push({ line, page: number }); parts.push(pageText);
      line += pageText.split('\n').length;
      if (parts.join('\n').length > MAX_CHARS) throw new Error('PDF text exceeds the 200,000 character extraction limit.');
    }
    return bounded(parts.join('\n'), 'PDF', pageBreaks, { pageCount: doc.numPages, extractedPages: pageBreaks.length });
  } finally { await doc.destroy(); }
}

function htmlToReadableText(html) {
  if (typeof globalThis.DOMParser === 'undefined') return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|h[1-6]|li|tr|pre|blockquote|div)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/[ \t]+/g, ' ').trim();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const nodes = [...document.body.querySelectorAll('h1,h2,h3,h4,p,li,tr,pre,blockquote')];
  const lines = nodes.map(node => node.tagName === 'TR' ? [...node.querySelectorAll('th,td')].map(c => c.textContent.trim()).join(' | ') : node.textContent.trim()).filter(Boolean);
  return lines.length ? lines.join('\n') : document.body.textContent.trim();
}

export async function extractDocx(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('DOCX exceeds the 8 MiB file limit.');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const input = typeof window === 'undefined' && typeof Buffer !== 'undefined' ? { buffer: Buffer.from(arrayBuffer) } : { arrayBuffer };
    const result = await mammoth.convertToHtml(input);
    const warnings = result.messages.filter(m => m.type === 'warning').length;
    return bounded(htmlToReadableText(result.value), 'DOCX', [], { warnings, parser: 'Mammoth' });
  } catch (err) { throw new Error(`DOCX could not be read (corrupt, encrypted, or unsupported): ${err.message}`); }
}

function xmlDoc(text, label) {
  let parseError = false;
  const Parser = globalThis.DOMParser || XmlDOMParser;
  const parser = Parser === XmlDOMParser ? new Parser({ onError: () => { parseError = true; } }) : new Parser();
  const doc = parser.parseFromString(text, 'application/xml');
  if (parseError || doc.getElementsByTagName('parsererror').length) throw new Error(`Malformed XML in ${label}.`);
  return doc;
}

export async function extractPptx(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('PPTX exceeds the 8 MiB file limit.');
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: true });
    const entries = Object.values(zip.files).filter(x => !x.dir);
    if (entries.length > 2000 || entries.reduce((n, x) => n + (x._data?.uncompressedSize || 0), 0) > MAX_OFFICE_UNCOMPRESSED) throw new Error('Presentation archive expands beyond the 24 MiB safety budget.');
    const presEntry = zip.file('ppt/presentation.xml');
    if (!presEntry) throw new Error('Presentation is missing ppt/presentation.xml.');
    const pres = xmlDoc(await presEntry.async('string'), 'presentation');
    const relEntry = zip.file('ppt/_rels/presentation.xml.rels');
    const rels = relEntry ? xmlDoc(await relEntry.async('string'), 'presentation relationships') : null;
    const relMap = new Map(xmlList(rels?.getElementsByTagName('Relationship')).map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
    const ids = xmlList(pres.getElementsByTagNameNS('*', 'sldId'));
    const ordered = ids.map((node, i) => {
      const relId = node.getAttributeNS(XML_REL_NS, 'id') || node.getAttribute('r:id');
      const target = relMap.get(relId);
      return target ? `ppt/${target.replace(/^\.\.\//, '')}` : `ppt/slides/slide${i + 1}.xml`;
    });
    const files = ordered.length ? ordered : entries.map(e => e.name).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    if (!files.length || files.length > 300) throw new Error('Presentation has no readable slides or exceeds the 300-slide limit.');
    const parts = [], pageBreaks = []; let line = 1;
    for (let i = 0; i < files.length; i++) {
      const entry = zip.file(files[i]); if (!entry) continue;
      const doc = xmlDoc(await entry.async('string'), `slide ${i + 1}`);
      const paragraphs = xmlList(doc.getElementsByTagNameNS('*', 'p')).map(p => xmlList(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('').trim()).filter(Boolean);
      const slideText = paragraphs.join('\n'); if (!slideText) continue;
      if (parts.length) { parts.push(''); line++; }
      pageBreaks.push({ line, page: i + 1 }); parts.push(slideText); line += slideText.split('\n').length;
      if (parts.join('\n').length > MAX_CHARS) throw new Error('Slide text exceeds the 200,000 character extraction limit.');
    }
    return bounded(parts.join('\n'), 'PPTX', pageBreaks, { slideCount: files.length, extractedSlides: pageBreaks.length });
  } catch (err) { throw new Error(`PPTX could not be read: ${err.message}`); }
}

export async function extractHtml(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('HTML exceeds the 8 MiB file limit.');
  return bounded(htmlToReadableText(await file.text()), 'HTML');
}

export async function extractDocument(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return extractPdf(file);
  if (ext === 'docx') return extractDocx(file);
  if (ext === 'pptx') return extractPptx(file);
  if (['html', 'htm'].includes(ext)) return extractHtml(file);
  return { text: await file.text(), type: 'file', pageBreaks: [], metadata: {} };
}
