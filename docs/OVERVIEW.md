# pakka-ei

面向 pi-durable、依赖 pakka-mas 的轻量级个人评估基础设施，独立发布和维护。

## 阅读入口

- [产品预期](state/product.md)：已明确的定位与依赖关系。
- [初始化记录](changes/2026-11-04-initialize-project.md)：要求来源、仓库初始化范围及调查结果入口。
- [Pi Tool Gateway 调查](investigations/pi-tool-gateway.md)：固定源码版本、Windows 独立复跑、隔离边界及候选接入方向。
- `docs/.temp/active-plan.md`：本地执行安排；外部源码、实验及原始输出同放忽略目录。正式调查可脱离该目录阅读。

## 当前工作

仓库初始化与 gateway 调查已完成；尚无评估运行器实现。下一项设计工作是选取一条具体评估用例，明确被测对象、评分依据、协作关系与执行权限，再确定 pi-durable / pakka-mas 的版本及接入契约。

待决定的问题和建议的最小试验见[调查结尾](investigations/pi-tool-gateway.md#后续设计入口)。这些候选内容尚未转为 `state/` 中的已采用架构。
