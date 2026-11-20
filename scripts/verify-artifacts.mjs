import { readFile, writeFile, stat, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const hex = value => value.toString(16).padStart(8, '0');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Read-only structural checks, not a Windows loader or malware/authenticity test.
export function inspectPe(bytes) {
  const require = (condition, message) => assert.ok(condition, message);
  require(bytes.length >= 64 && bytes.toString('ascii', 0, 2) === 'MZ', 'Missing/truncated DOS header');
  const peOffset = bytes.readUInt32LE(0x3c);
  require(peOffset >= 64 && peOffset + 24 <= bytes.length, 'PE header pointer is out of bounds');
  require(bytes.readUInt32LE(peOffset) === 0x4550, 'Missing PE signature');
  const machine = bytes.readUInt16LE(peOffset + 4);
  const sectionCount = bytes.readUInt16LE(peOffset + 6);
  const optionalSize = bytes.readUInt16LE(peOffset + 20);
  const optional = peOffset + 24;
  const sectionTable = optional + optionalSize;
  require(sectionCount > 0 && sectionCount <= 96, 'Invalid section count');
  require(optionalSize >= 96 && sectionTable + sectionCount * 40 <= bytes.length, 'Truncated optional header/section table');
  const magic = bytes.readUInt16LE(optional);
  require(magic === 0x10b || magic === 0x20b, 'Unsupported optional-header magic');
  require((machine === 0x14c && magic === 0x10b) || (machine === 0x8664 && magic === 0x20b), 'Machine/PE format mismatch');
  const directoryBase = magic === 0x20b ? 112 : 96;
  require(optionalSize >= directoryBase, 'Truncated data-directory header');
  const directoryCount = bytes.readUInt32LE(optional + directoryBase - 4);
  require(directoryBase + directoryCount * 8 <= optionalSize, 'Data directories exceed the optional header');
  const entryPoint = bytes.readUInt32LE(optional + 16);
  const sectionAlignment = bytes.readUInt32LE(optional + 32);
  const fileAlignment = bytes.readUInt32LE(optional + 36);
  const imageSize = bytes.readUInt32LE(optional + 56);
  const headersSize = bytes.readUInt32LE(optional + 60);
  const powerOfTwo = n => n > 0 && (n & (n - 1)) === 0;
  require(powerOfTwo(fileAlignment) && powerOfTwo(sectionAlignment) && sectionAlignment >= fileAlignment, 'Invalid PE alignments');
  require(headersSize >= sectionTable + sectionCount * 40 && headersSize <= bytes.length && headersSize % fileAlignment === 0, 'Invalid SizeOfHeaders');
  require(imageSize > 0 && imageSize % sectionAlignment === 0, 'Invalid SizeOfImage');
  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const at = sectionTable + i * 40;
    const section = {
      name: bytes.toString('ascii', at, at + 8).replace(/\0.*$/, ''),
      virtualSize: bytes.readUInt32LE(at + 8), rva: bytes.readUInt32LE(at + 12),
      rawSize: bytes.readUInt32LE(at + 16), rawOffset: bytes.readUInt32LE(at + 20),
      executable: !!(bytes.readUInt32LE(at + 36) & 0x20000000),
    };
    require(section.rva % sectionAlignment === 0 && section.rva + Math.max(section.virtualSize, section.rawSize) <= imageSize, 'Section exceeds/misaligns the image');
    if (section.rawSize) {
      require(section.rawOffset >= headersSize && section.rawOffset % fileAlignment === 0 && section.rawSize % fileAlignment === 0, 'Misaligned section raw data');
      require(section.rawOffset + section.rawSize <= bytes.length, 'Section raw data is truncated');
    }
    sections.push(section);
  }
  const raw = sections.filter(section => section.rawSize).sort((a, b) => a.rawOffset - b.rawOffset);
  for (let i = 1; i < raw.length; i++) require(raw[i].rawOffset >= raw[i - 1].rawOffset + raw[i - 1].rawSize, 'Overlapping raw sections');
  const virtual = [...sections].sort((a, b) => a.rva - b.rva);
  for (let i = 1; i < virtual.length; i++) require(virtual[i].rva >= virtual[i - 1].rva + Math.max(virtual[i - 1].virtualSize, virtual[i - 1].rawSize), 'Overlapping virtual sections');
  require(sections.some(section => section.executable && entryPoint >= section.rva && entryPoint < section.rva + section.rawSize), 'Entry point is outside file-backed executable sections');
  let certificateOffset = 0, certificateSize = 0;
  if (directoryCount > 4) {
    certificateOffset = bytes.readUInt32LE(optional + directoryBase + 32);
    certificateSize = bytes.readUInt32LE(optional + directoryBase + 36);
    require((certificateOffset === 0) === (certificateSize === 0), 'Incomplete certificate directory');
    if (certificateSize) require(certificateOffset % 8 === 0 && certificateSize >= 8 && certificateOffset + certificateSize <= bytes.length, 'Certificate table is out of bounds');
  }
  const rawSectionsEnd = Math.max(headersSize, ...sections.map(section => section.rawOffset + section.rawSize));
  return { valid: true, format: magic === 0x20b ? 'PE32+' : 'PE32', machine: machine === 0x8664 ? 'AMD64' : 'I386', peOffset, entryPoint, sectionAlignment, fileAlignment, imageSize, headersSize, sections, rawSectionsEnd, overlayBytes: bytes.length - rawSectionsEnd, certificateOffset, certificateSize };
}

