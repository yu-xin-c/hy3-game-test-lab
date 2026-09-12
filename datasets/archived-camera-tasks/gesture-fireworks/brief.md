# Gesture Fireworks

## 游戏目标

用三种摄像头手势依次放出蓝、红、金三束烟花。

## 完整玩法

评测器提供 swipe-up-blue、circle-red、open-gold 和 fist-wrong 四段固定假视频。前三段分别包含蓝色上划轨迹、红色圆环和金色五指轮廓。游戏必须读取视频像素识别它们。正确顺序为蓝上划、红圆环、金开掌。

评测会授予摄像头权限并提供固定假视频；摄像头不可用时要显示明确错误，不能静默改用按钮。

## 胜负与重开

- 依次识别三种正确手势时获胜，launches 为3。
- 错误手势会清空 progress 并扣1条生命；初始2条生命，第二次错误后失败。
- Restart 恢复0进度、0次发射、2条生命和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

必须调用 getUserMedia；每段假视频稳定显示至少500ms，识别去抖后每段只计一次。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`progress`、`launches`、`lives`、`last_gesture`。
- 事件：`camera_ready`、`gesture_detected`、`firework_launched`、`gesture_wrong`、`progress_reset`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `BLUE`：摄像头画面 swipe-up-blue
  - `RED`：摄像头画面 circle-red
  - `GOLD`：摄像头画面 open-gold
  - `WRONG`：摄像头画面 fist-wrong
  - `RESTART`：mouse 操作 #restart-btn
