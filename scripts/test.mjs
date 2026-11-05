import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const temp = realpathSync.native(tmpdir());
const home = mkdtempSync(join(temp, 'pakka-ei-test-home-'));
const env = {
  ...process.env,
  TEMP: temp,
  TMP: temp,
  HOME: home,
  USERPROFILE: home,
  PI_CODING_AGENT_DIR: join(home, '.pi'),
  PI_OFFLINE: '1',
};
const files = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...(files.length ? files : ['test/*.test.mjs'])],
  { env, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
