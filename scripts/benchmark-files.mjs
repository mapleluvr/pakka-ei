import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { createMxcFileLease } from '../src/index.mjs';
const rounds = Number(process.env.EI_BENCH_ROUNDS ?? 2),
  coldSamples = Number(process.env.EI_BENCH_COLD ?? 60),
  warmSamples = Number(process.env.EI_BENCH_WARM ?? 400);
for (const n of [rounds, coldSamples, warmSamples]) assert.ok(Number.isSafeInteger(n) && n > 0);
const root = await mkdtemp(join(await realpath(tmpdir()), 'ei-file-benchmark-'));
const value = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = {};
for (const file of [
  'index.mjs',
  'mxc/lease.mjs',
  'mxc/facade.mjs',
  'mxc/channel.mjs',
  'mxc/file-worker.mjs',
  'mxc/protocol.mjs',
])
  source[file] = digest(await readFile(new URL('../src/' + file, import.meta.url)));
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  return { n: samples.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1) };
}
async function measured(samples, action) {
  const start = performance.now();
  const result = await action();
  samples.push(performance.now() - start);
  return result;
}
async function quartet(lease, path, content) {
  assert.equal(value(await lease.fileInfo(path)).size, content.length);
  const reader = value(await lease.openBinaryReader(path));
  const bytes = value(await reader.read(0, content.length));
  await reader.close();
  assert.deepEqual(Buffer.from(bytes.base64, 'base64'), content);
}
const results = [];
for (let round = 0; round < rounds; round++) {
  const base = join(root, 'round-' + round),
    cwd = join(base, 'work');
  await mkdir(cwd, { recursive: true });
  const bytes4 = Buffer.alloc(4096, 97),
    bytes64 = Buffer.alloc(65536, 98);
  await writeFile(join(cwd, '4k'), bytes4);
  await writeFile(join(cwd, '64k'), bytes64);
  const samples = { ready: [], first4k: [], read4kQuartet: [], read64kQuartet: [], write4k: [] };
  const options = { cwd, readwritePaths: [cwd] };
  for (let i = 0; i < coldSamples; i++) {
    const started = performance.now();
    const lease = await createMxcFileLease({ ...options, stateDirectory: join(base, 'cold-' + i) });
    samples.ready.push(performance.now() - started);
    try {
      assert.deepEqual(
        Buffer.from(value(await lease.readBinaryFile('4k')).base64, 'base64'),
        bytes4,
      );
      samples.first4k.push(performance.now() - started);
    } finally {
      await lease.cleanup();
    }
  }
  const lease = await createMxcFileLease({ ...options, stateDirectory: join(base, 'warm') });
  try {
    for (let i = 0; i < 8; i++) {
      await quartet(lease, '4k', bytes4);
      await quartet(lease, '64k', bytes64);
    }
    for (let i = 0; i < warmSamples; i++) {
      await measured(samples.read4kQuartet, () => quartet(lease, '4k', bytes4));
      await measured(samples.read64kQuartet, () => quartet(lease, '64k', bytes64));
      const file = 'written-' + i;
      // The request/ACK is measured; host-side byte verification is outside this write timer.
      await measured(samples.write4k, async () =>
        value(await lease.writeFile(file, { base64: bytes4.toString('base64') })),
      );
      assert.deepEqual(await readFile(join(cwd, file)), bytes4);
    }
  } finally {
    await lease.cleanup();
  }
  const result = {
    round,
    samples,
    summary: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, summary(v)])),
  };
  results.push(result);
  console.error(JSON.stringify({ round, summary: result.summary }));
}
console.log(
  JSON.stringify(
    {
      root,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      source,
      results,
    },
    null,
    2,
  ),
);
