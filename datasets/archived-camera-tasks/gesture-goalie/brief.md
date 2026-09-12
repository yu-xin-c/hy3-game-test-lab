# Gesture Goalie

## 游戏目标

用摄像头中的左右和居中手势连续扑出 3 个点球。

## 完整玩法

评测器提供三种固定摄像头画面：left-pose 的蓝色标记在左三分区，center-pose 的绿色标记在中间，right-pose 的红色标记在右三分区。每换一帧就识别一次守门位置。三次射门方向固定为左、右、中。

评测会授予摄像头权限并提供固定假视频；摄像头不可用时要显示明确错误，不能静默改用按钮。

## 胜负与重开

- 三次方向都匹配时获胜，saves 为 3。
- 初始 2 条生命，方向不匹配扣 1 条；第二次失误时失败。
- Restart 恢复第 0 球、0 次扑救、2 条生命和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

必须真正调用 getUserMedia 读取评测器提供的假视频，不能用键盘代替手势。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`shot_index`、`saves`、`lives`、`keeper_pose`。
- 事件：`camera_ready`、`pose_detected`、`shot_saved`、`shot_missed`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `SHOW_LEFT`：摄像头画面 left-pose
  - `SHOW_CENTER`：摄像头画面 center-pose
  - `SHOW_RIGHT`：摄像头画面 right-pose
  - `RESTART`：mouse 操作 #restart-btn
