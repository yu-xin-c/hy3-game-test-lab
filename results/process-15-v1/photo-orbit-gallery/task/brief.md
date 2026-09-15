# Photo Orbit Gallery

## 游戏目标

在旋转照片球中依次找到 Mars、Ocean、Forest。

## 完整玩法

四张本地生成纹理按 Forest、City、Mars、Ocean 排列，初始选中 Forest。左右方向键循环移动焦点，Enter 确认。正确确认推进 progress；错误确认增加 mistakes。

三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。

## 胜负与重开

- 按 Mars、Ocean、Forest 的顺序确认三张照片时获胜。
- 第二次错误确认时失败。
- Restart 恢复 Forest 焦点、空选择和0次错误。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：webgl；主要区域：`#gallery-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`focus_index`、`focus_name`、`selected`、`progress`、`mistakes`。
- 事件：`game_started`、`focus_changed`、`photo_selected`、`selection_wrong`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `NEXT`：键盘 ArrowRight press
  - `PREV`：键盘 ArrowLeft press
  - `SELECT`：键盘 Enter press
  - `RESTART`：mouse 操作 #restart-btn
