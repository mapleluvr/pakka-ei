import { encode, frames, VERSION, failure, freeze, isBase64 } from './protocol.mjs';

const codes = new Set([
  'aborted',
  'not_found',
  'permission_denied',
  'not_directory',
  'is_directory',
  'invalid',
  'not_supported',
  'unknown',
]);
function validValue(method, value) {
  if (
    [
      'absolutePath',
      'joinPath',
      'canonicalPath',
      'readTextFile',
      'openBinaryReader',
      'fileWriteStart',
      'createTempDir',
      'createTempFile',
    ].includes(method)
  )
    return typeof value === 'string';
  if (method === 'fileReadStart')
    return (
      value &&
      (value.bytes
        ? validValue('readerRead', value.bytes) && value.handle === undefined
        : typeof value.handle === 'string' && Number.isSafeInteger(value.size) && value.size >= 0)
    );
  if (method === 'exists') return typeof value === 'boolean';
  if (['readBinaryFile', 'readerRead'].includes(method)) return isBase64(value?.base64);
  if (['fileInfo', 'readerInfo'].includes(method))
    return (
      value &&
      typeof value.path === 'string' &&
      typeof value.name === 'string' &&
      ['file', 'directory', 'symlink'].includes(value.kind) &&
      Number.isFinite(value.size) &&
      value.size >= 0 &&
      Number.isFinite(value.mtimeMs)
    );
  if (method === 'readerScan')
    return (
      value &&
      [
        'newlines',
        'start',
        'end',
        'firstLineEnd',
        'lastLineStart',
        'selectedBytes',
        'firstLineBytes',
      ].every((k) => Number.isSafeInteger(value[k]) && value[k] >= 0)
    );
  return value === undefined || value === null;
}
/** Internal transport. The public launcher always supplies the pinned MXC file worker. */
export function openChannel(
  child,
  {
    nonce,
    startupTimeoutMs = 5000,
    requestTimeoutMs = 30000,
    closeTimeoutMs = 5000,
    onUnknown = () => {},
  },
) {
  let phase = 'opening',
    terminal,
    pending,
    sequence = 0,
    queue = Promise.resolve(),
    closing,
    exitResult;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {});
  const unknownResult = () =>
    freeze(failure('unknown', terminal?.message ?? 'File service unavailable'));
  function poison(error) {
    if (terminal) return;
    terminal = error instanceof Error ? error : new Error(String(error));
    phase = 'unknown';
    clearTimeout(startupTimer);
    rejectReady(terminal);
    pending?.settle(unknownResult());
    try {
      onUnknown(terminal);
    } catch {
      /* The caller also retains the non-closed write-ahead owner record. */
    }
  }
  const startupTimer = setTimeout(
    () => poison(new Error('File service startup deadline exceeded')),
    startupTimeoutMs,
  );
  const parser = frames((message) => {
    if (terminal) return;
    if (phase === 'opening') {
      if (
        message?.v !== VERSION ||
        message.ready !== true ||
        message.nonce !== nonce ||
        !Number.isSafeInteger(message.pid) ||
        message.pid < 1
      )
        throw new Error('Invalid file service handshake');
      phase = 'ready';
      clearTimeout(startupTimer);
      resolveReady(freeze({ pid: message.pid }));
      return;
    }
    if (message?.v !== VERSION || message.id !== pending?.id || !pending)
      throw new Error('Unexpected file service reply');
    const result = message.result;
    if (
      !result ||
      typeof result.ok !== 'boolean' ||
      (result.ok
        ? !validValue(pending.method, result.value)
        : !codes.has(result.error?.code) || typeof result.error.message !== 'string')
    )
      throw new Error('Invalid file service result');
    if (!result.ok && result.error.code === 'unknown') {
      poison(new Error(result.error.message));
      return;
    }
    pending.settle(freeze(result.ok ? { ok: true, value: result.value } : result));
  });
  child.stdout.on('data', (chunk) => {
    if (!terminal)
      try {
        parser.push(chunk);
      } catch (e) {
        poison(e);
      }
  });
  child.stdout.on('end', () => {
    if (!terminal)
      try {
        parser.end();
      } catch (e) {
        poison(e);
      }
  });
  // Drain diagnostics, retaining no user content. A nonzero exit remains a failure.
  child.stderr.on('data', () => {});
  child.stdin.on('error', poison);
  child.stdout.on('error', poison);
  child.stderr.on('error', poison);
  child.on('error', poison);
  const exited = new Promise((resolve) =>
    child.once('close', (code, signal) => {
      exitResult = { code, signal };
      if (phase !== 'draining' || pending || code !== 0 || signal !== null)
        poison(new Error('File service exited without a confirmed clean release'));
      resolve(exitResult);
    }),
  );
  function dispatch(method, args, signal) {
    if (terminal) return Promise.resolve(unknownResult());
    if (signal?.aborted)
      return Promise.resolve(freeze(failure('aborted', 'Operation cancelled before dispatch')));
    const id = ++sequence;
    let frame;
    try {
      frame = encode({ v: VERSION, id, method, args });
    } catch {
      return Promise.resolve(
        freeze(failure('not_supported', 'Request exceeds the file protocol limit')),
      );
    }
    return new Promise((resolve) => {
      const abort = () => {
        // Cancellation is a request; only the worker's response can settle an already dispatched operation.
        if (pending?.id === id && !terminal)
          child.stdin.write(encode({ v: VERSION, id, cancel: true }), (e) => {
            if (e) poison(e);
          });
      };
      const timer = setTimeout(
        () => poison(new Error('File request result is unknown after deadline')),
        requestTimeoutMs,
      );
      pending = {
        id,
        method,
        settle(result) {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          pending = undefined;
          resolve(result);
        },
      };
      signal?.addEventListener('abort', abort, { once: true });
      child.stdin.write(frame, (e) => {
        if (e) poison(e);
      });
    });
  }
  return Object.freeze({
    ready,
    get state() {
      return phase;
    },
    request(method, args, signal) {
      if (terminal) return Promise.resolve(unknownResult());
      if (phase !== 'ready')
        return Promise.resolve(
          freeze(failure('invalid', 'File owner is not accepting operations')),
        );
      // Serialize admission without caching file data or coalescing operations.
      const result = queue.then(() => dispatch(method, args, signal));
      queue = result.then(() => {}, poison);
      return result;
    },
    close() {
      if (closing) return closing;
      if (!terminal) phase = 'draining';
      closing = (async () => {
        await queue;
        if (!terminal) {
          const release = await dispatch('release', []);
          if (!release.ok) poison(new Error('File service resource release failed'));
        }
        child.stdin.end();
        if (!exitResult) {
          let timer;
          await Promise.race([
            exited,
            new Promise((resolve) => {
              timer = setTimeout(() => {
                poison(new Error('File service exit could not be confirmed'));
                child.kill();
                resolve();
              }, closeTimeoutMs);
            }),
          ]);
          clearTimeout(timer);
        }
        if (terminal) throw terminal;
        phase = 'closed';
      })();
      return closing;
    },
  });
}
