# Platform Rescue

## 游戏目标

做一个单屏平台跳跃游戏。玩家要跨过两段高台，取得钥匙，再到达右上方的救援门。

## 完整玩法

游戏区域为 800×600。玩家从左下方地面出生，使用左右方向键移动，使用 Space 跳跃。关卡包含地面、`platform-1`、`platform-2` 和终点平台。钥匙位于 `platform-2`，救援门位于终点平台。没有钥匙接触救援门时不能通关。

左侧起点旁放置一段尖刺。玩家碰到尖刺或掉出世界边界会损失 1 条生命并回到出生点。初始 3 条生命，生命归零则失败。取得钥匙后接触救援门立即获胜。

关卡需要保证测试路径可行：玩家按住右键并连续完成三次跳跃，可以依次稳定落在 `platform-1`、`platform-2` 和终点平台。物体不能穿过平台、卡进平台、悬空显示落地或离开世界边界。

## 胜负与重开

- 取得钥匙后接触救援门：`won`。
- 生命归零：`lost`。
- 胜负后停止物理更新和计分。
- Restart 按钮或键盘 `R` 返回菜单，恢复关卡、钥匙和 3 条生命。

## 界面与反馈

Canvas 绘制游戏，HUD 使用普通 DOM 显示 `Lives: n/3`、`Key: Yes/No` 和状态。玩家、平台、尖刺、钥匙和门必须有明显区别。状态固定使用 `Menu`、`Playing`、`Won`、`Lost`。

## 固定规则

物理采用固定步长更新。相同 seed、相同输入和相同虚拟时间必须产生相同 tick、位置和事件。玩家状态使用左上角坐标，并公开宽高、水平/垂直速度、grounded 和 support_id。平台公开 id、x、y、width、height。

## 自动测试接口

- 界面：Canvas2D，`#game-canvas` 为游戏区域。
- `#start-btn`、`#restart-btn`。
- `[data-testid="score"]` 显示生命和钥匙；`[data-testid="status"]` 显示状态。
- 控件名称：`START`、`LEFT_DOWN`、`LEFT_UP`、`RIGHT_DOWN`、`RIGHT_UP`、`JUMP`、`RESTART`、`RESTART_KEY`。
- state 至少包含：`status`、`lives`、`has_key`、`player`、`platforms`、`world`、`sim_time_ms`。
- 事件：`game_started`、`player_jumped`、`player_landed`、`key_collected`、`hazard_hit`、`player_respawned`、`door_blocked`、`game_won`、`game_lost`、`game_reset`。
