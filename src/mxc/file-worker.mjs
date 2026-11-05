import * as fs from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { encode, frames, VERSION, ok, failure, isBase64 } from './protocol.mjs';

const [dataDirectory, nonce] = process.argv.slice(2);
const handles = new Map(),
  active = new Map();
let tail = Promise.resolve(),
  output = Promise.resolve();
function send(value) {
  output = output.then(async () => {
    if (!process.stdout.write(encode(value))) await once(process.stdout, 'drain');
  });
  return output;
}
function invalid(message) {
  return Object.assign(new Error(message), { code: 'EINVAL' });
}
function path(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw invalid('Invalid file path');
  return resolve(value);
}
function tempName(value) {
  return typeof value === 'string' && !/[<>:"/\\|?*\x00-\x1f]/.test(value);
}
function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw invalid('Expected a nonnegative safe integer');
  return value;
}
function bytes(value) {
  if (typeof value === 'string') return value;
  if (!isBase64(value?.base64)) throw invalid('Invalid base64');
  return Buffer.from(value.base64, 'base64');
}
function info(p, stat) {
  const kind = stat.isFile()
    ? 'file'
    : stat.isDirectory()
      ? 'directory'
      : stat.isSymbolicLink()
        ? 'symlink'
        : undefined;
  if (!kind) throw invalid('Unsupported file kind');
  return { name: basename(p), path: p, kind, size: stat.size, mtimeMs: stat.mtimeMs };
}
function handle(id) {
  const entry = handles.get(id);
  if (!entry) throw invalid('Reader is closed or foreign');
  return entry;
}
function cancelled(signal) {
  if (signal.aborted) throw Object.assign(new Error('Operation cancelled'), { code: 'ABORT_ERR' });
}
async function readAt(file, offset, length, signal) {
  integer(offset);
  integer(length);
  // Response base64 and framing must fit the transport; never return a silently truncated read.
  if (length > 32 * 1024 * 1024)
    throw Object.assign(new Error('Read exceeds per-call byte limit'), { code: 'ENOTSUP' });
  const buffer = Buffer.alloc(length);
  let count = 0;
  while (count < length) {
    cancelled(signal);
    const { bytesRead } = await file.read(buffer, count, length - count, offset + count);
    if (!bytesRead) break;
    count += bytesRead;
  }
  return { base64: buffer.subarray(0, count).toString('base64') };
}
async function scan(file, options, signal) {
  const startLine = integer(options?.startLine),
    endLine = options.endLine === undefined ? Infinity : integer(options.endLine);
  if (endLine < startLine) throw invalid('Reversed line interval');
  let position = 0,
    line = 0,
    lineStart = 0,
    lineBytes = 0;
  let decoder = new TextDecoder(),
    start,
    end,
    firstLineEnd,
    lastLineStart,
    firstLineBytes = 0,
    selectedBytes = 0;
  const selectLine = (rawEnd) => {
    lineBytes += Buffer.byteLength(decoder.decode());
    if (line >= startLine && line < endLine) {
      if (start === undefined) {
        start = lineStart;
        firstLineEnd = rawEnd;
        firstLineBytes = lineBytes;
      } else selectedBytes++; // newline between selected lines, not after the last one
      end = rawEnd;
      lastLineStart = lineStart;
      selectedBytes += lineBytes;
    }
  };
  const buffer = Buffer.alloc(65536);
  for (;;) {
    cancelled(signal);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
    if (!bytesRead) break;
    let segment = 0;
    for (let i = 0; i < bytesRead; i++)
      if (buffer[i] === 10) {
        lineBytes += Buffer.byteLength(
          decoder.decode(buffer.subarray(segment, i), { stream: true }),
        );
        selectLine(position + i);
        line++;
        lineStart = position + i + 1;
        lineBytes = 0;
        decoder = new TextDecoder('utf-8', { ignoreBOM: true });
        segment = i + 1;
      }
    lineBytes += Buffer.byteLength(
      decoder.decode(buffer.subarray(segment, bytesRead), { stream: true }),
    );
    position += bytesRead;
  }
  selectLine(position);
  return {
    newlines: line,
    start: start ?? position,
    end: end ?? position,
    firstLineEnd: firstLineEnd ?? position,
    lastLineStart: lastLineStart ?? position,
    selectedBytes,
    firstLineBytes,
  };
}
const methods = {
  release: async () => {
    const results = await Promise.allSettled([...handles.values()].map((h) => h.file.close()));
    if (results.some((r) => r.status === 'rejected')) throw new Error('Reader cleanup failed');
    handles.clear();
    await fs.rm(dataDirectory, { recursive: true, force: true });
  },
  absolutePath: async ([p]) => path(p),
  joinPath: async ([parts]) => {
    if (!Array.isArray(parts) || !parts.every((p) => typeof p === 'string' && !p.includes('\0')))
      throw invalid('Invalid path parts');
    return join(...parts);
  },
  canonicalPath: async ([p]) => fs.realpath(path(p)),
  exists: async ([p]) => {
    try {
      await fs.stat(path(p));
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') return false;
      throw e;
    }
  },
  fileInfo: async ([p]) => {
    p = path(p);
    return info(p, await fs.lstat(p));
  },
  readTextFile: async ([p]) => fs.readFile(path(p), 'utf8'),
  fileReadStart: async ([p], signal) => {
    p = path(p);
    const h = await fs.open(p, 'r');
    let retained = false;
    try {
      const stat = await h.stat();
      if (stat.isDirectory())
        throw Object.assign(new Error('Expected file, got directory'), { code: 'EISDIR' });
      if (!stat.isFile()) throw invalid('Expected regular file');
      if (stat.size <= 4 * 1024 * 1024) return { bytes: await readAt(h, 0, stat.size, signal) };
      const id = randomUUID();
      handles.set(id, { file: h, path: p });
      retained = true;
      return { handle: id, size: stat.size };
    } finally {
      if (!retained) await h.close();
    }
  },
  fileWriteStart: async ([p, append]) => {
    p = path(p);
    if (typeof append !== 'boolean') throw invalid('Invalid write mode');
    await fs.mkdir(dirname(p), { recursive: true });
    const h = await fs.open(p, append ? 'a' : 'w');
    const id = randomUUID();
    handles.set(id, { file: h, path: p });
    return id;
  },
  fileWriteChunk: async ([id, content]) => {
    const buffer = bytes(content);
    if (typeof buffer === 'string') throw invalid('Expected binary chunk');
    const h = handle(id);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await h.file.write(buffer, offset, buffer.length - offset);
      if (!result.bytesWritten) throw new Error('File write made no progress');
      offset += result.bytesWritten;
    }
  },
  readBinaryFile: async ([p], signal) => {
    const h = await fs.open(path(p), 'r');
    try {
      const s = await h.stat();
      if (!s.isFile()) throw invalid('Expected a regular file');
      return await readAt(h, 0, s.size, signal);
    } finally {
      await h.close();
    }
  },
  writeFile: async ([p, content]) => {
    p = path(p);
    content = bytes(content);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  },
  appendFile: async ([p, content]) => {
    p = path(p);
    content = bytes(content);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.appendFile(p, content);
  },
  truncateFile: async ([p, size]) => fs.truncate(path(p), integer(size)),
  flushFile: async ([p]) => {
    const h = await fs.open(path(p), 'r+');
    try {
      await h.sync();
    } finally {
      await h.close();
    }
  },
  renameFile: async ([from, to]) => fs.rename(path(from), path(to)),
  createDir: async ([p, options]) => {
    await fs.mkdir(path(p), { recursive: options?.recursive === true });
  },
  remove: async ([p, options]) =>
    fs.rm(path(p), { recursive: options?.recursive === true, force: options?.force === true }),
  createTempDir: async ([prefix]) => {
    prefix ??= 'tmp-';
    if (!tempName(prefix)) throw invalid('Invalid temp prefix');
    return fs.mkdtemp(dataDirectory + '/' + prefix);
  },
  createTempFile: async ([options = {}]) => {
    const { prefix = 'tmp-', suffix = '' } = options ?? {};
    if (![prefix, suffix].every(tempName)) throw invalid('Invalid temp name');
    const p = join(dataDirectory, prefix + randomUUID() + suffix);
    const h = await fs.open(p, 'wx');
    await h.close();
    return p;
  },
  openBinaryReader: async ([p, options]) => {
    if (options?.noFollow)
      throw Object.assign(new Error('Atomic noFollow is not implemented on this Windows backend'), {
        code: 'ENOTSUP',
      });
    p = path(p);
    const h = await fs.open(p, 'r');
    try {
      const s = await h.stat();
      if (s.isDirectory())
        throw Object.assign(new Error('Expected file, got directory'), { code: 'EISDIR' });
      if (!s.isFile()) throw invalid('Expected regular file');
      const id = randomUUID();
      handles.set(id, { file: h, path: p });
      return id;
    } catch (e) {
      await h.close();
      throw e;
    }
  },
  readerInfo: async ([id]) => {
    const h = handle(id);
    return info(h.path, await h.file.stat());
  },
  readerRead: async ([id, offset, length], signal) =>
    readAt(handle(id).file, offset, length, signal),
  readerScan: async ([id, options], signal) => scan(handle(id).file, options, signal),
  readerClose: async ([id]) => {
    const h = handles.get(id);
    if (h) {
      await h.file.close();
      handles.delete(id);
    }
  },
};
async function execute(request, signal) {
  try {
    cancelled(signal);
    const method = Object.hasOwn(methods, request.method) && methods[request.method];
    if (!method) return failure('not_supported', 'Unsupported file method');
    return ok(await method(request.args, signal));
  } catch (e) {
    const code =
      {
        ENOENT: 'not_found',
        EACCES: 'permission_denied',
        EPERM: 'permission_denied',
        ENOTDIR: 'not_directory',
        EISDIR: 'is_directory',
        EINVAL: 'invalid',
        EEXIST: 'invalid',
        ENOTSUP: 'not_supported',
        ABORT_ERR: 'aborted',
      }[e.code] ?? 'unknown';
    return failure(code, e.message ?? 'File operation failed');
  }
}
const parser = frames((request) => {
  if (request?.v !== VERSION || !Number.isSafeInteger(request.id) || request.id < 1)
    throw new Error('Invalid request envelope');
  if (request.cancel === true) {
    active.get(request.id)?.abort();
    return;
  }
  if (typeof request.method !== 'string' || !Array.isArray(request.args) || active.has(request.id))
    throw new Error('Invalid request');
  const controller = new AbortController();
  active.set(request.id, controller);
  tail = tail.then(async () => {
    const result = await execute(request, controller.signal);
    await send({ v: VERSION, id: request.id, result });
    active.delete(request.id);
  });
});
try {
  await send({ v: VERSION, ready: true, nonce, pid: process.pid });
  for await (const chunk of process.stdin) parser.push(chunk);
  parser.end();
  await tail;
  await output;
} finally {
  await tail.catch(() => {});
  const results = await Promise.allSettled([...handles.values()].map((h) => h.file.close()));
  if (results.some((r) => r.status === 'rejected')) throw new Error('Reader cleanup failed');
}
