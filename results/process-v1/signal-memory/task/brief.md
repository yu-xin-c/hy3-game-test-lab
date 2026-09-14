# Signal Memory

## 游戏目标

做一个三回合的颜色序列记忆游戏。游戏先播放颜色序列，玩家随后按相同顺序点击四个颜色区域。

## 完整玩法

Canvas 分成红、绿、蓝、黄四个区域。每回合开始时先播放序列：每个颜色高亮 400ms，间隔 200ms。播放期间玩家输入必须被忽略。播放结束后进入输入阶段。

固定 seed 的三回合序列为：

1. 红、蓝
2. 绿、黄、红
3. 蓝、红、黄、绿

每次正确输入增加 10 分并推进进度。完成当前序列后自动进入下一回合的播放阶段。错误输入损失 1 条生命、清空本回合进度，并重新播放同一回合。初始 3 条生命。

## 胜负与重开

- 完成第三回合全部输入：`won`，最终分数 90。
- 生命归零：`lost`。
- 胜负后颜色输入不再改变状态。
- Restart 按钮或键盘 `R` 返回菜单，恢复分数、生命、回合和序列。

## 界面与反馈

HUD 显示 `Round: n/3`、`Lives: n/3`、`Score: n`、当前阶段和状态。播放阶段显示 `Watch`，输入阶段显示 `Repeat`。正确输入短暂显示 `Correct`，错误输入显示 `Wrong — try this round again`。状态固定为 `Menu`、`Playing`、`Won`、`Lost`。

## 固定规则

所有播放和反馈时间都由游戏时钟驱动。seed 相同必须得到相同序列。每个输入只能对应一次颜色判断。

## 自动测试接口

- 界面：Canvas2D，`#signal-canvas` 为游戏区域。
- `#start-btn`、`#restart-btn`。
- `[data-testid="score"]` 显示分数；`[data-testid="status"]` 显示状态。
- 控件名称：`START`、`RED`、`GREEN`、`BLUE`、`YELLOW`、`RESTART`、`RESTART_KEY`。
- state 至少包含：`status`、`phase`、`round`、`lives`、`score`、`progress`、`sequence`、`last_feedback`。
- 事件：`game_started`、`playback_started`、`input_phase_started`、`input_ignored`、`signal_correct`、`signal_wrong`、`round_completed`、`game_won`、`game_lost`、`game_reset`。
