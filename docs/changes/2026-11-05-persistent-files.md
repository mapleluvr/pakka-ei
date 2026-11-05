# 2026-11-05：按 lease 复用 MXC 文件服务

## 采用范围

用户批准立即实施不改变功能语义的时延优化。本批次采用按环境复用可信文件 worker，保留真实 handle、每次实际 I/O 和 owner 级临时资源；不实施提前预热、命令进程池或本机 Node 更新。

实现为 `@pakka/ei` 的 `createMxcFileLease()`，核心不依赖 Pakka/Pi/MAS 运行时代码，以冻结数据和关闭接口直接结构兼容 Pakka 的部分 ExecutionDriver。只装配文件能力，未把新组件称为完整 MXCExecutionEnv。命令仍留在独立执行路线，没有用宿主补齐缺失方法。

- [产品声明](../state/product.md)
- [文件服务契约](../state/mxc-files.md)
- [使用及生命周期指南](../guides/MXC-FILES.md)
- [前置定位、Node 绕行和基准记录](2026-11-05-environment-infrastructure.md)

## 实现与语义约束

- 固定 MXC SDK 1.0.1 的 x64 CLI SHA-256；原 Node 24.15.0 上运行，不改已安装 SDK 的 native stdio 版本门禁。
- 独占 owner 槽位与先行状态记录，记录启动器/worker PID、策略与代码身份；已有槽位拒绝复用。
- 每个 owner 一个文件 worker，通过有界、版本化、带请求身份的匿名管道协议处理请求。无内容缓存或操作合并。
- binary reader 始终使用同一打开对象；改名、原路径替换后仍可读到原对象。行扫描保留 BOM、CRLF、非法 UTF-8 和原始字节偏移语义。
- 大文件在同一 handle 分帧，owner 关闭等待完整在途操作；未 await 的已接纳操作也在排空范围内。正常关闭后的 reader.close 幂等。
- 发出前取消不执行；发出后取消等待明确回执。写入可能部分完成，取消不是回滚。
- 失联、坏帧、错配响应、超限帧、未知错误或未确认收尾使 owner 进入 unknown；不重发、不重启，保留记录和临时证据。

## 发现并修正的边界

失败先行与追加回归找到了默认参数被 JSON null 改变、owner 关闭后的 reader.close、不应作为文件上限的帧限制、大 base64 正则栈溢出，以及启动阶段未持久记录 launcher PID 等问题。独立 Node 正则对照复现了栈溢出；修正为线性验证。空路径和 Unicode 临时名称另与 Pakka 的本地公开驱动对照，临时数据仍限制在 owner 的 data 根内。

最后的纯路径回归发现状态槽位直接位于盘符/共享根时，字符串截取会丢失叶名首字符。改用 basename 与已经 canonicalize 的父目录组合；测试不接触实际盘符根。随后统一源码格式并重新跑 22 项、两轮默认规模基准及安装消费；早先的 21 项候选证据另行保留。

独立消费者的首次失败是夹具把缺失 exec 误判为 not_supported。核对 Pakka 公开适配实现后，预期修正为 shell_unavailable；生产实现未因该夹具而改变。

### 硬链接不是通过项

新增的“所有别名都应被拒绝”测试失败：RW 根下的 hardlink 可以读到另一个名字在 denied 根下的内容，也可以改写另一个名字在 RO 根下的文件。

随后使用相同策略、全新 MXC 进程直接执行 Node fs，未加载 EI worker/transport，得到相同结果。直接路径和 junction 均拒绝，跨根 hardlink 在两条路线均可读写。这支持“不是常驻复用回归”，不支持“已做到对象别名隔离”。稳定回归 `test/alias.test.mjs` 检查冷/热等价并输出实际结果，不把硬链接放行伪装成拒绝通过。

没有通过 blanket hardlink refusal 改变功能语义；授权边界进入正式契约。完整环境部署前仍需选择可信工作树/对象隔离策略，不能仅靠本组件作强沙箱。

## 功能验证

当前文件/协议套件 **22/22 通过，0 跳过**。其中包含真实 MXC 句柄、权限及 worker 死亡检查，也包含受控本地协议故障进程；这个数量不是 22 项隔离证明。

大文件回归包含 33 MiB 二进制/positional 读取和 69 MiB UTF-8 写入。安装消费脚本把实际 EI/Pakka 归档安装到仓库外，用 5 次本地 HTTP 验证 native write/edit/read、权限拒绝、未提供命令的拒绝、invocation 撤销、owner 关闭及会话 ready 重开。该重开检查没有再次提交工具任务。

最终主动 LSP 对 6 个实现/类型文件的检查全部超时，记录为未确认；另执行 Node 语法检查与安装后公开契约类型检查。TypeScript 7.0.2 检查 EI 声明时未启用 skipLibCheck，跨包公开契约检查启用该选项跳过外部声明。公开契约检查不替代对全部 JavaScript 的静态类型证明。

复跑入口：`npm test`、`scripts/verify-pakka.ps1`。最终原始记录及安装消费结果在 [固定证据](../verification/persistent-files-2026-11-05-final/README.md)；[前一候选](../verification/persistent-files-2026-11-05/README.md)保留来路。

## 实现后的时延

Windows x64 / Node 24.15.0。两轮独立夹具，每轮 60 个冷启动样本、每条稳态路径 400 个样本；下表取两轮较大的分位数，单位 ms。

| 路径 | P50 | P95 | P95 调优预算 |
| --- | ---: | ---: | ---: |
| owner 取得至就绪 | 349.93 | 371.47 | — |
| 新 owner 的首个 4 KiB 文件结果 | 351.93 | 373.76 | 400 |
| 常驻 4 KiB 四步读取 | 0.956 | 1.810 | 2 |
| 常驻 64 KiB 四步读取 | 1.368 | 2.515 | 3 |
| 常驻新写 4 KiB | 1.343 | 2.642 | 4 |

四步是 stat/open/read/close，包含内容核对；新写的宿主字节核对在请求/回执计时之外。相比早期最小探针，正式组件加入身份校验、持久状态和资源排空，启动与稳态开销有所增加，仍满足先前设定的本机预算。Shell 未改动，不把文件结果套到 PowerShell。

这些是原语层数据，不含完整 Pakka 模型调度、权限与持久化路径；预算不是跨机器保证。完整样本含运行源文件 SHA-256，安装消费者另记录实际加载源文件身份。

## 继续工作

完整 MXC 环境的命令后代进程收尾、manager 的持久 owner 管理、跨根 hardlink 威胁模型、Pakka 存续健康门禁和初始化取消接缝，继续由候选设计承接。文件组件的完成没有自动完成这些工作。
