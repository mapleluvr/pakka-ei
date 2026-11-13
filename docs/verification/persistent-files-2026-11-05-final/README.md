# 常驻 MXC 文件服务：最终固定记录

## 候选、环境与范围

2026-11-05，Windows x64 / Node 24.15.0 / MXC SDK 1.0.1 固定 x64 CLI / TypeScript 7.0.2。安装消费组合为 EI 0.1.0-dev.0、Pakka agent 0.7.0、Durable 1.4.0-pakka.2。未更新系统 Node，未调用付费模型。

当时消费的 EI 安装归档 SHA-256 为 `6eb36e8d9bb25857250d4626c259828f32fea1b56a55cc4ddda02976f2b07b5a`，Agent 安装归档为 `f169cb32f9e2b7a5bf4c7596083c0ab2a89e816d3ecbb72ec271c2abbefe46f7`。当时测量、安装和工作实现的六个源码身份逐项一致，公开声明字节也一致；不把同名版本、后续文档或后续 HEAD 当作该安装归档。完整来源身份保留在本地原始证据中。

## 实际结果

| 检查                   | 2026-11-05 实际结果                                                        |
| ---------------------- | -------------------------------------------------------------------------- |
| 文件、协议和路径回归   | 22 通过、0 失败、0 跳过                                                    |
| 两轮原语基准           | 每轮 60 次冷启动，每条稳态路径 400 次                                      |
| 仓库外安装消费         | 5 次本地确定性 HTTP；write/edit/read、权限拒绝、能力撤销、清理、ready 重开 |
| 公开契约与 EI 声明     | strict 通过；EI 自身声明未启用 skipLibCheck                                |
| MJS 与 PowerShell 语法 | 通过                                                                       |
| 主动 LSP               | 六条路径均超时，结果未确认，不记为通过                                     |

硬链接用例仅证明冷、热路线一致，二者都允许已授权根下的 hardlink 访问同一文件对象，不证明跨根硬链接对象隔离。结果不覆盖命令进程树、完整环境 manager、重开后再次工具调用或完整 Pakka 工具端到端时延。性能分位数与采用条件见[变更记录](../../changes/2026-11-05-persistent-files.md)；[前一候选](../persistent-files-2026-11-05/README.md)不是本候选。

## 复跑与原始证据

仓库根使用 `npm test`、`npm run benchmark`；仓库外消费入口为 `scripts/verify-pakka.ps1 -PakkaPackage <实际归档> -Offline -TypeScriptCompiler <tsc.js>`。Offline 需要本地依赖缓存，使用隔离 HOME、空 npm 配置和本地确定性 provider；条件见[开发指南](../../guides/DEVELOPMENT.md)。

原始日志、样本、依赖树和逐文件 manifest 仅本地归档，不纳入 Git 或远端附件。包含两个历史目录所有 23 项原文件及保全清单的证据包为 `ei-verification-original.tar.gz`（50,517 字节），整体 SHA-256：

`a96d39c4dd4d88990e6972912ce013aa148ba9001c084149af5dc4e24b1790f2`

本机恢复入口：工作区 `.backups/2026-11-12-ei-verification/README.md`。2026-11-12 整理时全部文件逐项读回核验，原历史 SHA256SUMS 全部匹配；旧结果没有重新运行或改写，新摘要不改变原候选身份。
