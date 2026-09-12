# Cooperative City

## 游戏目标

两名玩家在10秒内共同建成2级供电和2级供水，并分别确认。

## 完整玩法

主页面创建城市，副页面加入。P1 只能建 Power，每次加1；P2 只能建 Water，每次加1。达到 power=2、water=2 后，两页各点一次 Approve。所有状态通过 BroadcastChannel 同步。

评测会同时打开两个页面；只能用 BroadcastChannel 做本机同步，不得访问服务器。

## 胜负与重开

- 两项资源都为2且 approvals 为2时获胜。
- 虚拟时间到10000ms仍未满足条件时，两页同时失败。
- 主页面 Restart 同步清空资源、确认、计时和连接并回到菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：dom；主要区域：`#city`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`connected`、`power`、`water`、`approvals`、`elapsed_ms`。
- 事件：`city_created`、`player_joined`、`power_built`、`water_built`、`plan_approved`、`city_completed`、`game_lost`、`game_reset`。
- 控件：
  - `START`（主页面）：mouse 操作 #start-btn
  - `JOIN`（副页面）：mouse 操作 #join-btn
  - `BUILD_POWER`（主页面）：mouse 操作 #power-btn
  - `BUILD_WATER`（副页面）：mouse 操作 #water-btn
  - `APPROVE_P1`（主页面）：mouse 操作 #approve-btn
  - `APPROVE_P2`（副页面）：mouse 操作 #approve-btn
  - `RESTART`（主页面）：mouse 操作 #restart-btn