export function inspectNsis(bytes, pe = inspectPe(bytes)) {
  const first = pe.rawSectionsEnd;
  assert.ok(first % 512 === 0 && first + 28 <= bytes.length, 'Missing/alignment-invalid NSIS first header');
  const flags = bytes.readUInt32LE(first);
  assert.ok((flags & ~15) === 0 && !(flags & 1), 'Invalid NSIS flags or unexpected uninstaller');
  assert.equal(bytes.subarray(first + 4, first + 20).toString('hex'), 'efbeadde4e756c6c736f6674496e7374', 'Missing NSIS signature');
  const headerLength = bytes.readUInt32LE(first + 20);
  const archiveBytes = bytes.readUInt32LE(first + 24);
  const end = first + archiveBytes;
  assert.ok(headerLength > 0 && archiveBytes >= 32 && end <= bytes.length, 'Invalid/truncated NSIS archive length');
  assert.equal(end, bytes.length, 'Unexpected data after NSIS archive; not a clean unsigned release');
  assert.ok(!(flags & 4) || !!(flags & 8), 'NSIS CRC is disabled');
  // NSIS non-CRC_ANAL builds skip the first 512 bytes and stop before the CRC.
  // Algorithm/range verified against upstream Source/exehead/fileform.c.
  const expected = bytes.readUInt32LE(end - 4);
  const actual = crc32(bytes.subarray(512, end - 4));
  assert.equal(actual, expected, 'NSIS CRC-32 mismatch');
  return { valid: true, firstHeaderOffset: first, flags, headerLength, archiveBytes, archiveEnd: end, trailingBytes: bytes.length - end, crc32: hex(actual), crc32Matches: true, crcRangeStart: 512, crcRangeEndExclusive: end - 4 };
}

async function load(file) {
  const info = await stat(file);
  assert.ok(info.isFile() && info.size > 0 && info.size <= 512 * 1024 * 1024, 'Expected a nonempty file of at most 512 MiB');
  const bytes = await readFile(file);
  assert.equal(bytes.length, info.size, 'File length changed while reading');
  return { bytes, metadata: { path: file.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes), modifiedAt: info.mtime.toISOString() } };
}

