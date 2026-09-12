# Target Rush

## 游戏目标

做一个完整的点击反应游戏。玩家在 20 秒内连续击中 5 个移动目标即可获胜；累计点错 3 次或倒计时结束则失败。

## 完整玩法

游戏打开后先显示标题、玩法说明和 Start 按钮。点击 Start 后进入游戏区域，显示一个可以点击的圆形目标。每次正确点击目标，分数增加 1，目标立即移动到由 seed 决定的下一个位置。点击游戏区域的空白位置算一次 miss，但点击 HUD、按钮或游戏区域外部不能算 miss。

分数达到 5 时立即结束并显示胜利画面。miss 达到 3，或者 20 秒倒计时归零时，立即显示失败画面。游戏结束后不再接受计分或 miss 输入。

## 胜负与重开

- 20 秒内击中 5 个目标：`won`。
- miss 达到 3：`lost`。
- 时间归零且尚未获胜：`lost`。
- 胜负画面提供 Restart 按钮，键盘 `R` 也可以返回初始菜单。
- Restart 必须清空分数、miss、倒计时和目标序号。

## 界面与反馈

HUD 始终显示 `Score: n/5`、`Misses: n/3`、`Time: n.n` 和当前状态。目标必须完整位于可玩区域内，不能被 HUD 或视口边缘遮挡。状态文字固定使用 `Menu`、`Playing`、`Won`、`Lost`。

## 固定规则

倒计时使用毫秒计算。seed 相同的时候，5 个目标位置和出现顺序必须相同。目标每次只能计一次点击。

## 自动测试接口

- 界面：DOM。
- `#start-btn`：开始；`#target`：当前目标；`#restart-btn`：重开；`#playfield`：游戏区域。
- `[data-testid="score"]` 与 `[data-testid="status"]`：分数和状态。
- 控件名称：`START`、`HIT`、`MISS`、`RESTART`、`RESTART_KEY`。
- state 至少包含：`status`、`score`、`misses`、`remaining_ms`、`target_index`。
- 事件：`game_started`、`target_hit`、`target_missed`、`game_won`、`game_lost`、`game_reset`。
