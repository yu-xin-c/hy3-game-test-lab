# Collaborative Mural

## 游戏目标

完成双人壁画的三段目标：P1画蓝色背景、P2画黄色太阳、P1补上白色云朵。

## 完整玩法

Start 后从第一阶段开始。正确顺序固定为“P1画蓝色背景 → P2画黄色太阳 → P1补上白色云朵”。每完成一段增加10分并推进 progress；顺序错误会清空 progress 并扣1条生命。第一、三阶段由主页面完成，第二阶段由副页面完成，两个页面通过 BroadcastChannel 同步。

评测会同时打开两个页面；只能用 BroadcastChannel 做本机同步，不得访问服务器。

## 胜负与重开

- 依次完成三个阶段时立即获胜，progress=3、score=30。
- 初始2条生命，第二次错误操作时立即失败。
- Restart 恢复0进度、0分、2条生命、空 last_action 和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

界面要直接写出三段目标：P1画蓝色背景、P2画黄色太阳、P1补上白色云朵。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#game-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`progress`、`score`、`lives`、`last_action`、`connected`。
- 事件：`game_started`、`player_joined`、`stage_completed`、`action_rejected`、`progress_reset`、`game_won`、`game_lost`、`game_reset`。
- 控件：
  - `START`（主页面）：mouse 操作 #start-btn
  - `JOIN`（副页面）：mouse 操作 #join-btn
  - `STAGE_1`（主页面）：mouse 操作 #stage-1
  - `STAGE_2`（副页面）：mouse 操作 #stage-2
  - `STAGE_3`（主页面）：mouse 操作 #stage-3
  - `WRONG`（副页面）：mouse 操作 #wrong-action
  - `RESTART`（主页面）：mouse 操作 #restart-btn
