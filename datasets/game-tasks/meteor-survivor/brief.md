# Meteor Survivor

## 游戏目标

在三条轨道中躲过 5 秒流星雨并刷新本局榜单。

## 完整玩法

玩家从轨道1开始。1000/2000/3000/4000ms 的流星依次落在轨道1/0/2/1。每躲过一波得 100 分，生存到 5000ms 再得 100 分。

## 胜负与重开

- 无碰撞坚持到 5000ms 获胜，得 500 分并把 best_score 更新为 500。
- 与任一流星同轨时立即失败。
- Restart 清空当前局；新的评测场景从空榜单开始。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`lane`、`elapsed_ms`、`wave`、`score`、`best_score`。
- 事件：`game_started`、`lane_changed`、`wave_survived`、`meteor_hit`、`leaderboard_updated`、`game_won`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `LEFT`：键盘 ArrowLeft press
  - `RIGHT`：键盘 ArrowRight press
  - `RESTART`：mouse 操作 #restart-btn
