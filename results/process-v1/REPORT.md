# 游戏生成过程评估

补充发现：Signal Memory 在“播放中重开并开始新局”路径上，旧计时回调使新局提前接受输入，三次实测一致。见[补充测试](../playback-restart-v1/REPORT.md)。下表保留原始 Hy3 复核意见，不代表补测后的完整正确性结论。

3/3 题完成 Hy3 生成、真实 Chromium 执行与 Hy3 复核，共 33 次路径重放。

生成前输出编号公开方案，生成时记录 Write/Edit，运行后按需求、代码及状态证据复核。私有检查不进入生成提示，代码和调用提示均核对哈希。

| 游戏 | 难度 | 最终功能（Hy3） | 过程（Hy3） | 首错方案步骤 | 代码历史 |
| --- | --- | --- | --- | --- | --- |
| target-rush | D1 | 正确 | 正确 | 未确定 | 重建一致 |
| platform-rescue | D2 | 证据不足 | 证据不足 | 未确定 | 重建一致 |
| signal-memory | D3 | 正确 | 正确 | 未确定 | 重建一致 |

| 难度 | 样本数 | 最终正确/可判定 | 过程正确/可判定 |
| --- | --- | --- | --- |
| D1 | 1 | 1/1 | 1/1 |
| D2 | 1 | 0/0 | 0/0 |
| D3 | 1 | 1/1 | 1/1 |

这是模型复核意见，不是独立标准答案。样本少且存在不可判定项，不能推断能力下降的临界难度。错误类型条目数：{}

## target-rush

单一点击循环，状态少，但同时覆盖倒计时、错误点击和重开。

- test_problem / test_problem：浏览器合同检查（私有 frozen-task 规则）报告 4 处不符：control MISS.selector / MISS.x_ratio / MISS.y_ratio 与 RESTART_KEY.key_event 不匹配。但公开需求只要求 #playfield 作为游戏区域且 MISS=点击空白、控件名为 RESTART_KEY（键盘 R），并未定义 x_ratio/y_ratio，也未规定 key_event 取 'down' 还是 'press'。manifest 中 MISS.selector="#playfield" 与公开需求一致，RESTART_KEY.key_event="down" 与"键盘 R"语义一致。因此这 4 项是私有规则的误报，不是对公开需求的违反，也不影响玩法功能（loss-path 已实测产生 target_missed/game_lost）。

- 限制：seed 相同→目标位置/顺序一致（公开需求固定规则）由 mulberry32 确定性 PRNG 在代码中保证，但浏览器未直接执行 reset(seed:42) 复现对比，仅由代码逻辑确认。
- 限制：点击 HUD/按钮/区域外不计 miss 由各监听器的 e.target 判定保证，未在专项场景实测，但 loss-path 空白点击已验证 MISS 正常计数。
- 限制：所有 12 个胜负/超时/重开场景运行通过（final_outcome_correct=true、process_correct=true），合同 contract_pass=false 仅来自上述 manifest 私有规则误报，不证明游戏不可玩。

## platform-rescue

需要持续按键、虚拟时间和连续碰撞检测，并同时维护生命、钥匙和终局。

- test_problem / test_problem：loss-path 回放使玩家向左移动（vx=-3）被左墙夹在 x=0，从未接近右侧尖刺（x=80-120），游戏正确地未触发危险、未扣命。裁判期望 lives 由 3 减到 2/1/0 属回放输入方向错误导致的私有规则误报，非游戏逻辑缺陷；win-path 中 spike 命中、hazard_hit、扣命、game_lost 均正确产生，证明危险逻辑本身可用。
- other / insufficient_evidence：win-path 玩家在 tick5 即撞上尖刺、3 次扣命后 lost，未见成功越障。但尖刺位于出生点右侧地面、紧贴 platform-1 下方，按代码物理（jumpVy=-11, gravity=0.6, moveSpeed=3，滞空约 34 tick、水平约 102px）只需在触刺前（约 5 tick/80ms 内）起跳即可越障落到 platform-1，回放似乎未及时起跳。痕迹显示跳跃/落地/危险/拾取/门碰撞逻辑均正常运作，无法据此判定游戏不可通关；开发者亦自承落点为手算、未实跑验证。属验证输入时序问题，证据不足以断言代码缺陷。
- implementation_mismatch / test_problem：合约检查器报 JUMP/RESTART_KEY 的 key_event 与预期不符。但公开需求仅列出控件名称，未规定 key_event 取值；游戏实现中 JUMP(Space)、RESTART_KEY(KeyR) 均经 keydown 处理器触发（jumpQueued=true / restartGame()），manifest 标 key_event='down' 与实现一致，属私有规则误报，非真实缺陷。

