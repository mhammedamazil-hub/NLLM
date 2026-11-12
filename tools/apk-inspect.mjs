#!/usr/bin/env node
/**
 * apk-inspect — APK bundle inspector for research.
 * Extracts and summarizes APK contents without requiring 7z/apktool.
 *
 * Usage:
 *   node tools/apk-inspect.mjs info <apk-or-bundle>
 *   node tools/apk-inspect.mjs list <apk-or-bundle>
 *   node tools/apk-inspect.mjs manifest <apk-or-bundle>
 *   node tools/apk-inspect.mjs assets <apk-or-bundle>
 *   node tools/apk-inspect.mjs lottie <apk-or-bundle>
 *   node tools/apk-inspect.mjs extract <apk-or-bundle> <output-dir>
 *   node tools/apk-inspect.mjs strings <apk-or-bundle> [pattern]
 *
 * Supports: APKM bundles (containing split APKs) and plain APKs.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, '..', 'apps', 'web', 'package.json'));

// ---- Zip reading via Node's zlib (minimal zip parser) ----
// Actually, let's use the built-in approach: Node has no zip reader,
// but we can use the `unzip` command or parse the zip format manually.
// For simplicity, we'll use a minimal approach: check if `unzip` is available.

import { execSync } from 'node:child_process';

function isZip(buf) {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

function is7z(buf) {
  return buf.length > 6 && buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf && buf[4] === 0x27 && buf[5] === 0x1c;
}

// ---- CLI dispatch ----
const args = process.argv.slice(2);
const cmd = args[0];
const target = args[1];

if (!target || !existsSync(target)) {
  console.error('Usage: node tools/apk-inspect.mjs <command> <apk-file> [args]');
  console.error('Commands: info, list, manifest, assets, lottie, extract, strings, help');
  process.exit(1);
}

const buf = readFileSync(target);
const stat = statSync(target);

// ---- Parse APKM or APK ----
// APKM is a 7z archive. We need py7zr or 7z to extract it first.
// Check if it's an APKM (7z) or APK (zip)

if (is7z(buf)) {
  console.log(`Detected APKM bundle: ${target}`);
  console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Use 'node tools/apk-inspect.mjs extract ${target} <output-dir>' to unpack split APKs`);
  // Try to extract using Python py7zr if available
  try {
    execSync(`python3 -c "import py7zr; print('py7zr available')"`, { stdio: 'pipe' });
    console.log('py7zr is available — extraction possible');
  } catch {
    console.log('py7zr not available — install with: pip install py7zr');
  }
  process.exit(0);
}

if (!isZip(buf)) {
  console.error(`Not a valid APK or APKM file: ${target}`);
  process.exit(1);
}

// ---- It's a plain APK (zip) — parse it ----
console.log(`Detected APK: ${target}`);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

// Use `unzip -l` to list contents
function listZip(zipFile) {
  const out = execSync(`unzip -l "${zipFile}"`, { encoding: 'utf-8' });
  return out;
}

function extractZip(zipFile, outDir) {
  mkdirSync(outDir, { recursive: true });
  execSync(`unzip -o "${zipFile}" -d "${outDir}"`, { stdio: 'pipe' });
}

function readZipEntry(zipFile, entryName) {
  const out = execSync(`unzip -p "${zipFile}" "${entryName}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  return out;
}

// ---- Commands ----
switch (cmd) {
  case 'info': {
    const list = listZip(target);
    const lines = list.split('\n');
    // Find total file count
    const totalLine = lines.find(l => /Files.*\d+ files/.test(l));
    console.log(`Files: ${totalLine || 'unknown'}`);
    // Show top-level structure
    const entries = lines.filter(l => l.trim() && !l.startsWith('Archive:') && !l.startsWith('Length') && !l.startsWith('----') && !l.includes('files'))
      .map(l => l.split(/\s+/).pop())
      .filter(Boolean);
    const tops = [...new Set(entries.map(e => e.split('/')[0]))].sort();
    console.log('Top-level:', tops.join(', '));
    // Check for DEX files
    const dexCount = entries.filter(e => e.endsWith('.dex')).length;
    console.log(`DEX files: ${dexCount}`);
    // Check for native libs
    const soCount = entries.filter(e => e.endsWith('.so')).length;
    console.log(`Native libs (.so): ${soCount}`);
    // Check for assets
    const assetCount = entries.filter(e => e.startsWith('assets/')).length;
    console.log(`Asset files: ${assetCount}`);
    break;
  }
  case 'list': {
    console.log(listZip(target));
    break;
  }
  case 'manifest': {
    // AndroidManifest.xml is binary AXML; try to extract strings
    try {
      const raw = execSync(`unzip -p "${target}" AndroidManifest.xml`, { encoding: 'binary' });
      // Extract readable strings from AXML
      const text = raw.toString('utf-8', 'replace');
      // Show printable strings (filter for ASCII)
      const strings = text.match(/[\x20-\x7e]{4,}/g) || [];
      // Filter for manifest-relevant strings
      const relevant = strings.filter(s =>
        s.includes('android:') || s.includes('com.') || s.includes('.') ||
        s.includes('intent') || s.includes('action') || s.includes('category') ||
        s.includes('provider') || s.includes('service') || s.includes('receiver') ||
        s.includes('permission') || s.includes('minSdk') || s.includes('targetSdk') ||
        s.includes('version') || s.includes('package') || s.includes('label')
      );
      console.log(relevant.slice(0, 100).join('\n'));
    } catch {
      console.error('Could not read AndroidManifest.xml');
    }
    break;
  }
  case 'assets': {
    const list = listZip(target);
    const lines = list.split('\n');
    const assets = lines.filter(l => l.includes('assets/'))
      .map(l => l.split(/\s+/).pop())
      .filter(Boolean);
    console.log(`${assets.length} asset files:`);
    for (const a of assets.sort()) {
      console.log(`  ${a}`);
    }
    break;
  }
  case 'lottie': {
    const list = listZip(target);
    const lines = list.split('\n');
    const lottie = lines.filter(l => l.includes('lottie/'))
      .map(l => l.split(/\s+/).pop())
      .filter(Boolean);
    console.log(`${lottie.length} Lottie animation files:`);
    for (const l of lottie.sort()) {
      // Extract artifact type from filename
      const match = l.match(/lottie\/(.+)\.json$/);
      const name = match ? match[1].replace(/_(dark|light)_2x$/, '').replace(/_(dark|light)$/, '') : l;
      console.log(`  ${name}`);
    }
    break;
  }
  case 'extract': {
    const outDir = args[2];
    if (!outDir) { console.error('Usage: extract <apk> <output-dir>'); process.exit(1); }
    extractZip(target, outDir);
    console.log(`Extracted to ${outDir}`);
    const files = readdirSync(outDir);
    console.log(`${files.length} files extracted`);
    break;
  }
  case 'strings': {
    const pattern = args[2] || '';
    // Extract strings from the entire APK (DEX files)
    const list = listZip(target);
    const dexFiles = list.split('\n')
      .filter(l => l.endsWith('.dex'))
      .map(l => l.split(/\s+/).pop())
      .filter(Boolean);
    console.log(`Searching ${dexFiles.length} DEX files for: "${pattern}"`);
    for (const dex of dexFiles) {
      try {
        const raw = execSync(`unzip -p "${target}" "${dex}"`, { encoding: 'binary', maxBuffer: 50 * 1024 * 1024 });
        const text = raw.toString('utf-8', 'replace');
        const strings = text.match(/[\x20-\x7e]{6,}/g) || [];
        const matches = pattern ? strings.filter(s => s.toLowerCase().includes(pattern.toLowerCase())) : strings;
        if (matches.length) {
          console.log(`\n--- ${dex} (${matches.length} strings) ---`);
          for (const m of matches.slice(0, 50)) {
            console.log(`  ${m}`);
          }
        }
      } catch {
        // skip
      }
    }
    break;
  }
  case 'help':
  default: {
    console.log(`apk-inspect — APK bundle inspector

Usage:
  node tools/apk-inspect.mjs <command> <apk-file> [args]

Commands:
  info <apk>              Show summary (file count, DEX, libs, assets)
  list <apk>              List all files in APK
  manifest <apk>          Extract AndroidManifest strings
  assets <apk>            List asset files
  lottie <apk>            List Lottie animation files (artifact types)
  extract <apk> <dir>     Extract APK to directory
  strings <apk> [pattern] Extract DEX strings, filter by pattern
  help                    Show this message

Supports:
  - APKM bundles (7z archives containing split APKs)
  - Plain APK files (zip archives)
`);
    break;
  }
}
