# Particle Orchestra

## 游戏目标

按 A、C、D、B 的顺序点亮四组粒子音轨。

## 完整玩法

数字键1/2/3/4分别触发 A/B/C/D 粒子簇。正确输入推进 progress 并增加25分；错误输入清空 progress、扣一次 attempts，但继续当前局。

三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。

## 胜负与重开

- 完整输入 A、C、D、B 时获胜并得到100分。
- 初始3次 attempts，第三次错误后失败。
- Restart 清空进度和分数，恢复3次机会并回到菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：webgl；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`sequence`、`progress`、`score`、`attempts`、`active_cluster`。
- 事件：`game_started`、`cluster_triggered`、`note_correct`、`note_wrong`、`progress_reset`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `A`：键盘 Digit1 press
  - `B`：键盘 Digit2 press
  - `C`：键盘 Digit3 press
  - `D`：键盘 Digit4 press
  - `RESTART`：mouse 操作 #restart-btn
