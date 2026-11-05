# 2026-11-05：采用 environment infrastructure 定位

## 已采用的调整

用户明确 pakka-ei 只做 environment infrastructure，弃用 eval / evaluation-infrastructure 定位，以降低包与特定应用的耦合。相应撤回初始化要求中的 pakka-mas 强依赖；评估编排、被测对象和评分机制不作为这个包的设计任务。

当前声明见[产品预期](../state/product.md)。README、AGENTS 和[工作入口](../OVERVIEW.md)同步使用新定位。[初始化记录](2026-11-04-initialize-project.md)保留当时的要求，不将本次调整倒写为初始决定。

## 已有接缝

用户要求先提交 Pakka 的 ExecutionEnv 接入，按 `1.4.0-pakka.2` 命名，再考虑 MXC 设计。该提交已完成：`90fdf9594fef084c5be4011ff662814204b13de5`，位于独立分支 `feat/execution-env-1.4.0`，尚未合并或推送。

该版本使用公开 `HarnessOptions.env`，Pakka 向外提供中性 `ExecutionConfiguration` / `ExecutionDriver`；SDK source patch 的原生拒绝和结算行为沿用 `.1`。原有 `.1` 产物及历史记录保留。两次 `.2` 构建归档哈希相同；SDK 113 项、安装后 HTTP 3 项、Pakka 新增环境 24 项、相邻及版本选择 36 项通过，独立消费者实际加载 `.2`。完整证据属于 Pakka 的 `docs/verification/EXECUTION-ENVIRONMENT.md` 与兼容性账本，不作为 MXC 隔离证明。

## 本轮设计与探针

候选设计位于本地忽略路径 `docs/.temp/investigations/mxc-environment-design.md`，讨论独立环境核心、Pakka 薄适配、环境/调用资源寿命，以及当前 API 的初始化取消和存续健康限定。它尚未写入正式环境行为规格，也未实现驱动。

针对已取得的 `@microsoft/mxc-sdk@1.0.1` 做了无模型的小探针：

- 本机 Node `24.15.0` 下，公开 `spawn` 报 `backend_unavailable`，要求 Windows Node `>=24.21.0 <25` 或 `>=26.8.0`；同次平台 discovery 仍返回 supported，说明仅检查平台不足以准入。
- 使用同包 CLI 和明确策略后，stdout/stderr 分流、两轮 stdin 回声及正常退出成功。这支持继续尝试长期文件服务协议，不证明完整隔离或进程树收尾。
- 初始夹具漏 `LOCALAPPDATA` 被策略校验拒绝；补齐后仍因缺少 `ui.disable: false` 导致目标 Node 初始化失败。最终采用 gateway 已有的 UI subsystem 设置并保留剪贴板/注入/桌面控制限制。三个阶段的原始结果均保留，没有归为产品回归。

本轮据此建议先以固定 CLI 与匿名管道形成 launcher 契约，不为当前 Node 条件修改已安装 SDK，也不先增加文件邮箱或开放 loopback。具体策略、防伪通道、真实文件句柄、后代进程退出和未知效果仍由下一组试验决定。

原始材料在本地 `docs/.temp/evidence/mxc-design/`。没有修改系统权限、默认 Node 或现有 Pi 安装，没有调用模型或实现 MXC 驱动。

## 后续：Node 绕行与执行时延

用户随后要求优先绕过 Node 使用障碍，以工具启动时延的小基准推动调优；绕行可用则本机更新另行决定。已在原 Node 24.15.0 上通过 CLI 完成真实文件/句柄检查及两轮进程和常驻调用基准，没有修改 SDK 的版本门禁。

每项新进程场景 60 个有效样本、每条常驻路径 400 个样本：文件服务 READY P95 326.4 ms；常驻 4 KiB/64 KiB 四步读取 P95 1.25/1.62 ms；PowerShell 首输出/小命令退出 P95 479.8/569.3 ms。采用真实输出和文件效果核对，并以 Native 负对照确认权限拒绝不是 worker 模拟。

据此继续发展按 lease 复用文件服务、Shell 每命令独立的路线，暂不更新本机 Node。初始本机 P95 调优预算为新环境首个文件结果 400 ms、常驻 4 KiB/64 KiB 四步读取 2/3 ms、新写 4 KiB 4 ms、PowerShell 首输出/小命令退出 600/700 ms；这是测量后设定的预算，不是预先验收结论。

完整方法、差异和未覆盖范围在 `docs/.temp/investigations/mxc-execution-latency.md`；脚本及全部原始样本在 `docs/.temp/evidence/mxc-latency/`，`run.ps1` 提供不覆盖旧证据的复跑入口。基准没有覆盖完整 Pakka 工具开销、任意进程树收尾或全部隔离性质，未据此发布驱动。
