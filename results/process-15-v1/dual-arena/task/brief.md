# Dual Arena

## 游戏目标

两个本地页面加入同一房间，先走到第 3 格的玩家获胜。

## 完整玩法

主页面创建固定房间，副页面加入。P1 用 D 前进，P2 用 L 前进；每次只前进一格，并通过 BroadcastChannel 同步到两个页面。

评测会同时打开两个页面；只能用 BroadcastChannel 做本机同步，不得访问服务器。

## 胜负与重开

- 任一玩家位置首次到 3 时比赛结束；主页面按 P1 的结果显示 won 或 lost。
- P2 先到 3 时，主页面显示 lost，两个页面的 winner 都是 secondary。
- 主页面 Restart 会同步清空双方位置和连接状态并回到菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#arena`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`connected`、`p1_position`、`p2_position`、`winner`。
- 事件：`room_created`、`player_joined`、`player_moved`、`match_won`、`game_reset`。
- 控件：
  - `START`（主页面）：mouse 操作 #start-btn
  - `JOIN`（副页面）：mouse 操作 #join-btn
  - `P1_STEP`（主页面）：键盘 KeyD press
  - `P2_STEP`（副页面）：键盘 KeyL press
  - `RESTART`（主页面）：mouse 操作 #restart-btn
