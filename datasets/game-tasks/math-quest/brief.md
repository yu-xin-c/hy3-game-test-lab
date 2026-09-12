# Math Quest

## 游戏目标

依次答对三道固定数学题。

## 完整玩法

题目固定为：7+5（A=11/B=12/C=13）；9×3（A=18/B=21/C=27）；18÷3（A=6/B=7/C=8）。答对加10分并进入下一题，答错增加 mistakes 但仍进入下一题。

## 胜负与重开

- 三题全部答对时获胜，score 为30。
- 第二次答错时立即失败。
- Restart 恢复第一题、0分和0次错误。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#quiz`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`question_index`、`score`、`mistakes`、`last_answer`。
- 事件：`game_started`、`answer_correct`、`answer_wrong`、`question_changed`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `ANSWER_A`：mouse 操作 #answer-a
  - `ANSWER_B`：mouse 操作 #answer-b
  - `ANSWER_C`：mouse 操作 #answer-c
  - `RESTART`：mouse 操作 #restart-btn
