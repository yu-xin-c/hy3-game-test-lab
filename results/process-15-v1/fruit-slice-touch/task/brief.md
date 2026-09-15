# Fruit Slice Touch

## 游戏目标

在不碰炸弹的情况下切中 5 个水果。

## 完整玩法

开始后一次只出现一个可触控水果；切中后得 10 分并出现下一个。炸弹是独立触控目标，碰到会扣 1 条生命。

## 胜负与重开

- 切中第 5 个水果时立即获胜，最终分数为 50。
- 初始 3 条生命，碰到第 3 个炸弹时立即失败。
- Restart 返回菜单，恢复 0 分、3 条生命和 5 个剩余水果。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#playfield`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`score`、`lives`、`sliced`、`remaining`。
- 事件：`game_started`、`fruit_sliced`、`bomb_hit`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：touch 操作 #start-btn
  - `SLICE`：touch 操作 #fruit
  - `BOMB`：touch 操作 #bomb
  - `RESTART`：touch 操作 #restart-btn
