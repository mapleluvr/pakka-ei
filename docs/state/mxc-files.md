# MXC 文件服务契约

## 执行域与公开接口

`createMxcFileLease(options)` 取得一个冻结的 `MxcFileLease`。它拥有专用文件 worker，使用 Windows x64、Node 24+ 和固定身份的 `@microsoft/mxc-sdk@1.0.1` CLI，以 stdin/stdout 承载文件请求。

同一 owner 的操作复用进程及真实文件句柄，内容按调用读取。工作目录和权限在取得时固定；不同 owner 使用独立进程和资源表。公开类型见 [`src/index.d.ts`](../../src/index.d.ts)。

| 身份               | 含义                                                       |
| ------------------ | ---------------------------------------------------------- |
| `id: "node:local"` | 宿主文件名字空间；共享文件内容不意味着共享授权或资源 owner |
| `leaseId`          | 单次 owner 的唯一身份，用于状态记录及协议握手              |
| `cwd`              | 该 owner 的绝对工作目录；相对目标路径以此解析              |
| `stateDirectory`   | 宿主为该 owner 提供的独占记录和临时数据槽位                |

## 取得参数

| 参数                                               | 契约                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `cwd`                                              | 既有绝对目录，位于批准的可读根中，并满足禁止规则                 |
| `stateDirectory`                                   | 既有可信父目录下的新槽位，与应用可写根分离；已有槽位拒绝再次取得 |
| `readwritePaths` / `readonlyPaths` / `deniedPaths` | 既有绝对目录列表；取得前快照并规范化；省略时为空列表             |
| `startupTimeoutMs`                                 | 正整数毫秒，默认 5000                                            |
| `requestTimeoutMs`                                 | 正整数毫秒，默认 30000；回复截止时间，不是效果回滚期限           |
| `signal`                                           | 可选的取得取消信号；启动后收到取消时等待明确的取得/收尾结果      |

CLI 不可用、身份不符、无效授权或启动失败时，取得 Promise 拒绝。返回 owner 之前，宿主完成策略和状态准备，并确认文件服务就绪。

## 文件能力与结果

| 能力            | 方法                                                              |
| --------------- | ----------------------------------------------------------------- |
| 路径与元数据    | `absolutePath`、`joinPath`、`canonicalPath`、`exists`、`fileInfo` |
| 文件内容        | `readTextFile`、`readBinaryFile`、`writeFile`、`appendFile`       |
| 文件及目录变更  | `truncateFile`、`flushFile`、`renameFile`、`createDir`、`remove`  |
| 临时资源        | `createTempDir`、`createTempFile`                                 |
| 真实文件 reader | `openBinaryReader` 返回 `info`、`read`、`scanLines`、`close`      |
| owner 控制      | `status`、`cleanup`，由持有 owner 的可信宿主使用                  |

文件方法返回冻结的 `{ ok: true, value }` 或 `{ ok: false, error }`。错误携带 `code` 和 `message`；二进制内容使用 `{ base64 }`。文本使用 UTF-8。大读写在同一 handle 上分帧完成；总内存及返回 DTO 受 Node 限制，协议帧大小不作为文件大小上限。

reader 保持已经打开的对象，原路径被替换后仍读取原对象。`read` 接受字节偏移和长度；`scanLines` 使用零基、右开区间，返回原文件字节偏移及解码后的 UTF-8 字节计数，并按行扫描规则处理首 BOM。请求原子的 `noFollow: true` 返回 `not_supported`。

此 owner 可结构兼容 Pakka 的部分 `ExecutionDriver`。`exec`、目录遍历、text-line reader 和 watch 没有对应方法；Pakka 对缺失文件方法返回 `not_supported`，对缺失命令返回 `shell_unavailable`，不选择宿主 I/O 补齐。

## 资源寿命与失败

owner 经取得、就绪、排空和正常关闭完成生命周期。临时数据跨文件调用和工具 invocation 保留；reader 由调用方显式关闭，owner 关闭也释放其持有的句柄。

`cleanup()` 同步停止接纳新操作，等待已接纳的完整操作，包括后续分帧和调用方漏写 `await` 的操作，再释放句柄与临时数据、确认进程退出并写入关闭记录。重复关闭复用同一个关闭 Promise；正常关闭后的 reader.close 可重复成功。**正常释放的判据是 `await cleanup()` 成功。**

`control/record.json` 保存取得、就绪、关闭或未知记录，以及策略/代码身份和 PID。`status()` 提供运行时状态及元数据，排空时可呈现 `draining`；它不是独立的持久恢复判据。记录写入或关闭失败使 `cleanup()` 拒绝，调用方保留槽位及证据，不能仅凭进程已退出或一次状态读取释放业务侧保留。

未发出的已取消操作返回 `aborted`。已发出的操作等待 worker 回执；大写入可能部分完成。坏帧、错配回复、失联、未知执行错误及不能确认的收尾使 owner 拒绝后续工作，保留非正常关闭证据，不自动重发或重启。重新使用目标前，由宿主核对旧 owner 的效果与资源；另建槽位不能代替这项裁定。

## 授权条件

`cwd` 本身不授予权限。可写根与控制目录、运行代码、Node 目录及显式只读根分离。调用只能使用已经绑定的能力，权限修改通过宿主重新授权和取得表达。

实际策略额外只读授权 Node 目录和 worker 代码目录，将 owner 的 `data/` 作为可写资源区，禁止 worker 访问 `control/`；父目录枚举用于运行时路径访问。可信宿主可检查 `control/policy.json`。策略和状态由宿主控制面写入，目标文件 I/O 在 worker 内执行。

MXC 执行路径授权。同一文件位于已授权根下的 hardlink 可能可读写，即使另一个名字位于禁止或只读根下。跨根硬链接和可被不受信任宿主代码改变的共享目录不构成强对象隔离边界；作用域外直接使用宿主 API 的 Agent 或插件也不受本文件接口约束。

取得、使用和排错方式见[使用指南](../guides/MXC-FILES.md)。
