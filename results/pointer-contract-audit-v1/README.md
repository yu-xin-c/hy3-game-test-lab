# 输入合同等价性对照

对去重汇总选择的 96 份原始任务与游戏 manifest 做只读检查，同一校验器分别关闭、开启输入等价处理。

两种模式均为 86/96 通过，新增通过 0 题。不能将这次修改描述为提高全量通过率；没有重算游戏玩法成绩，也没有执行新的浏览器路径。

修改依据是执行器的实际行为：

- 鼠标和触控通过 click/tap 执行，不读取 key_event；不再因该无效标记的差异拒绝合同。
- 比例坐标未指定 selector 时使用默认游戏表面，显式指定同一表面与省略 selector 等价。
- 仍检查键盘按下/松开语义、不同设备、不同操作者、不同坐标比例和错误目标；没有因为公开题面简略而放弃这些执行约束。

新增三项单元测试覆盖等价与非等价情况。此前已有真实 Chromium 测试确认 selector 加比例坐标的输入位置。以后每次游戏评测还记录 task_adapter_sha256，避免只追踪运行器却漏掉合同检查器版本。

result.json 保存逐题新旧判断、任务/标准/manifest 哈希及校验器哈希。这里的 strict_metadata 是同一校验器关闭新等价逻辑的对照，不冒充历史整批成绩。

```sh
pnpm exec tsx scripts/audit-pointer-contracts.ts --out artifacts/pointer-contract-new
```
