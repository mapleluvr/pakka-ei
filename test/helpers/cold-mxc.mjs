import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Independent control: a fresh MXC process executes Node fs directly, without the EI worker/transport.
export async function coldFileOperation(fixture, action, path) {
  const policy = JSON.parse(
    await readFile(join(fixture.options.stateDirectory, 'control/policy.json'), 'utf8'),
  );
  const quote = (value) => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
  const code = `const fs=require('node:fs');try{const value=${action === 'read' ? `fs.readFileSync(${JSON.stringify(path)},'utf8')` : `fs.writeFileSync(${JSON.stringify(path)},'CONTROL')`};process.stdout.write(JSON.stringify({ok:true,value}));}catch(e){process.stdout.write(JSON.stringify({ok:false,code:e.code}));}`;
  policy.containerId += '-control-' + randomUUID();
  policy.process.commandLine = [process.execPath, '-e', code].map(quote).join(' ');
  const config = join(fixture.options.stateDirectory, 'control', 'cold.json');
  await writeFile(config, JSON.stringify(policy));
  const cli = join(
    dirname(fileURLToPath(import.meta.resolve('@microsoft/mxc-sdk/package.json'))),
    'bin/x64/wxc-exec.exe',
  );
  const env = Object.fromEntries(
    policy.process.env.map((value) => {
      const split = value.indexOf('=');
      return [value.slice(0, split), value.slice(split + 1)];
    }),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(cli, ['--config', config], {
      cwd: dirname(config),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        if (code !== 0) throw new Error(err);
        resolve(JSON.parse(out));
      } catch (error) {
        reject(error);
      }
    });
  });
}