- 限制：开发者明确未运行 Playwright/真实浏览器测试，关卡落点为手算、未经验证，无法对'通关路径可行'给出确定结论（final_correct=null）。
- 限制：win-path 与 loss-path 失败更可能源于回放输入（移动方向/起跳时序）而非游戏逻辑缺陷；已按'私有规则可能误报、先核对公开要求'原则复核。
- 限制：restart-path 干净通过（L1/L2 pass），证明 reset/状态机/出生/菜单恢复逻辑正确，但不足以证明核心通关路径可行。
- 限制：方案 step2 平台坐标被开发者有意偏离（称原时序不可行），但属有据可查的主动调整且原验证从未实跑，故不填首错 step。
- 限制：L1 层级 'missing or invalid player/world bounds geometry' 在 tick0 即报，但 observe() 实际含完整 player/platforms/world，疑为裁判解析误报。

## signal-memory

三回合时序、Canvas 坐标输入、错误重播和跨层 HUD 必须同时正确。

- test_problem / test_problem：评测器在 SM-CP-WON 期望 phase='complete'、round=3，但公开需求仅要求完成第三回合后 status='won' 且最终分数 90。证据中 state.status='won'、score=90 已正确达成。phase='menu' 与 round=4 为内部值，符合方案 step4 的 round++ 后 round>3→won 逻辑；公开需求未规定终局 phase 必须为 'complete' 或 round 必须为 3。属私密 oracle 误报，非实现缺陷。
- test_problem / test_problem：评测器在 SM-CP-LOST 期望 phase='complete'，但公开需求仅要求生命归零时 status='lost'。证据中 state.status='lost'、lives=0 已正确达成。捕获瞬间 HUD 文本 statusText='Playing' 是渲染循环（requestAnimationFrame）滞后一帧的时序假象，桥接 state 正确；win-path 末帧已证明 HUD 会更新为 'Won'。非逻辑缺陷。
- test_problem / test_problem：评测器在 SM-CP-RESET 期望 phase='idle'，但公开需求仅要求 Restart/键盘 R 返回菜单（status='menu'）。代码 doReset 设置 status='menu'、score=0、lives=3、round=1、sequence=[]，符合需求。phase='menu' 为内部值，公开需求未定义 'idle' 阶段。属私密 oracle 误报。
- test_problem / test_problem：contract 报告 control RED/GREEN/BLUE/YELLOW 的 selector 不匹配。manifest 使用 selector='#signal-canvas' 配合 x_ratio/y_ratio 表示四个画布象限，与公开需求 '#signal-canvas 为游戏区域' 及控件名称映射画布象限完全一致。此 contract 检查为私密规则误报，不违反公开需求。

- 限制：L3 真实浏览器认证未达成（所有场景 L3 为 unverified / observed_not_certified），仅 L1/L2 有证据；win/loss/restart 的 L2 '失败' 源于私密 oracle 期望 phase='complete'/round=3/phase='idle'，不在公开需求中，属误报。
- 限制：HUD 的 DOM 文本（scoreText/statusText）在点击事件后立即读取会滞后一帧，属渲染时序假象；桥接 observe() 返回的 state 始终正确。
- 限制：胜利后 round 计数增至 4（方案 step4 的 round++ 逻辑），HUD 可能显示 'Round: 4/3'，为轻微展示问题，不违反公开需求；终局 status 正确为 Won。
- 限制：manifest 的 RED/GREEN/BLUE/YELLOW 使用 selector '#signal-canvas' + x_ratio/y_ratio，符合公开需求（canvas 区域），contract 的 selector 不匹配为私密规则误报。

## 自动验证与边界

操作首错、代码写入步骤与方案首错是三个不同位置。精确匹配证明代码来源，不独立证明推理首错。规则失败也可能来自测试时机或未公开的字段约束。

平台游戏另有 6 次同代码对照：立即起跳 0/3 通关，确认落地后起跳 3/3 通关。结果位于 platform-rescue/landing-timing-diagnostic；独立错误及局部干预见 [错误定位报告](../error-mining-v1/REPORT.md)。这些对照不替换原始成绩。

运行：pnpm run app。复跑：pnpm run run:process -- --out 新目录 --cli CodeBuddy路径。
