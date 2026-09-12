# Hand Particle Sculpture

## 游戏目标

完成手势粒子雕塑的三段目标：张手聚拢粒子、握拳压缩球体、上划拉成长柱。

## 完整玩法

Start 后从第一阶段开始。正确顺序固定为“张手聚拢粒子 → 握拳压缩球体 → 上划拉成长柱”。每完成一段增加10分并推进 progress；顺序错误会清空 progress 并扣1条生命。主要场景必须用原生 WebGL 绘制可辨认的三维对象。 三段正确假视频依次为蓝色左侧方块、绿色中央圆形、黄色右侧三角；错误帧是红色叉号。

评测会授予摄像头权限并提供固定假视频；摄像头不可用时要显示明确错误，不能静默改用按钮。

三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。

## 胜负与重开

- 依次完成三个阶段时立即获胜，progress=3、score=30。
- 初始2条生命，第二次错误操作时立即失败。
- Restart 恢复0进度、0分、2条生命、空 last_action 和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

界面要直接写出三段目标：张手聚拢粒子、握拳压缩球体、上划拉成长柱。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：webgl；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`progress`、`score`、`lives`、`last_action`。
- 事件：`game_started`、`camera_frame_detected`、`stage_completed`、`action_rejected`、`progress_reset`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `STAGE_1`：摄像头画面 blue-left-marker
  - `STAGE_2`：摄像头画面 green-center-marker
  - `STAGE_3`：摄像头画面 yellow-right-marker
  - `WRONG`：摄像头画面 red-cross-marker
  - `RESTART`：mouse 操作 #restart-btn
