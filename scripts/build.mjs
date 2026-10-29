import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'web'), { recursive: true });
await mkdir(resolve(out, 'assets'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js']) await cp(resolve(root, file), resolve(out, file));
await cp(resolve(root, 'assets/icon.svg'), resolve(out, 'assets/icon.svg'));
await cp(resolve(root, 'docs/THIRD_PARTY.md'), resolve(out, 'THIRD_PARTY.md'));
await build({
  entryPoints: [resolve(root, 'web/app.js')], outfile: resolve(out, 'web/app.js'),
  bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
  minify: true, legalComments: 'eof', sourcemap: false, metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' }
}).then(async result => {
  const worker = resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  await cp(worker, resolve(out, 'web/pdf.worker.mjs'));
  await cp(resolve(root, 'node_modules/pdfjs-dist/standard_fonts'), resolve(out, 'standard_fonts'), { recursive: true });
  await cp(resolve(root, 'node_modules/pdfjs-dist/cmaps'), resolve(out, 'cmaps'), { recursive: true });
  const meta = result.metafile.outputs;
  const bytes = Object.entries(meta).reduce((sum, [path, info]) => sum + (path.endsWith('app.js') ? info.bytes : 0), 0);
  const manifest = { builtAt: new Date().toISOString(), appBundleBytes: bytes, pdfWorkerBytes: (await readFile(resolve(out, 'web/pdf.worker.mjs'))).byteLength };
  await writeFile(resolve(out, 'build-info.json'), JSON.stringify(manifest, null, 2));
  console.log(`Static PWA built at dist/ (bundle ${(bytes / 1048576).toFixed(2)} MiB; PDF worker ${(manifest.pdfWorkerBytes / 1048576).toFixed(2)} MiB).`);
});
