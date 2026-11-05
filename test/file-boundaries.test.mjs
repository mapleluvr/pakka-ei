import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMxcFileLease } from '../src/index.mjs';
import { fixture, value, record } from './helpers.mjs';

test('omitted temp options have the same lifetime and successful defaults', async (t) => {
  const f = await fixture(),
    lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  const directory = value(await lease.createTempDir());
  const file = value(await lease.createTempFile());
  value(await lease.writeFile(join(directory, 'item'), 'dir'));
  value(await lease.writeFile(file, 'file'));
  assert.equal(value(await lease.readTextFile(file)), 'file');
});

test('reader close after successful owner cleanup is idempotent', async () => {
  const f = await fixture(),
    lease = await createMxcFileLease(f.options);
  value(await lease.writeFile('file', 'bytes'));
  const reader = value(await lease.openBinaryReader('file'));
  await lease.cleanup();
  await reader.close();
  await reader.close();
  assert.equal((await reader.read(0, 1)).error.code, 'invalid');
});

test('readBinaryFile and positional read cross a frame boundary without truncation or reopen', async (t) => {
  const f = await fixture(),
    lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  const content = Buffer.alloc(33 * 1024 * 1024, 97);
  content[content.length - 1] = 122;
  Buffer.from('文').copy(content, 4 * 1024 * 1024 - 1); // Split one UTF-8 character across frames.
  await writeFile(join(f.cwd, 'large'), content);
  assert.deepEqual(
    Buffer.from(value(await lease.readBinaryFile('large')).base64, 'base64'),
    content,
  );
  assert.equal(value(await lease.readTextFile('large')), content.toString('utf8'));
  const reader = value(await lease.openBinaryReader('large'));
  assert.deepEqual(
    Buffer.from(value(await reader.read(0, content.length)).base64, 'base64'),
    content,
  );
  await reader.close();
});

test('a large write is not rejected by framing and cleanup waits for the entire operation', async () => {
  const f = await fixture(),
    lease = await createMxcFileLease(f.options);
  const content = '大'.repeat(23 * 1024 * 1024); // 69 MiB of UTF-8, above one protocol frame.
  const writing = lease.writeFile('large', content);
  const closing = lease.cleanup();
  const [written, closed] = await Promise.allSettled([writing, closing]);
  assert.equal(written.status, 'fulfilled');
  value(written.value);
  assert.equal(closed.status, 'fulfilled');
  assert.equal(await readFile(join(f.cwd, 'large'), 'utf8'), content);
});

test('worker death poisons only its lease, preserves unknown evidence and never respawns it', async (t) => {
  const f = await fixture(),
    a = await createMxcFileLease(f.options);
  const b = await createMxcFileLease({ ...f.options, stateDirectory: join(f.root, 'other') });
  t.after(() => b.cleanup());
  const temp = value(await a.createTempFile({ prefix: 'evidence-' }));
  value(await a.writeFile(temp, 'keep'));
  process.kill(a.status().workerPid);
  assert.equal((await a.writeFile('after-death', 'bad')).error.code, 'unknown');
  await assert.rejects(a.cleanup());
  assert.equal((await record(f)).state, 'unknown');
  assert.equal(await readFile(temp, 'utf8'), 'keep');
  await assert.rejects(access(join(f.cwd, 'after-death')), { code: 'ENOENT' });
  value(await b.writeFile('other', 'alive'));
  assert.equal(value(await b.readTextFile('other')), 'alive');
  await assert.rejects(createMxcFileLease(f.options));
});
