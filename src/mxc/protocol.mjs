import { TextDecoder } from 'node:util';
export const VERSION = 1;
export const MAX_FRAME = 64 * 1024 * 1024;
export const ok = (value) => ({ ok: true, value });
export const failure = (code, message) => ({ ok: false, error: { code, message } });
export function isBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false;
  let end = value.length;
  if (end && value.charCodeAt(end - 1) === 61) end--;
  if (end && value.charCodeAt(end - 1) === 61) end--;
  for (let i = 0; i < end; i++) {
    const c = value.charCodeAt(i);
    if (
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 43 ||
        c === 47
      )
    )
      return false;
  }
  return true;
}
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function frames(consume, maxBytes = MAX_FRAME) {
  let parts = [],
    length = 0;
  return {
    push(chunk) {
      for (let start = 0; start < chunk.length; ) {
        const newline = chunk.indexOf(10, start),
          end = newline < 0 ? chunk.length : newline;
        const part = chunk.subarray(start, end);
        length += part.length;
        if (length > maxBytes) throw new Error('Protocol frame exceeds limit');
        parts.push(part);
        if (newline >= 0) {
          const bytes = parts.length === 1 ? parts[0] : Buffer.concat(parts, length);
          let value;
          try {
            value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          } catch {
            throw new Error('Invalid protocol frame');
          }
          parts = [];
          length = 0;
          consume(value);
        }
        start = end + 1;
      }
    },
    end() {
      if (length) throw new Error('Incomplete protocol frame');
    },
  };
}
export function encode(value) {
  const frame = Buffer.from(JSON.stringify(value) + '\n');
  if (frame.length - 1 > MAX_FRAME) throw new Error('Protocol frame exceeds limit');
  return frame;
}
