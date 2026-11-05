# 安装、开发与复跑

## 安装方式

在 Windows x64、Node 24+ 上，从仓库根安装锁定依赖：

```powershell
npm ci --ignore-scripts
```

公开入口为 `@pakka/ei`，源码和类型随包提供，无单独编译步骤。`package.json` 保持 `private: true`，用于阻止 npm publish；它不决定 GitHub 仓库可见性。

其他本地项目可消费实际归档：

```powershell
# 在 pakka-ei 根目录打包到既有目录
New-Item -ItemType Directory -Force ../ei-artifacts | Out-Null
npm pack --ignore-scripts --pack-destination ../ei-artifacts

# 然后在使用方项目中安装上述命令生成的 .tgz
npm install --ignore-scripts C:/artifacts/pakka-ei-0.1.0-dev.0.tgz
```

最后一行的路径应替换为实际归档绝对路径。包名和版本以 `package.json` 为准。包内含源码、公开类型和手册；完整测试与原始验证记录位于源码仓库。

## 运行文件与协议回归

```powershell
npm test
```

测试脚本规范化 Windows 临时路径、设置隔离 HOME/PI_OFFLINE 并串行运行测试。回归包括真实 MXC 文件进程、权限和生命周期检查，也包括受控本地协议故障进程；测试数量不等于同数量的隔离证明。

测试使用新建夹具，不需要用户模型凭据。硬链接用例核对一次性和常驻路径的实际行为：允许的别名访问结果是已知边界，不是拒绝测试通过。

## 测量时延

```powershell
npm run benchmark
```

默认两轮，每轮 60 次环境取得、每条稳态路径 400 次。结果包含逐样本数据、分位数、Node 版本和实际运行源码 SHA-256。

- 冷启动分开测量 owner 就绪和首个 4 KiB 文件结果。
- 4/64 KiB 稳态读取是 stat/open/read/close 四步，包含内容核对。
- 4 KiB 新写计时包含请求和回执，宿主侧字节核对在该计时之外。
- `EI_BENCH_ROUNDS`、`EI_BENCH_COLD`、`EI_BENCH_WARM` 可调整样本数；比较结果时保持规模及计时口径一致。

要保存纯 JSON，可直接运行 `node scripts/benchmark-files.mjs` 并分别重定向 stdout 和 stderr。基准测量的是环境原语，不是完整 Pakka 模型调度、权限和持久化链路。历史分位数和本机预算见[测量记录](../changes/2026-11-05-persistent-files.md)。

## 验证 Pakka 实际归档消费

准备带公开执行接口的 Pakka agent `.tgz`；脚本从参数接受它，不依赖开发者本机的固定项目位置：

```powershell
./scripts/verify-pakka.ps1 `
  -PakkaPackage C:/artifacts/pakka-agent-0.7.0.tgz `
  -Offline `
  -TypeScriptCompiler C:/toolchain/typescript/lib/tsc.js
```

- `PakkaPackage` 必填；应指向已经构建的实际归档。
- `Offline` 可选，要求依赖已在本地 npm 缓存；需要从公开 registry 下载时省略。
- `TypeScriptCompiler` 可选，指向明确的 `tsc.js`。跨包公开契约使用 strict 并跳过外部声明；EI 自身的声明另以不跳过声明的 strict 模式检查。

脚本在仓库外创建目录，打包并安装 EI 与 Pakka；使用隔离 HOME、PI_OFFLINE、空 npm 配置和本地确定性 HTTP provider。它检查真实 write/edit/read、权限与缺失能力拒绝、invocation 撤销、owner 关闭和会话 ready 重开。该重开步骤未再次提交工具任务。

完整示例见 [`test/consumers/pakka.mjs`](../../test/consumers/pakka.mjs)。曾消费的版本、归档和源码身份见[固定记录](../verification/persistent-files-2026-11-05-final/README.md)，不把任意同名版本自动视作同一归档。

## 维护文档与证据

按 state-evo 分工维护：

- `docs/state/` 直接说明当前对象、条件和契约，不用历史阶段或未来承诺定义产品。
- `docs/guides/` 让读者能够完成操作，并识别成功、拒绝和未知结果。
- `docs/changes/` 记录采用或调整的来源、条件和相关文档。
- `docs/verification/` 保存版本化结果，固定记录按自己的源码/归档身份解释。
- `docs/.temp/` 是本地忽略的计划和调查区。影响公开使用或后续工作的结论应在可跟踪文档中可读。

更新手册不会使旧 `source-manifest.json` 自动代表新工作树；保留历史 manifest 和证据字节，不为让旧检查重新匹配而改写它们。新结果另建记录并注明范围。对外发布前检查 README 示例、相对链接、忽略项和拟推送内容，避免上传凭据或本地运行材料。

开始贡献前阅读 [AGENTS.md](../../AGENTS.md)，从[文档总览](../OVERVIEW.md)找到对应契约和工作入口。
