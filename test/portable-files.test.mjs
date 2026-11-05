import test from 'node:test';
import assert from 'node:assert/strict';
import { join, relative, isAbsolute } from 'node:path';
import { access } from 'node:fs/promises';
import { createMxcFileLease } from '../src/index.mjs';
import { fixture, value } from './helpers.mjs';

test('empty relative path and empty/Unicode temp names retain usable portable semantics', async (t) => {
  const f = await fixture(),
    lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  assert.equal(value(await lease.absolutePath('')), f.cwd);
  for (const prefix of ['', '任务-', '..']) {
    const path = value(await lease.createTempDir(prefix));
    const tail = relative(join(f.options.stateDirectory, 'data'), path);
    assert.ok(tail && !tail.startsWith('..\\') && !isAbsolute(tail));
    value(await lease.writeFile(join(path, 'content'), 'bytes'));
    await access(join(path, 'content'));
  }
  const file = value(await lease.createTempFile({ prefix: '任务-', suffix: '.数据' }));
  value(await lease.writeFile(file, '文'));
  assert.equal(value(await lease.readTextFile(file)), '文');
  assert.equal((await lease.createTempDir('../escape')).error.code, 'invalid');
  assert.equal((await lease.createTempFile({ suffix: '\\escape' })).error.code, 'invalid');
});
