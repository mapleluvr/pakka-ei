import test from 'node:test';
import assert from 'node:assert/strict';
import { link, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMxcFileLease } from '../src/index.mjs';
import { fixture } from './helpers.mjs';
import { coldFileOperation } from './helpers/cold-mxc.mjs';

// This checks cold/warm equivalence, NOT denial of every alias to a protected inode.
// The pinned MXC grants a cross-root hardlink under the approved path; see the guide's security boundary.
test('keeps one-shot MXC path authorization, including the cross-root hardlink limitation', async (t) => {
  const f = await fixture();
  await symlink(f.denied, join(f.cwd, 'deny-junction'), 'junction');
  await symlink(f.readonly, join(f.cwd, 'ro-junction'), 'junction');
  await link(join(f.denied, 'secret'), join(f.cwd, 'deny-hardlink'));
  await link(join(f.readonly, 'sentinel'), join(f.cwd, 'ro-hardlink'));
  const lease = await createMxcFileLease(f.options);
  t.after(() => lease.cleanup());
  const cases = [
    ['read', join(f.denied, 'secret')],
    ['read', 'deny-junction/secret'],
    ['read', 'deny-hardlink'],
    ['write', join(f.readonly, 'sentinel')],
    ['write', 'ro-junction/sentinel'],
    ['write', 'ro-hardlink'],
  ];
  for (const [action, path] of cases) {
    await writeFile(join(f.readonly, 'sentinel'), 'READONLY');
    const cold = await coldFileOperation(f, action, path);
    const coldBytes = await readFile(join(f.readonly, 'sentinel'), 'utf8');
    await writeFile(join(f.readonly, 'sentinel'), 'READONLY');
    const warm =
      action === 'read' ? await lease.readTextFile(path) : await lease.writeFile(path, 'CONTROL');
    assert.equal(warm.ok, cold.ok, path);
    assert.equal(await readFile(join(f.readonly, 'sentinel'), 'utf8'), coldBytes, path);
    if (action === 'read' && cold.ok) assert.equal(warm.value, cold.value, path);
    if (!path.endsWith('hardlink')) {
      assert.equal(cold.ok, false, path);
      assert.equal(warm.error.code, 'permission_denied', path);
    }
    t.diagnostic(JSON.stringify({ action, path, cold, warm }));
  }
});
