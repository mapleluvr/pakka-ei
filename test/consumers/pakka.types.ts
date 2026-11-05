import { createMxcFileLease, type MxcFileLease } from '@pakka/ei';
import type { ExecutionConfiguration, ExecutionDriver } from '@pakka/agent';

declare const lease: MxcFileLease;
const driver: ExecutionDriver = lease;
const configuration: ExecutionConfiguration = {
  id: 'approved-policy-v1',
  tools: ['read', 'write', 'edit'],
  open: (target) =>
    createMxcFileLease({
      cwd: target.cwd,
      stateDirectory: 'C:/trusted/unused-slot',
      readwritePaths: [target.cwd],
    }),
};
void driver;
void configuration;
// @ts-expect-error This is deliberately a file-only driver, not a shell implementation.
lease.exec(['node', '--version']);
// @ts-expect-error The public owner exposes an immutable cwd.
lease.cwd = 'C:/other';
