import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createMxcFileLease } from '../src/index.mjs';
import { fixture, record } from './helpers.mjs';

test('startup deadline keeps a non-reusable owner record including the launcher pid', async () => {
  const f = await fixture();
  await assert.rejects(
    createMxcFileLease({ ...f.options, startupTimeoutMs: 1 }),
    /startup deadline/,
  );
  const owner = await record(f);
  assert.equal(owner.state, 'unknown');
  assert.ok(owner.launcherPid > 0);
  await assert.rejects(createMxcFileLease(f.options));
});

test('cancel after launch waits for confirmed cleanup and records closed rather than unknown', async (t) => {
  const f = await fixture(),
    controller = new AbortController();
  const acquired = createMxcFileLease({ ...f.options, signal: controller.signal });
  acquired.catch(() => {});
  t.after(() =>
    acquired.then(
      (lease) => lease.cleanup(),
      () => {},
    ),
  );
  let observed;
  for (let i = 0; i < 400; i++) {
    try {
      observed = await record(f);
      if (observed.launcherPid > 0) break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await setTimeout(5);
  }
  controller.abort();
  assert.ok(observed?.launcherPid > 0, 'launcher identity must be durably recorded during startup');
  await assert.rejects(acquired, { name: 'AbortError' });
  assert.equal((await record(f)).state, 'closed');
});
