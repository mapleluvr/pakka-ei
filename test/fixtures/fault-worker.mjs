import { createInterface } from 'node:readline';
import { writeFile, access } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
const [mode, nonce, gate] = process.argv.slice(2);
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
send({ v: 1, ready: true, nonce, pid: process.pid });
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.cancel) continue;
  if (request.method === 'release') {
    send({ v: 1, id: request.id, result: { ok: true } });
    continue;
  }
  if (request.method === 'writeFile') {
    await writeFile(request.args[0], request.args[1]);
    if (mode === 'drop') process.exit(0);
    if (mode === 'delay')
      for (;;) {
        try {
          await access(gate);
          break;
        } catch {
          await setTimeout(5);
        }
      }
  }
  if (mode === 'malformed') process.stdout.write('{bad\n');
  else if (mode === 'foreign')
    send({ v: 1, id: request.id + 99, result: { ok: true, value: 'forged' } });
  else if (mode === 'oversize') process.stdout.write('x'.repeat(64 * 1024 * 1024 + 1) + '\n');
  else send({ v: 1, id: request.id, result: { ok: true } });
}
