import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMxcFileLease } from '../src/index.mjs';
import { fixture, value, record } from './helpers.mjs';

// A per-operation process/reopen would lose this actual open object.
test('one lease keeps the opened file across pathname replacement and metadata calls', async (t) => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  const path = join(f.cwd, 'original');
  await writeFile(path, 'old-object');
  const reader = value(await lease.openBinaryReader(path));
  await rename(path, path + '.moved');
  await writeFile(path, 'replacement');
  assert.equal(
    Buffer.from(value(await reader.read(0, 50)).base64, 'base64').toString(),
    'old-object',
  );
  assert.equal(value(await reader.info()).size, 10);
  assert.equal(value(await lease.readTextFile(path)), 'replacement');
  await reader.close();
  await reader.close();
  assert.equal((await reader.read(0, 1)).error.code, 'invalid');
});

// Removing actual I/O or replacing calls with cached content must fail.
test('repeated file operations and two leases observe current bytes, not cached file data', async (t) => {
  const f = await fixture();
  const a = await createMxcFileLease(f.options);
  t.after(() => a.cleanup());
  const b = await createMxcFileLease({ ...f.options, stateDirectory: join(f.root, 'other-lease') });
  t.after(() => b.cleanup());
  value(await a.writeFile('nested/file', 'first'));
  value(await b.appendFile('nested/file', '二'));
  assert.equal(value(await a.readTextFile('nested/file')), 'first二');
  value(await a.flushFile('nested/file'));
  value(await a.renameFile('nested/file', 'nested/renamed'));
  assert.equal(value(await b.exists('nested/file')), false);
  assert.equal(await readFile(join(f.cwd, 'nested/renamed'), 'utf8'), 'first二');
  assert.equal(Object.isFrozen(a), true);
});

// Native fallback or missing MXC policy grants exposes the denied sentinel.
test('same persistent worker enforces RW, RO and deny rules', async (t) => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  assert.equal(value(await lease.readTextFile(join(f.readonly, 'sentinel'))), 'READONLY');
  assert.equal(
    (await lease.writeFile(join(f.readonly, 'sentinel'), 'BROKEN')).error.code,
    'permission_denied',
  );
  assert.equal(
    (await lease.readTextFile(join(f.denied, 'secret'))).error.code,
    'permission_denied',
  );
  assert.equal(await readFile(join(f.readonly, 'sentinel'), 'utf8'), 'READONLY');
  value(await lease.writeFile('ok', 'OK'));
  assert.equal(await readFile(join(f.cwd, 'ok'), 'utf8'), 'OK');
});

// Counting raw bytes, dropping CR, or stripping every BOM breaks these literals.
test('binary scanner preserves line selection, BOM and malformed UTF-8 semantics', async (t) => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  await writeFile(join(f.cwd, 'lines'), 'é\r\n中文\nz');
  const r = value(await lease.openBinaryReader('lines'));
  assert.deepEqual(value(await r.scanLines({ startLine: 1, endLine: 2 })), {
    newlines: 2,
    start: 4,
    end: 10,
    firstLineEnd: 10,
    lastLineStart: 4,
    selectedBytes: 6,
    firstLineBytes: 6,
  });
  await writeFile(join(f.cwd, 'bom'), Buffer.from([239, 187, 191, 97, 10, 255, 10]));
  const b = value(await lease.openBinaryReader('bom'));
  assert.deepEqual(value(await b.scanLines({ startLine: 0 })), {
    newlines: 2,
    start: 0,
    end: 7,
    firstLineEnd: 4,
    lastLineStart: 7,
    selectedBytes: 6,
    firstLineBytes: 1,
  });
  await r.close();
  await b.close();
});

// Releasing each call would delete this file; returning before drain loses writes.
test('temp data survives operations, cleanup drains admitted work and closes the owner', async () => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  const temp = value(await lease.createTempFile({ prefix: 'out-', suffix: '.txt' }));
  value(await lease.writeFile(temp, 'temporary'));
  assert.equal(value(await lease.readTextFile(temp)), 'temporary');
  const { launcherPid, workerPid } = lease.status();
  for (const pid of [launcherPid, workerPid]) process.kill(pid, 0);
  const writes = Array.from({ length: 12 }, (_, i) => lease.appendFile('sequence', `${i},`));
  const cleanup = lease.cleanup();
  assert.equal((await lease.writeFile('too-late', 'x')).error.code, 'invalid');
  (await Promise.all(writes)).forEach(value);
  await cleanup;
  await lease.cleanup();
  for (const pid of [launcherPid, workerPid])
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(await readFile(join(f.cwd, 'sequence'), 'utf8'), '0,1,2,3,4,5,6,7,8,9,10,11,');
  await assert.rejects(access(temp), { code: 'ENOENT' });
  await assert.rejects(access(join(f.cwd, 'too-late')), { code: 'ENOENT' });
  assert.equal((await record(f)).state, 'closed');
});

// An already cancelled call must not dispatch a write or destroy the shared service.
test('pre-cancelled operation leaves no file and other operations keep working', async (t) => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  const signal = AbortSignal.abort();
  assert.equal((await lease.writeFile('cancelled', 'bad', signal)).error.code, 'aborted');
  await assert.rejects(access(join(f.cwd, 'cancelled')), { code: 'ENOENT' });
  value(await lease.writeFile('after', 'alive'));
  assert.equal(value(await lease.readTextFile('after')), 'alive');
});

// Reusing a slot would hide a previous uncertain execution owner.
test('an existing owner slot and overlapping control/work permissions fail before launch', async (t) => {
  const f = await fixture();
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  await assert.rejects(createMxcFileLease(f.options));
  await assert.rejects(
    createMxcFileLease({
      ...f.options,
      stateDirectory: join(f.root, 'unsafe'),
      readwritePaths: [f.root],
    }),
  );
});
