# 常驻 MXC 文件服务：最终固定记录

## 范围与身份

Windows x64 / Node 24.15.0 / MXC SDK 1.0.1 固定 x64 CLI，Pakka 消费版本为 agent 0.7.0 / Durable 1.4.0-pakka.2。TypeScript 7.0.2。未更新系统 Node，未调用付费模型。

`benchmark-samples.json`、`consumer-proof.json` 各自记录实际运行的 6 个源码 SHA-256；已逐个核对它们与最终工作源码及安装源码一致。安装的公开声明字节也与工作源码一致。`archives.json` 记录实际消费的归档身份；文档和证据导航在运行后整理，不将其归档字节等同于整个后续工作树。

## 检查与结果

| 检查 | 结果 | 原始记录 |
| --- | --- | --- |
| 文件/协议/路径回归 | 22 通过，0 失败，0 跳过 | `tests.txt` |
| 两轮原语基准 | 每轮 60 次冷启动，每条稳态路径 400 次 | `benchmark-samples.json`、`benchmark-summary.jsonl` |
| 仓库外实际安装消费 | 5 次本地 HTTP；write/edit/read、权限拒绝、能力撤销、清理和 ready 重开 | `consumer.txt`、`consumer-proof.json` |
| 安装版本树 | EI 0.1.0-dev.0 / agent 0.7.0 / Durable 1.4.0-pakka.2 | `consumer-tree.json` |
| 公开契约 / EI 声明 | strict 通过；后者未启用 skipLibCheck | `consumer.txt` |
| MJS / PowerShell 语法 | 全部通过 | `checks.txt` |
| 主动 LSP | 6/6 超时，均未确认 | `checks.txt` |

硬链接用例检查冷/热等价，不是硬链接拒绝证明；两条路线都允许从已授权根下的 hardlink 访问同一文件对象。初始独立对照保留在[前一记录](../persistent-files-2026-11-05/README.md)。

## 复跑

从仓库根执行 `npm test` 和 `npm run benchmark`。安装消费运行 `scripts/verify-pakka.ps1 -PakkaPackage <实际归档> -Offline -TypeScriptCompiler <tsc.js>`；Offline 依赖已有本地缓存，测试使用隔离 HOME 和空 npm 配置。完整命令条件见[指南](../../guides/MXC-FILES.md)。

`source-manifest.json` 固定实现、测试和复跑脚本等输入；`SHA256SUMS.json` 固定本目录其他证据文件。原始文件受 .gitattributes 和 .prettierignore 保护，保留采集字节。

本记录支持文件组件及上述接入路径，不覆盖命令进程树、完整环境 manager、重开后的再次工具调用、跨硬链接对象隔离或完整 Pakka 工具端到端时延。采用范围及分位数见[变更记录](../../changes/2026-11-05-persistent-files.md)。
