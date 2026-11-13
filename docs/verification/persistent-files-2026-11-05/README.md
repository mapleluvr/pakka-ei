# 前一候选：常驻文件服务

本记录描述 2026-11-05 盘符、共享根状态槽位修复前的候选，不代表当前实现。环境为 Windows x64、Node 24.15.0、MXC SDK 1.0.1、TypeScript 7.0.2；安装消费者为 `ei-installed-4dNUhV`，组合为 EI 0.1.0-dev.0、Agent 0.7.0、Durable 1.4.0-pakka.2。

## 身份与实际结果

- 21 项文件回归通过；两轮基准与当时安装的六个运行源码 SHA-256 一致。
- 安装消费、公开声明 strict 检查及固定版本记录保留在原始证据中。
- EI 当时消费归档 SHA-256：`7cbdc6c57ce4a78fcd1bfcd396265c40b38507083292caab0328b3cefcf8b5de`。
- Agent 当时消费归档 SHA-256：`f169cb32f9e2b7a5bf4c7596083c0ab2a89e816d3ecbb72ec271c2abbefe46f7`。
- 不加载 EI worker 的独立 MXC Node fs alias 对照只解释硬链接边界，不属于此候选性能样本，也不证明硬链接对象隔离。

后续修正、最终候选的实际范围及复跑方式见[最终记录](../persistent-files-2026-11-05-final/README.md)。后续源码或文档变更不会改变该候选原身份。

## 原始证据保全

两个历史目录的日志、样本、依赖树、逐文件清单及原 README 已整体保存为本地 `ei-verification-original.tar.gz`（50,517 字节），整体 SHA-256：

`a96d39c4dd4d88990e6972912ce013aa148ba9001c084149af5dc4e24b1790f2`

工作区本地恢复入口：`.backups/2026-11-12-ei-verification/README.md`。2026-11-12 整理时全部 23 项原文件已逐项读回核验，两份历史 SHA256SUMS 全部匹配。原始证据不提交 Git、不上传；本次文档整理不冒充重新运行。
