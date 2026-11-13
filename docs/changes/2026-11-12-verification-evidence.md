# 2026-11-12：验证摘要与本地原始证据

全仓问题收集确认，两个 2026-11-05 固定记录仍在正式 verification 树跟踪原始日志、基准样本、依赖树和逐文件清单。用户批准处理此交付不一致；文件 owner、权限、协议和性能实现不在本次修改范围。

## 取舍与保全

先保全两个历史目录的全部 23 项原文件（包括原 README）及保全清单，限制本地访问，打包并逐项读回核验。两份原历史 SHA256SUMS 全部匹配后，才从正式目录移出 21 项原始文件。原 README 在本地包中保持原字节，正式目录替换为可独立阅读的候选、环境、范围、实际结果、限制和整体证据包 hash。

本地 `ei-verification-original.tar.gz` 为 50,517 字节，整体 SHA-256：

`a96d39c4dd4d88990e6972912ce013aa148ba9001c084149af5dc4e24b1790f2`

恢复入口为工作区 `.backups/2026-11-12-ei-verification/README.md`。原始材料不提交 Git、不上传；此 hash 是本地保全包身份，不是 EI/Pakka 安装归档身份。

## 记录边界

- [最终候选摘要](../verification/persistent-files-2026-11-05-final/README.md)与[前一候选摘要](../verification/persistent-files-2026-11-05/README.md)分开，原安装归档 hash 不倒写为新 HEAD。
- 22 项回归、基准与消费结果仍属于 2026-11-05 的固定候选；本次整理不冒充重新执行。原始校验和、来源 manifest 和测量样本保留在本地包。
- 当前交付规则写入 [AGENTS](../../AGENTS.md) 与[开发指南](../guides/DEVELOPMENT.md)；移除仅为原始 verification 设置的格式化例外。
- 文件服务的硬链接限制、命令进程树和完整 manager 等后续边界不因材料整理改变，见[采用记录](2026-11-05-persistent-files.md)。
