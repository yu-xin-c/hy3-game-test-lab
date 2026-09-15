# Room Five in a Row

## 游戏目标

两个本地页面完成一局 5×5 五子棋。

## 完整玩法

主页面创建房间，副页面加入。P1 与 P2 严格轮流落子。P1 测试路径在第0行从左到右落五子；P2 在第4行从左到右落四子。

评测会同时打开两个页面；只能用 BroadcastChannel 做本机同步，不得访问服务器。

## 胜负与重开

- 任一方横、竖或斜线连续五子立即结束；主页面按 P1 结果显示 won 或 lost。
- P2 先连成五子时主页面显示 lost。
- 主页面 Restart 同步清空棋盘、回合、步数和房间状态。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#board`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`connected`、`turn`、`moves`、`winner`、`board`。
- 事件：`room_created`、`player_joined`、`piece_placed`、`turn_changed`、`match_won`、`game_reset`。
- 控件：
  - `START`（主页面）：mouse 操作 #start-btn
  - `JOIN`（副页面）：mouse 操作 #join-btn
  - `P1_C0`（主页面）：mouse 操作 #cell-r0-c0
  - `P1_C1`（主页面）：mouse 操作 #cell-r0-c1
  - `P1_C2`（主页面）：mouse 操作 #cell-r0-c2
  - `P1_C3`（主页面）：mouse 操作 #cell-r0-c3
  - `P1_C4`（主页面）：mouse 操作 #cell-r0-c4
  - `P2_C0`（副页面）：mouse 操作 #cell-r4-c0
  - `P2_C1`（副页面）：mouse 操作 #cell-r4-c1
  - `P2_C2`（副页面）：mouse 操作 #cell-r4-c2
  - `P2_C3`（副页面）：mouse 操作 #cell-r4-c3
  - `P2_C4`（副页面）：mouse 操作 #cell-r4-c4
  - `RESTART`（主页面）：mouse 操作 #restart-btn
