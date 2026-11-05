import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { openChannel } from './channel.mjs';
import { fileFacade } from './facade.mjs';

const worker = fileURLToPath(new URL('./file-worker.mjs', import.meta.url));
const launcherHash = '090f5d1f7bb93104ab08dcd4e8034ef954aeefcdaf6658dde5f7dff4cfc12f3a';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const within = (root, child) => {
  const r = relative(root.toLowerCase(), child.toLowerCase());
  return !r || (!r.startsWith('..\\') && r !== '..' && !isAbsolute(r));
};
const overlap = (a, b) => within(a, b) || within(b, a);
const quote = (value) => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
function directoryName(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0'))
    throw new Error('An absolute directory is required');
  return resolve(value);
}
async function directory(value) {
  const p = await fs.realpath(directoryName(value));
  if (!(await fs.stat(p)).isDirectory()) throw new Error('Expected directory');
  return p;
}
function timeout(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid deadline');
  return value;
}
// Pure path resolution is separate so drive/share roots can be tested without touching them.
export function stateDirectoryPath(parent, requested) {
  return join(parent, basename(requested));
}
async function atomicRecord(control, record) {
  const temporary = join(control, 'record.tmp');
  const handle = await fs.open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(JSON.stringify(record, null, 2));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, join(control, 'record.json'));
}

/** A file-only owner. It is a partial Pakka ExecutionDriver, without a Pi runtime dependency. */
export async function createMxcFileLease(options) {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('This pinned MXC backend requires Windows x64');
  const signal = options.signal;
  signal?.throwIfAborted();
  // Snapshot trusted bootstrap inputs before the first await. Cwd itself grants nothing.
  const requested = {
    cwd: directoryName(options.cwd),
    stateDirectory: directoryName(options.stateDirectory),
    readwrite: [...(options.readwritePaths ?? [])],
    readonly: [...(options.readonlyPaths ?? [])],
    denied: [...(options.deniedPaths ?? [])],
  };
  const startupTimeoutMs = timeout(options.startupTimeoutMs, 5000),
    requestTimeoutMs = timeout(options.requestTimeoutMs, 30000);
  const node = await fs.realpath(process.execPath),
    codeDirectory = await fs.realpath(dirname(worker));
  const cwd = await directory(requested.cwd);
  const readwrite = await Promise.all(requested.readwrite.map(directory)),
    readonly = await Promise.all(requested.readonly.map(directory)),
    denied = await Promise.all(requested.denied.map(directory));
  const stateDirectory = stateDirectoryPath(
    await directory(dirname(requested.stateDirectory)),
    requested.stateDirectory,
  );
  const control = join(stateDirectory, 'control'),
    data = join(stateDirectory, 'data');
  if (
    ![...readwrite, ...readonly].some((p) => within(p, cwd)) ||
    denied.some((p) => within(p, cwd))
  )
    throw new Error('Cwd is not within an approved readable root');
  for (const rw of readwrite)
    for (const protectedPath of [control, data, codeDirectory, dirname(node), ...readonly]) {
      if (overlap(rw, protectedPath)) throw new Error('Writable and protected roots overlap');
    }
  const sdkPackage = fileURLToPath(import.meta.resolve('@microsoft/mxc-sdk/package.json'));
  const cli = join(dirname(sdkPackage), 'bin', 'x64', 'wxc-exec.exe');
  if (digest(await fs.readFile(cli)) !== launcherHash)
    throw new Error('MXC launcher identity mismatch');
  signal?.throwIfAborted();
  // Exclusive slot acquisition: an old owner, including an unknown one, is never silently reused.
  await fs.mkdir(stateDirectory);
  let channel,
    child,
    recordQueue = Promise.resolve();
  const record = {
    version: 1,
    leaseId: randomUUID(),
    state: 'opening',
    cwd,
    launcherHash,
    hostPid: process.pid,
    createdAt: new Date().toISOString(),
  };
  const mark = (state, fields = {}) => {
    if (record.state === 'unknown' && state !== 'unknown') return recordQueue;
    Object.assign(record, fields, { state });
    const snapshot = { ...record };
    recordQueue = recordQueue.then(() => atomicRecord(control, snapshot));
    // The exclusive non-closed slot is retained even if a later journal write fails.
    recordQueue.catch(() => {});
    return recordQueue;
  };
  let cleanupPromise;
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    const close = channel.close(); // stop admission synchronously, before awaiting any I/O
    cleanupPromise = (async () => {
      try {
        await close;
        await mark('closed');
      } catch (error) {
        await mark('unknown').catch(() => {});
        throw error;
      }
    })();
    return cleanupPromise;
  };
  try {
    await fs.mkdir(control);
    await fs.mkdir(data);
    record.workerHash = digest(await fs.readFile(worker));
    record.protocolHash = digest(await fs.readFile(new URL('./protocol.mjs', import.meta.url)));
    await mark('opening');
    const roots = [...new Set([dirname(node), codeDirectory, ...readonly])];
    const parents = new Set();
    for (const p of [...roots, ...readwrite, ...denied, data])
      for (let parent = dirname(p); ; parent = dirname(parent)) {
        parents.add(parent);
        if (dirname(parent) === parent) break;
      }
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows';
    const env = {
      SYSTEMROOT: systemRoot,
      HOME: data,
      USERPROFILE: data,
      LOCALAPPDATA: data,
      APPDATA: data,
      TEMP: data,
      TMP: data,
      PATH: `${dirname(node)};${systemRoot}\\System32`,
    };
    const policy = {
      version: '1.0.0',
      containerId: 'PakkaEiFile-' + record.leaseId,
      lifecycle: { destroyOnExit: true, preservePolicy: false },
      containment: 'processcontainer',
      filesystem: {
        readonlyPaths: roots,
        readwritePaths: [...readwrite, data],
        deniedPaths: [...denied, control],
      },
      network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
      ui: { disable: false, clipboard: 'none', injection: false },
      processContainer: {
        capabilities: [],
        filesystem: { enumeratePaths: [...parents] },
        ui: {
          isolation: 'container',
          desktopSystemControl: false,
          systemSettings: 'none',
          ime: false,
        },
      },
      telemetry: { enabled: false },
      process: {
        commandLine: [node, worker, data, record.leaseId].map(quote).join(' '),
        cwd,
        env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
        inheritDefaultEnv: false,
        timeout: 0,
      },
    };
    record.policyHash = digest(Buffer.from(JSON.stringify(policy)));
    const config = join(control, 'policy.json');
    await fs.writeFile(config, JSON.stringify(policy), { mode: 0o600 });
    signal?.throwIfAborted();
    // The host-side launcher never starts in an untrusted workspace (DLL/config search paths).
    child = spawn(cli, ['--config', config], {
      cwd: control,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    channel = openChannel(child, {
      nonce: record.leaseId,
      startupTimeoutMs,
      requestTimeoutMs,
      onUnknown: () => {
        mark('unknown').catch(() => {});
      },
    });
    await mark('opening', { launcherPid: child.pid });
    const hello = await channel.ready;
    await mark('ready', { workerPid: hello.pid, launcherPid: child.pid });
    if (channel.state !== 'ready') throw new Error('File service failed during acquisition');
    if (signal?.aborted) {
      await cleanup();
      signal.throwIfAborted();
    }
    return fileFacade(channel, cwd, cleanup, () => ({ ...record }));
  } catch (error) {
    if (channel) await channel.close().catch(() => {});
    await mark(!child || channel?.state === 'closed' ? 'closed' : 'unknown').catch(() => {});
    throw error;
  }
}
