import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, normalize } from 'node:path';
import { stateDirectoryPath } from '../src/mxc/lease.mjs';

test('state slot preserves the leaf name at a drive/share root and after parent canonicalization', () => {
  for (const requested of ['C:\\owner', 'C:\\nested\\owner', '\\\\server\\share\\owner']) {
    assert.equal(stateDirectoryPath(dirname(requested), requested), normalize(requested));
  }
  assert.equal(stateDirectoryPath('D:\\canonical', 'C:\\alias\\owner'), 'D:\\canonical\\owner');
});
