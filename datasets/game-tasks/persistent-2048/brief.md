# Persistent 2048

## 游戏目标

在两次滑动内把固定棋盘合成数字 8，并在中途刷新后继续。

## 完整玩法

初始第0行为 [2,2,0,0]，第1行为 [4,0,0,0]，其余为0；不生成随机新块。每次方向输入都计一次 moves 并立即保存。右滑后两个4位于第0、1行最右列；刷新后该状态必须恢复。

存档使用 localStorage 或 IndexedDB；页面刷新后必须恢复，Restart 按题目要求清理。

## 胜负与重开

- 第二步向下合出 8 时获胜。
- 两次输入后最大数字仍小于 8 则失败。
- Restart 清除存档并恢复原始棋盘和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#board`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`grid`、`moves`、`max_tile`、`saved`。
- 事件：`game_started`、`swipe`、`tile_merged`、`state_saved`、`state_loaded`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `UP`：键盘 ArrowUp press
  - `RIGHT`：键盘 ArrowRight press
  - `DOWN`：键盘 ArrowDown press
  - `RESTART`：mouse 操作 #restart-btn
