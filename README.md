# pakka-ei

**Pakka's environment infrastructure**：为 Agent 运行时提供执行环境基础设施，独立于上层会话、任务和应用编排。

`@pakka/ei` 提供按 lease 复用的 **MXC 文件服务**。一个 lease 拥有一个受限文件进程、打开的文件句柄和临时资源；调用方通过冻结的数据与异步方法使用它。环境核心没有 Pakka、Pi 或 MAS 的运行时依赖，可通过公开结构接口接入 Pakka。

## 文件能力

- 文本与二进制文件读写、追加、截断、刷新、重命名及目录创建/删除。
- 绑定真实文件对象的 binary reader，支持偏移读取和行区间扫描。
- 按 owner 保留的临时文件；关闭时排空已接纳操作，再释放资源并确认进程退出。
- 显式目录授权，以及失联或效果未知时的失败关闭行为。

这是文件能力组件。命令执行、watch、目录遍历和 text-line reader 没有对应实现；作为 Pakka 的部分 `ExecutionDriver` 使用时，缺失能力明确拒绝，不回退宿主 I/O。完整接口见[文件服务契约](docs/state/mxc-files.md)。

## 运行条件与安全边界

- **Windows x64、Node.js 24+**，宿主能够运行 MXC process container。
- 固定依赖 `@microsoft/mxc-sdk@1.0.1`，通过校验身份的 CLI 通信，不使用其 native stdio API。
- 工作目录来自可信来源，授权由宿主 bootstrap 决定；应用可写目录与环境控制目录、运行代码分离。

**MXC 的路径授权不等于文件对象隔离。** 已授权目录内的硬链接可能读写同一文件在禁止或只读目录下的对象。因此本组件不能单独充当恶意工作树的通用强沙箱，也不隔离整个 Agent 进程。使用前请阅读[授权与失败处理](docs/guides/MXC-FILES.md)。

## 从源码试用

```powershell
git clone https://github.com/mapleluvr/pakka-ei.git
cd pakka-ei
npm ci --ignore-scripts
```

将以下代码保存为仓库根下的 `quickstart.mjs`，执行 `node quickstart.mjs`。它只授权一个新建的临时工作目录，打印实际读回的内容和关闭状态：

```js
import { mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMxcFileLease } from '@pakka/ei';

const root = await mkdtemp(join(await realpath(tmpdir()), 'pakka-ei-demo-'));
const cwd = join(root, 'work');
await mkdir(cwd);
console.log(root);

const lease = await createMxcFileLease({
  cwd,
  stateDirectory: join(root, 'owner'),
  readwritePaths: [cwd],
});
function value(result) {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
try {
  value(await lease.writeFile('hello.txt', 'hello from MXC'));
  console.log(value(await lease.readTextFile('hello.txt')));
} finally {
  await lease.cleanup();
}
console.log(lease.status().state);
```

正常输出包含 `hello from MXC` 和 `closed`。工作文件和 owner 记录保留在打印的根目录中，环境内部临时数据随正常关闭清理。若取得或关闭失败，保留根目录供检查，不把异常当作已回滚。

GitHub 仓库公开与 npm 发布是两件事：`package.json` 的 `private: true` 用于阻止 npm 发布。消费方式是源码或本地 `.tgz`，见[安装与开发检查](docs/guides/DEVELOPMENT.md)。

## 文档与开发

| 入口                                                          | 内容                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| [文档总览](docs/OVERVIEW.md)                                  | 阅读路径与待设计事项                      |
| [产品预期](docs/state/product.md)                             | 职责、能力与集成关系                      |
| [文件服务契约](docs/state/mxc-files.md)                       | 输入、结果、资源与授权条件                |
| [使用指南](docs/guides/MXC-FILES.md)                          | 配置、关闭、失败处理及 Pakka 生命周期接入 |
| [开发指南](docs/guides/DEVELOPMENT.md)                        | 测试、基准、安装消费与文档维护            |
| [实现与测量记录](docs/changes/2026-11-05-persistent-files.md) | 固定版本的验证结果与原始证据              |

`npm test` 运行文件与协议回归；`npm run benchmark` 测量首次取得与常驻调用。测试使用独立夹具和本地确定性 provider，不需要模型凭据。
