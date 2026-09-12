# Neon Lane Racer

## 游戏目标

在三车道霓虹赛道上避开四个障碍并坚持到 5 秒终点。

## 完整玩法

赛车从中间车道 1 出发。左右键每次移动一条车道。障碍依次在 1000ms 的车道1、2000ms 的车道0、3000ms 的车道1、4000ms 的车道2 出现。每躲过一个得 100 分。

三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。

## 胜负与重开

- 无碰撞到达 5000ms 时获胜，最终 500 分。
- 任意一次在障碍出现时位于同一车道立即失败。
- Restart 回到车道1、0ms、0分和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：webgl；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`lane`、`elapsed_ms`、`passed`、`collisions`、`score`。
- 事件：`game_started`、`lane_changed`、`obstacle_passed`、`car_crashed`、`game_won`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `LEFT`：键盘 ArrowLeft press
  - `RIGHT`：键盘 ArrowRight press
  - `RESTART`：mouse 操作 #restart-btn
