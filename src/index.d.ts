export type FileErrorCode =
  | 'aborted'
  | 'not_found'
  | 'permission_denied'
  | 'not_directory'
  | 'is_directory'
  | 'invalid'
  | 'not_supported'
  | 'unknown';
export type FileResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: FileErrorCode; message: string }> }>;
export interface FileBytes {
  readonly base64: string;
}
export interface FileInfo {
  readonly name: string;
  readonly path: string;
  readonly kind: 'file' | 'directory' | 'symlink';
  readonly size: number;
  readonly mtimeMs: number;
}
export interface LineScan {
  readonly newlines: number;
  readonly start: number;
  readonly end: number;
  readonly firstLineEnd: number;
  readonly lastLineStart: number;
  readonly selectedBytes: number;
  readonly firstLineBytes: number;
}
export interface BinaryReader {
  info(signal?: AbortSignal): Promise<FileResult<FileInfo>>;
  read(offset: number, length: number, signal?: AbortSignal): Promise<FileResult<FileBytes>>;
  scanLines(
    options: { readonly startLine: number; readonly endLine?: number },
    signal?: AbortSignal,
  ): Promise<FileResult<LineScan>>;
  close(): Promise<void>;
}
export interface MxcFileOptions {
  /** Approved cwd, not an implicit permission grant. All directories must already exist. */
  readonly cwd: string;
  /** A fresh exclusive slot below an existing trusted parent, outside writable application roots. */
  readonly stateDirectory: string;
  readonly readwritePaths?: readonly string[];
  readonly readonlyPaths?: readonly string[];
  readonly deniedPaths?: readonly string[];
  readonly startupTimeoutMs?: number;
  /** An unknown reply deadline poisons the owner; it is not proof of rollback. */
  readonly requestTimeoutMs?: number;
  readonly signal?: AbortSignal;
}
export interface FileLeaseStatus {
  readonly version: number;
  readonly leaseId: string;
  readonly cwd: string;
  readonly state: 'opening' | 'ready' | 'draining' | 'closed' | 'unknown';
  readonly launcherHash: string;
  readonly workerHash: string;
  readonly protocolHash: string;
  readonly policyHash: string;
  readonly hostPid: number;
  readonly launcherPid: number;
  readonly workerPid: number;
  readonly createdAt: string;
}
/** File-only, structurally compatible with Pakka's partial ExecutionDriver; no Pi runtime dependency. */
export interface MxcFileLease {
  /** Host file namespace. Distinct permissions/owners are not distinct file contents. */
  readonly id: 'node:local';
  readonly cwd: string;
  status(): FileLeaseStatus;
  absolutePath(path: string, signal?: AbortSignal): Promise<FileResult<string>>;
  joinPath(parts: readonly string[], signal?: AbortSignal): Promise<FileResult<string>>;
  canonicalPath(path: string, signal?: AbortSignal): Promise<FileResult<string>>;
  exists(path: string, signal?: AbortSignal): Promise<FileResult<boolean>>;
  fileInfo(path: string, signal?: AbortSignal): Promise<FileResult<FileInfo>>;
  readTextFile(path: string, signal?: AbortSignal): Promise<FileResult<string>>;
  readBinaryFile(path: string, signal?: AbortSignal): Promise<FileResult<FileBytes>>;
  openBinaryReader(
    path: string,
    options?: { readonly noFollow?: boolean },
    signal?: AbortSignal,
  ): Promise<FileResult<BinaryReader>>;
  writeFile(
    path: string,
    content: string | FileBytes,
    signal?: AbortSignal,
  ): Promise<FileResult<void>>;
  appendFile(
    path: string,
    content: string | FileBytes,
    signal?: AbortSignal,
  ): Promise<FileResult<void>>;
  truncateFile(path: string, size: number, signal?: AbortSignal): Promise<FileResult<void>>;
  flushFile(path: string, signal?: AbortSignal): Promise<FileResult<void>>;
  renameFile(source: string, destination: string, signal?: AbortSignal): Promise<FileResult<void>>;
  createDir(
    path: string,
    options?: { readonly recursive?: boolean },
    signal?: AbortSignal,
  ): Promise<FileResult<void>>;
  remove(
    path: string,
    options?: { readonly recursive?: boolean; readonly force?: boolean },
    signal?: AbortSignal,
  ): Promise<FileResult<void>>;
  createTempDir(prefix?: string, signal?: AbortSignal): Promise<FileResult<string>>;
  createTempFile(
    options?: { readonly prefix?: string; readonly suffix?: string },
    signal?: AbortSignal,
  ): Promise<FileResult<string>>;
  /** Stop admission, drain complete operations, release handles/temp files and confirm process exit. */
  cleanup(): Promise<void>;
}
export function createMxcFileLease(options: MxcFileOptions): Promise<MxcFileLease>;
