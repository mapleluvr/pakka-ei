import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout, setImmediate } from 'node:timers/promises';
import { openChannel } from '../src/mxc/channel.mjs';
import { fixture } from './helpers.mjs';

async function setup(t, mode) {
  const f = await fixture(),
    gate = join(f.root, 'gate');
  const child = spawn(process.execPath, ['test/fixtures/fault-worker.mjs', mode, 'nonce', gate], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  t.after(async () => {
    child.kill();
    await closed;
  });
  const unknown = [];
  const channel = openChannel(child, {
    nonce: 'nonce',
    startupTimeoutMs: 10000,
    requestTimeoutMs: 10000,
    onUnknown: (error) => {
      unknown.push(error);
    },
  });
  await channel.ready;
  return { f, gate, child, channel, unknown };
}
async function waitFile(path) {
  for (let i = 0; i < 1000; i++) {
    try {
      await access(path);
      return;
    } catch {
      await setTimeout(5);
    }
  }
  throw new Error('Controlled effect never occurred');
}

test('lost reply after real write stays unknown and does not replay or admit another effect', async (t) => {
  const { f, channel, unknown } = await setup(t, 'drop');
  const file = join(f.cwd, 'effect');
  const first = await channel.request('writeFile', [file, 'once']);
  assert.equal(first.error.code, 'unknown');
  assert.equal(await readFile(file, 'utf8'), 'once');
  assert.equal((await channel.request('writeFile', [file, 'twice'])).error.code, 'unknown');
  assert.equal(await readFile(file, 'utf8'), 'once');
  assert.equal(unknown.length, 1);
  await assert.rejects(channel.close());
});

test('abort after dispatch waits for acknowledgement and does not cancel a later caller', async (t) => {
  const { f, gate, channel } = await setup(t, 'delay');
  const file = join(f.cwd, 'effect');
  const controller = new AbortController();
  let settled = false;
  const result = channel.request('writeFile', [file, 'completed'], controller.signal).then((r) => {
    settled = true;
    return r;
  });
  await waitFile(file);
  controller.abort();
  await setImmediate();
  assert.equal(settled, false);
  const queued = new AbortController();
  const never = join(f.cwd, 'never');
  const rejected = channel.request('writeFile', [never, 'bad'], queued.signal);
  queued.abort();
  await writeFile(gate, 'continue');
  assert.equal((await result).ok, true);
  assert.equal((await rejected).error.code, 'aborted');
  await assert.rejects(access(never), { code: 'ENOENT' });
  assert.equal((await channel.request('writeFile', [file, 'later'])).ok, true);
  assert.equal(await readFile(file, 'utf8'), 'later');
  await channel.close();
});

for (const mode of ['malformed', 'foreign', 'oversize'])
  test(`${mode} reply poisons the connection instead of matching another operation`, async (t) => {
    const { channel, unknown } = await setup(t, mode);
    assert.equal((await channel.request('readTextFile', ['anything'])).error.code, 'unknown');
    assert.equal((await channel.request('writeFile', ['anything', 'bad'])).error.code, 'unknown');
    assert.equal(unknown.length, 1);
    await assert.rejects(channel.close());
  });
