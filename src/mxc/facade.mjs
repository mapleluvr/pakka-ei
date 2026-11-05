import { failure, freeze, ok, isBase64 } from './protocol.mjs';
const CHUNK = 4 * 1024 * 1024;
const rejected = (code, message) => freeze(failure(code, message));
const validRange = (offset, length) =>
  Number.isSafeInteger(offset) &&
  offset >= 0 &&
  Number.isSafeInteger(length) &&
  length >= 0 &&
  Number.isSafeInteger(offset + length);
function contentBytes(content) {
  if (typeof content === 'string') return Buffer.from(content);
  if (isBase64(content?.base64)) return Buffer.from(content.base64, 'base64');
  return undefined;
}

export function fileFacade(channel, cwd, release, metadata) {
  let accepting = true,
    closing;
  const pending = new Set();
  function admit(operation) {
    if (!accepting)
      return Promise.resolve(
        rejected(
          channel.state === 'unknown' ? 'unknown' : 'invalid',
          'File owner is closing or closed',
        ),
      );
    const promise = Promise.resolve().then(operation);
    pending.add(promise);
    promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    );
    return promise;
  }
  async function range(id, offset, length, signal) {
    if (!validRange(offset, length)) return rejected('invalid', 'Invalid read range');
    if (length <= CHUNK) return channel.request('readerRead', [id, offset, length], signal);
    const parts = [];
    let received = 0;
    while (received < length) {
      const size = Math.min(CHUNK, length - received);
      const result = await channel.request('readerRead', [id, offset + received, size], signal);
      if (!result.ok) return result;
      const part = Buffer.from(result.value.base64, 'base64');
      parts.push(part);
      received += part.length;
      if (part.length < size) break;
    }
    return freeze(ok({ base64: Buffer.concat(parts, received).toString('base64') }));
  }
  async function readFile(path, text, signal) {
    const initial = await channel.request('fileReadStart', [path], signal);
    if (!initial.ok) return initial;
    let result;
    if (initial.value.bytes) result = ok(initial.value.bytes);
    else {
      result = await range(initial.value.handle, 0, initial.value.size, signal);
      const closed = await channel.request('readerClose', [initial.value.handle]);
      if (!closed.ok) return closed;
    }
    return freeze(
      result.ok && text ? ok(Buffer.from(result.value.base64, 'base64').toString('utf8')) : result,
    );
  }
  async function writeFile(method, path, content, signal) {
    const buffer = contentBytes(content);
    if (!buffer) return rejected('invalid', 'Invalid file content');
    if (buffer.length <= CHUNK) return channel.request(method, [path, content], signal);
    const initial = await channel.request(
      'fileWriteStart',
      [path, method === 'appendFile'],
      signal,
    );
    if (!initial.ok) return initial;
    let result = ok(undefined);
    for (let offset = 0; offset < buffer.length; offset += CHUNK) {
      result = await channel.request(
        'fileWriteChunk',
        [initial.value, { base64: buffer.subarray(offset, offset + CHUNK).toString('base64') }],
        signal,
      );
      if (!result.ok) break;
    }
    const closed = await channel.request('readerClose', [initial.value]);
    return closed.ok ? result : closed;
  }
  const lease = {
    id: 'node:local',
    cwd,
    status: () =>
      freeze({
        ...metadata(),
        state: !accepting && channel.state === 'ready' ? 'draining' : channel.state,
      }),
    cleanup() {
      if (closing) return closing;
      accepting = false;
      closing = (async () => {
        await Promise.allSettled([...pending]);
        await release();
      })();
      return closing;
    },
    readTextFile: (path, signal) => admit(() => readFile(path, true, signal)),
    readBinaryFile: (path, signal) => admit(() => readFile(path, false, signal)),
    writeFile: (path, content, signal) =>
      admit(() => writeFile('writeFile', path, content, signal)),
    appendFile: (path, content, signal) =>
      admit(() => writeFile('appendFile', path, content, signal)),
    openBinaryReader: (path, settings, signal) =>
      admit(async () => {
        const result = await channel.request('openBinaryReader', [path, settings], signal);
        if (!result.ok) return result;
        const id = result.value,
          reads = new Set();
        let closed;
        function call(operation) {
          if (closed) return Promise.resolve(rejected('invalid', 'Reader is closed'));
          const promise = admit(operation);
          reads.add(promise);
          promise.then(
            () => reads.delete(promise),
            () => reads.delete(promise),
          );
          return promise;
        }
        return freeze(
          ok({
            info: (signal) => call(() => channel.request('readerInfo', [id], signal)),
            read: (offset, length, signal) => call(() => range(id, offset, length, signal)),
            scanLines: (settings, signal) =>
              call(() => channel.request('readerScan', [id, settings], signal)),
            close() {
              if (closed) return closed;
              if (closing) return (closed = closing.then(() => {}));
              closed = admit(async () => {
                await Promise.allSettled([...reads]);
                return channel.request('readerClose', [id]);
              }).then((result) => {
                if (!result.ok) throw new Error(result.error.message);
              });
              return closed;
            },
          }),
        );
      }),
  };
  const arities = {
    absolutePath: 1,
    joinPath: 1,
    canonicalPath: 1,
    exists: 1,
    fileInfo: 1,
    truncateFile: 2,
    flushFile: 1,
    renameFile: 2,
    createDir: 2,
    remove: 2,
    createTempDir: 1,
    createTempFile: 1,
  };
  for (const [method, arity] of Object.entries(arities))
    lease[method] = (...args) =>
      admit(() =>
        channel.request(
          method,
          Array.from({ length: arity }, (_, i) => args[i]),
          args[arity],
        ),
      );
  return Object.freeze(lease);
}
