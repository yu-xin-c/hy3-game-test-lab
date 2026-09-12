# Mini Farm

## 游戏目标

在15秒内种植、浇水并收获三块田，获得30金币。

## 完整玩法

点击 PLOT1/2/3 选择田地；Plant 后变为 planted，Water 后变为 growing，虚拟时间累计3000ms后变为 ready，Harvest 得10金币。每次状态变化立即保存，刷新后继续。

存档使用 localStorage 或 IndexedDB；页面刷新后必须恢复，Restart 按题目要求清理。

## 胜负与重开

- 三块田各收获一次后获胜，coins 和 best_coins 都为30。
- 从 Start 起15000ms仍未收获三块田则失败。
- Restart 清空当前田地、计时和金币；评测新场景从空榜单开始。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#farm-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`selected_plot`、`plots`、`elapsed_ms`、`harvested`、`coins`、`best_coins`、`saved`。
- 事件：`game_started`、`plot_selected`、`crop_planted`、`crop_watered`、`crop_ready`、`crop_harvested`、`state_saved`、`state_loaded`、`leaderboard_updated`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `PLOT1`：mouse 操作 #plot-1
  - `PLOT2`：mouse 操作 #plot-2
  - `PLOT3`：mouse 操作 #plot-3
  - `PLANT`：mouse 操作 #plant-btn
  - `WATER`：mouse 操作 #water-btn
  - `HARVEST`：mouse 操作 #harvest-btn
  - `RESTART`：mouse 操作 #restart-btn
