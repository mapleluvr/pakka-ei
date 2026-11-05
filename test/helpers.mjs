import { mkdtemp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

export async function fixture() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'pakka-ei-file-'));
  const cwd = join(root, 'work'),
    readonly = join(root, 'ro'),
    denied = join(root, 'denied');
  await Promise.all([cwd, readonly, denied].map((path) => mkdir(path)));
  await writeFile(join(readonly, 'sentinel'), 'READONLY');
  await writeFile(join(denied, 'secret'), 'DENIED');
  return {
    root,
    cwd,
    readonly,
    denied,
    options: {
      cwd,
      stateDirectory: join(root, 'lease'),
      readwritePaths: [cwd],
      readonlyPaths: [readonly],
      deniedPaths: [denied],
    },
  };
}
export function value(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}
export async function record(f) {
  return JSON.parse(
    await readFile(join(f.options.stateDirectory, 'control', 'record.json'), 'utf8'),
  );
}
