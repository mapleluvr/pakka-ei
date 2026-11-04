# 2026-11-04：初始化独立仓库与 Windows sandbox 调查

## 明确要求

用户指定在 `D:\Projects\pakka-works\pakka-ei` 工作，并明确：

- pakka-ei 属于 Pakka 计划，作为独立 repo 发布、维护。
- 产品面向 pi-durable，定位轻量级、个人级 evaluation infrastructure。
- 依赖 pakka-mas。
- 用 Git 和 state-evo 初始化项目，调查 [mapleluvr/pi-tool-gateway](https://github.com/mapleluvr/pi-tool-gateway)。该 sandbox 方案此前由用户在 Windows 的 pi-coding-agent 中测试实现。

上述定位写入[产品预期](../state/product.md)。此前的使用陈述属于用户提供的背景；本次另行取得固定源码及独立运行证据。

## 初始化范围

目标目录检查时为空。创建独立 Git 仓库，初始分支为 `main`，加入 README、AGENTS、文本换行约定与忽略规则。此次只创建本地仓库与初始提交，未创建远端或推送。

采用 state-evo 分工：

| 位置 | 职责 |
| --- | --- |
| `docs/OVERVIEW.md` | 定位、当前工作及导航 |
| `docs/state/` | 已采用的产品预期，独立于形成历史 |
| `docs/changes/` | 初始形成、调整及其依据 |
| `docs/investigations/` | 有版本与证据范围的长期调查记录 |
| `docs/.temp/` | 忽略的本地计划、源码副本、实验和原始日志 |

本次未选择评估数据模型、评分协议、存储布局或 sandbox 实现路线，也未创建占位 API、npm 发布配置或指定项目许可证。候选设计先由调查与后续具体用例推进。

## 调查与独立检查

[调查报告](../investigations/pi-tool-gateway.md)以公开提交 `638cdecdeae7758f334a2a59e76f6c2f03f85efd` 为依据。它保存执行路径、宿主可信域、Native fallback、持久化差异和 pi-durable / MAS 对照。

独立安装、类型检查与打包预览完成。Windows 全量测试为 **169 通过、3 失败、0 跳过**；三个失败发生在宿主 symlink 夹具创建，独立对照复现 `EPERM`，未进入对应 gateway 检查。报告保留该缺口，不采用上游 172 项全通过记录作为本次结果。

另作无模型的小样本顺序耗时测量，记录一次完整自检及每组五次命令／文件调用；其结果只用于识别接入成本，不作为评估系统性能指标。未修改 gateway 跟踪源码、现有 Pi 安装、系统权限或生产配置。

## 接续

初始化和调查交付到此完成。候选接入方向与需要用户决定的评估关系见[后续设计入口](../investigations/pi-tool-gateway.md#后续设计入口)，不随本次初始化自动采用。
