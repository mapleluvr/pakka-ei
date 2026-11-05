import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, realpath, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHost, executionFor } from '@pakka/agent';
import { createMxcFileLease } from '@pakka/ei';
import { createHash } from 'node:crypto';

const root = await mkdtemp(join(await realpath(tmpdir()), 'ei-pakka-proof-'));
const cwd = join(root, 'work'),
  dataDir = join(root, 'pakka-data');
await mkdir(cwd);
await mkdir(dataDir);
await writeFile(join(dataDir, 'sentinel'), 'HOST-ONLY-FIXTURE');
const requests = [],
  leases = [];
let escaped, host;
const calls = [
  ['write', { path: 'nested/native.txt', content: 'OLD\r\n保留' }],
  ['edit', { path: 'nested/native.txt', edits: [{ oldText: 'OLD', newText: 'NEW' }] }],
  ['read', { path: 'nested/native.txt', offset: 2, limit: 1 }],
  ['file_probe', {}],
];
const server = createServer((request, response) => {
  (async () => {
    let body = '';
    for await (const part of request) body += part;
    const payload = JSON.parse(body);
    requests.push(payload);
    const i = requests.length,
      call = calls[i - 1];
    const base = {
      id: `proof-${i}`,
      object: 'chat.completion.chunk',
      created: 1,
      model: 'local-model',
    };
    const delta = call
      ? {
          tool_calls: [
            {
              index: 0,
              id: `file${i}`,
              type: 'function',
              function: { name: call[0], arguments: JSON.stringify(call[1]) },
            },
          ],
        }
      : { content: 'FILES-DONE' };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of [
      { ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
      { ...base, choices: [{ index: 0, delta, finish_reason: null }] },
      {
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: call ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      },
    ])
      response.write('data: ' + JSON.stringify(chunk) + '\n\n');
    response.end('data: [DONE]\n\n');
  })().catch((error) => response.destroy(error));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const options = {
  cwd,
  dataDir,
  endpoint: `http://127.0.0.1:${server.address().port}/v1`,
  model: 'local-model',
  apiKey: 'local-only',
  execution: {
    id: 'ei-mxc-files-v1',
    tools: ['write', 'edit', 'read'],
    open: async (target) => {
      const lease = await createMxcFileLease({
        cwd: target.cwd,
        stateDirectory: join(root, `lease-${leases.length}`),
        readwritePaths: [cwd],
        deniedPaths: [dataDir],
      });
      leases.push(lease);
      return lease;
    },
  },
  tools: [
    {
      name: 'file_probe',
      description: 'Exercise invocation-bound file capabilities',
      parameters: { type: 'object', properties: {} },
      execute: async (_args, _signal, scope) => {
        const env = await executionFor(scope);
        escaped = env;
        assert.equal(
          (await env.readTextFile(join(dataDir, 'sentinel'))).error.code,
          'permission_denied',
        );
        assert.equal(
          (
            await env.exec([
              process.execPath,
              '-e',
              "require('node:fs').writeFileSync('not-allowed','bad')",
            ])
          ).error.code,
          'shell_unavailable',
        );
        return 'PROBE-PASSED';
      },
    },
  ],
};
try {
  host = await createHost(options);
  const client = host.connect('operator', ['input.submit']);
  const receipt = await client.submit({ key: 'files', text: 'Use the file tools' });
  await host.waitForIdle();
  assert.equal(await readFile(join(cwd, 'nested/native.txt'), 'utf8'), 'NEW\r\n保留');
  assert.equal(requests.length, 5);
  assert.equal(client.receipt(receipt.id).state, 'committed');
  // Assert the tool response, not NEW/保留 in an earlier assistant tool-call argument.
  const readReply = requests[3].messages.find(
    (message) => message.role === 'tool' && message.tool_call_id === 'file3',
  );
  assert.ok(readReply, JSON.stringify(requests[3]));
  assert.match(JSON.stringify(readReply.content), /保留/);
  const probeReply = requests[4].messages.find(
    (message) => message.role === 'tool' && message.tool_call_id === 'file4',
  );
  assert.match(JSON.stringify(probeReply?.content), /PROBE-PASSED/);
  await assert.rejects(escaped.writeFile('escaped', 'bad'));
  await assert.rejects(access(join(cwd, 'escaped')), { code: 'ENOENT' });
  await assert.rejects(access(join(cwd, 'not-allowed')), { code: 'ENOENT' });
  assert.equal(leases.length, 1);
  assert.equal(leases[0].status().state, 'ready');
  const reopenSessionFile = host.view().sessionFile;
  await host.dispose();
  assert.equal(leases[0].status().state, 'closed');
  host = await createHost({ ...options, reopenSessionFile });
  assert.equal(host.view().phase, 'ready');
  assert.equal(requests.length, 5);
  const source = {};
  const entry = import.meta.resolve('@pakka/ei');
  for (const file of [
    'index.mjs',
    'mxc/lease.mjs',
    'mxc/facade.mjs',
    'mxc/channel.mjs',
    'mxc/file-worker.mjs',
    'mxc/protocol.mjs',
  ])
    source[file] = createHash('sha256')
      .update(await readFile(new URL(file, entry)))
      .digest('hex');
  const proof = {
    root,
    source,
    http: requests.length,
    leases: leases.length,
    file: await readFile(join(cwd, 'nested/native.txt'), 'utf8'),
    reader: '保留',
    permissionDenied: true,
    unavailableExec: true,
    revokedAccess: true,
    cleanup: 'closed',
    reopened: true,
  };
  await writeFile('proof.json', JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await host?.dispose();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
