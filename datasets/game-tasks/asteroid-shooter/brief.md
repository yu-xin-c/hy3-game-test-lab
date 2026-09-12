# Asteroid Shooter

## 游戏目标

完成太空射击的三段目标：锁定小行星、击碎护盾、摧毁核心。

## 完整玩法

Start 后从第一阶段开始。正确顺序固定为“锁定小行星 → 击碎护盾 → 摧毁核心”。每完成一段增加10分并推进 progress；顺序错误会清空 progress 并扣1条生命。主要场景必须用原生 WebGL 绘制可辨认的三维对象。 best_score 随当前最高分更新，获胜时为30。

三维画面使用原生 WebGL，不加载 Three.js 或任何远程资源。

## 胜负与重开

- 依次完成三个阶段时立即获胜，progress=3、score=30。
- 初始2条生命，第二次错误操作时立即失败。
- Restart 恢复0进度、0分、2条生命、空 last_action 和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

界面要直接写出三段目标：锁定小行星、击碎护盾、摧毁核心。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：webgl；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`progress`、`score`、`lives`、`last_action`、`best_score`。
- 事件：`game_started`、`stage_completed`、`action_rejected`、`progress_reset`、`leaderboard_updated`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `STAGE_1`：键盘 KeyA press
  - `STAGE_2`：键盘 KeyS press
  - `STAGE_3`：键盘 KeyD press
  - `WRONG`：键盘 KeyX press
  - `RESTART`：mouse 操作 #restart-btn
