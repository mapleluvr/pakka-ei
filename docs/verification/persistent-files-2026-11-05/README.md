# 前一候选：常驻文件服务

这里保留盘符/共享根状态槽位修复前的 21 项候选。其安装消费者为 `ei-installed-4dNUhV`，基准与该安装的 6 个运行源码哈希一致。它不是当前源码的最终身份或最终结果。

最终候选及复跑信息见[最终记录](../persistent-files-2026-11-05-final/README.md)。

- `tests.txt`：21 项回归原始输出。
- `benchmark-samples.json` / `benchmark-summary.jsonl`：两轮默认规模样本与汇总。
- `consumer.txt` / `consumer-proof.json` / `consumer-tree.json`：安装消费与版本树。
- `archives.json`：当时消费的归档 SHA-256。
- `alias-control.json`：此前不加载 EI worker 的独立 MXC Node fs 对照；用于解释硬链接边界，不属于该候选的性能样本。
- `declaration-check.txt` / `typescript-version.txt`：EI 声明检查及编译器版本。
