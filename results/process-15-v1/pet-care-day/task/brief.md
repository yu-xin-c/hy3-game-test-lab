# Pet Care Day

## 游戏目标

在一天内把宠物的饱腹、快乐和精力都提升到3。

## 完整玩法

初始 hunger、happiness、energy 都是2。Feed、Play、Sleep 分别把对应值加1，最大为3，并立即写入 localStorage。刷新后必须恢复当前进度。

存档使用 localStorage 或 IndexedDB；页面刷新后必须恢复，Restart 按题目要求清理。

## 胜负与重开

- 三个值都到3时立即完成一天并获胜。
- 游戏中每2000ms三项各减1；任一项降到0时失败。
- Restart 清除当前存档，恢复三项为2并回到菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#pet-room`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`hunger`、`happiness`、`energy`、`actions`、`saved`。
- 事件：`game_started`、`pet_fed`、`pet_played`、`pet_slept`、`need_decayed`、`state_saved`、`state_loaded`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `FEED`：mouse 操作 #feed-btn
  - `PLAY`：mouse 操作 #play-btn
  - `SLEEP`：mouse 操作 #sleep-btn
  - `RESTART`：mouse 操作 #restart-btn