export async function verifyArtifacts({ write = false } = {}) {
  const pairs = [
    ['JARVIS_0.1.0_x64-setup.exe', '.build/target/release/bundle/nsis/JARVIS_0.1.0_x64-setup.exe', 'installer'],
    ['JARVIS.exe', '.build/target/release/jarvis-desktop.exe', 'application'],
    ['THIRD_PARTY_NOTICES.md', 'docs/THIRD_PARTY_NOTICES.md', 'notices'],
  ];
  const report = { at: new Date().toISOString(), scope: 'read-only PE/NSIS integrity and exact local build comparisons; no installer execution', artifacts: [], comparisons: [], limits: ['Structural/CRC checks do not prove malware absence or publisher authenticity.', 'Compressed NSIS members were not independently extracted/decompressed.'] };
  for (const [name, original, kind] of pairs) {
    const packaged = await load(path.join('artifacts', name));
    const built = await load(original);
    assert.ok(packaged.bytes.equals(built.bytes), `${name} differs from original build output`);
    const entry = { ...packaged.metadata };
    if (kind !== 'notices') {
      entry.pe = inspectPe(packaged.bytes);
      assert.equal(entry.pe.certificateSize, 0, 'This checker expects unsigned release artifacts');
      assert.equal(entry.pe.machine, kind === 'installer' ? 'I386' : 'AMD64');
      if (kind === 'installer') entry.nsis = inspectNsis(packaged.bytes, entry.pe);
    }
    report.artifacts.push(entry);
    report.comparisons.push({ packaged: entry.path, original: built.metadata.path, originalBytes: built.metadata.bytes, originalSha256: built.metadata.sha256, byteIdentical: true });
  }
  for (const name of ['dashboard-preview.png', 'dashboard-fullscreen-preview.png']) {
    report.artifacts.push((await load(path.join('artifacts', name))).metadata);
  }
  const manifest = report.artifacts.map(entry => `${entry.sha256}  ${path.basename(entry.path)}`).join('\n') + '\n';
  const reportPath = 'FINAL_VERIFICATION_REPORT.md';
  const startMarker = '<!-- BEGIN VERIFIED ARTIFACTS -->';
  const endMarker = '<!-- END VERIFIED ARTIFACTS -->';
  const document = await readFile(reportPath, 'utf8');
  const start = document.indexOf(startMarker), end = document.indexOf(endMarker);
  assert.ok(start >= 0 && end > start, 'Missing verified-artifact report markers');
  const table = '\n| Artifact | Bytes | SHA-256 |\n|---|---:|---|\n' + report.artifacts.map(entry => `| ${path.basename(entry.path)} | ${entry.bytes.toLocaleString('en-US')} | \`${entry.sha256}\` |`).join('\n') + '\n';
  if (write) {
    await mkdir('docs/verification', { recursive: true });
    // Validate every input and pair before replacing release metadata.
    await writeFile('artifacts/SHA256SUMS.txt.tmp', manifest);
    await rename('artifacts/SHA256SUMS.txt.tmp', 'artifacts/SHA256SUMS.txt');
    await writeFile(reportPath + '.tmp', document.slice(0, start + startMarker.length) + table + document.slice(end));
    await rename(reportPath + '.tmp', reportPath);
    report.manifest = { path: 'artifacts/SHA256SUMS.txt', entries: report.artifacts.length, verified: true, regenerated: true };
    await writeFile('docs/verification/artifact-integrity.json', JSON.stringify(report, null, 2) + '\n');
  } else {
    const existing = await readFile('artifacts/SHA256SUMS.txt', 'utf8');
    const lines = existing.trim().split(/\r?\n/);
    assert.equal(lines.length, report.artifacts.length, 'Manifest must cover all five final artifacts; use --write after validating the release');
    assert.equal(lines.join('\n') + '\n', manifest, 'SHA256SUMS does not match the final artifacts');
    assert.equal(document.slice(start + startMarker.length, end), table, 'Verification report table is stale; use --write after validating the release');
    report.manifest = { path: 'artifacts/SHA256SUMS.txt', entries: report.artifacts.length, verified: true, regenerated: false };
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.ok(process.argv.slice(2).every(arg => arg === '--write'), 'Usage: node scripts/verify-artifacts.mjs [--write]');
    const report = await verifyArtifacts({ write: process.argv.includes('--write') });
    console.log(JSON.stringify({ artifacts: report.artifacts.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), comparisons: report.comparisons, manifest: report.manifest }, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
