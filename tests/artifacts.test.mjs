import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { inspectPe, inspectNsis } from '../scripts/verify-artifacts.mjs';

// Synthetic structural fixture, never executed; no release artifact is required.
function fixture() {
  const bytes = Buffer.alloc(1120);
  bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.writeUInt32LE(0x4550, 128);
  bytes.writeUInt16LE(0x14c, 132); bytes.writeUInt16LE(1, 134); bytes.writeUInt16LE(224, 148);
  const optional = 152;
  bytes.writeUInt16LE(0x10b, optional); bytes.writeUInt32LE(0x1000, optional + 16);
  bytes.writeUInt32LE(4096, optional + 32); bytes.writeUInt32LE(512, optional + 36);
  bytes.writeUInt32LE(8192, optional + 56); bytes.writeUInt32LE(512, optional + 60); bytes.writeUInt32LE(16, optional + 92);
  const section = optional + 224;
  bytes.write('.text', section); bytes.writeUInt32LE(512, section + 8); bytes.writeUInt32LE(4096, section + 12);
  bytes.writeUInt32LE(512, section + 16); bytes.writeUInt32LE(512, section + 20); bytes.writeUInt32LE(0x60000020, section + 36);
  Buffer.from('efbeadde4e756c6c736f6674496e7374', 'hex').copy(bytes, 1028);
  bytes.writeUInt32LE(64, 1044); bytes.writeUInt32LE(96, 1048);
  bytes.writeUInt32LE(crc32(bytes.subarray(512, -4)), bytes.length - 4);
  return bytes;
}

test('artifact checker accepts valid PE/NSIS structure and matching CRC', () => {
  const bytes = fixture();
  assert.equal(inspectPe(bytes).machine, 'I386');
  assert.equal(inspectNsis(bytes).archiveEnd, bytes.length);
  assert.equal(inspectNsis(bytes).crc32Matches, true);
});

test('artifact checker rejects truncated and invalid PE boundaries', () => {
  const original = fixture();
  assert.throws(() => inspectPe(original.subarray(0, 800)), /truncated/);
  const pointer = Buffer.from(original); pointer.writeUInt32LE(0xffffffff, 0x3c);
  assert.throws(() => inspectPe(pointer), /out of bounds/);
  const entry = Buffer.from(original); entry.writeUInt32LE(0x5000, 152 + 16);
  assert.throws(() => inspectPe(entry), /Entry point/);
});

test('artifact checker detects changed payload, truncation and appended bytes', () => {
  const original = fixture();
  const modified = Buffer.from(original); modified[1060] ^= 1;
  assert.throws(() => inspectNsis(modified), /CRC-32 mismatch/);
  assert.throws(() => inspectNsis(original.subarray(0, -1)), /truncated/);
  assert.throws(() => inspectNsis(Buffer.concat([original, Buffer.from('extra')])), /Unexpected data after/);
});

test('artifact checker rejects a broken NSIS signature or disabled CRC', () => {
  const signature = fixture(); signature[1030] ^= 1;
  assert.throws(() => inspectNsis(signature), /Missing NSIS signature/);
  const noCrc = fixture(); noCrc.writeUInt32LE(4, 1024);
  assert.throws(() => inspectNsis(noCrc), /CRC is disabled/);
});
