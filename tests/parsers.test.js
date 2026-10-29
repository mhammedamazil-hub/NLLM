import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { extractDocx, extractPdf, extractPptx } from '../web/parsers.js';

function fileFrom(name, bytes) {
  const data = Buffer.from(bytes);
  return { name, size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), text: async () => data.toString('utf8') };
}

async function officeFile(name, entries) {
  const zip = new JSZip(); for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return fileFrom(name, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

test('DOCX parser extracts readable paragraph text, strips markup, and reports provenance', async () => {
  const file = await officeFile('notes.docx', {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX evidence paragraph.</w:t></w:r></w:p><w:p><w:r><w:t>Second meaningful line.</w:t></w:r></w:p></w:body></w:document>'
  });
  const result = await extractDocx(file);
  assert.match(result.text, /DOCX evidence paragraph/);
  assert.match(result.text, /Second meaningful line/);
  assert.equal(result.type, 'DOCX');
  assert.equal(result.metadata.parser, 'Mammoth');
});

test('PPTX parser respects slide order, extracts text, and maps slide numbers', async () => {
  const file = await officeFile('deck.pptx', {
    'ppt/presentation.xml': '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>',
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Slide one</a:t></a:r></a:p></p:sld>',
    'ppt/slides/slide2.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>Slide two</a:t></a:r></a:p></p:sld>'
  });
  const result = await extractPptx(file);
  assert.ok(result.text.indexOf('Slide two') < result.text.indexOf('Slide one'));
  assert.deepEqual(result.pageBreaks.map(x => x.page), [1, 2]);
  assert.equal(result.metadata.slideCount, 2);
});

function tinyPdf() {
  const stream = 'BT /F1 18 Tf 72 720 Td (Hello PDF evidence) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i=0;i<objects.length;i++) { offsets.push(Buffer.byteLength(pdf, 'binary')); pdf += `${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf, 'binary'); pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for (let i=1;i<offsets.length;i++) pdf += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

test('PDF parser extracts text and gives actual page references', async () => {
  const result = await extractPdf(fileFrom('paper.pdf', tinyPdf()));
  assert.match(result.text, /Hello PDF evidence/);
  assert.equal(result.metadata.pageCount, 1);
  assert.deepEqual(result.pageBreaks, [{ line: 1, page: 1 }]);
});

test('corrupt Office documents return clear parser errors', async () => {
  await assert.rejects(extractPptx(fileFrom('broken.pptx', Buffer.from('not a zip'))), /PPTX could not be read/);
  await assert.rejects(extractDocx(fileFrom('broken.docx', Buffer.from('not a zip'))), /DOCX could not be read/);
});
