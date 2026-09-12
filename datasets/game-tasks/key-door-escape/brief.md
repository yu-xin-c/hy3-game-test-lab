# Key Door Escape

## 游戏目标

做一个带钥匙、锁门和陷阱的网格解谜游戏。玩家必须先取得钥匙，打开门，再到达出口。

## 完整玩法

地图固定为 8×5：

```text
########
#S..D.E#
#.#.#..#
#K..T..#
########
```

`S` 是起点 `(1,1)`，`K` 是钥匙，`D` 是门，`T` 是陷阱，`E` 是出口。玩家用方向键逐格移动。没有钥匙时门会阻挡玩家；拿到钥匙后，再次进入门格会把门永久打开。钥匙不消耗，直到本局结束。

玩家初始有 2 条生命。踩到陷阱损失 1 条生命，并回到起点；地图上的钥匙和门恢复到本条生命开始时的状态。生命归零立即失败。

## 胜负与重开

- 打开门并进入出口：`won`。
- 生命归零：`lost`。
- 游戏结束后不接受移动。
- Restart 按钮或键盘 `R` 返回菜单，恢复 2 条生命、钥匙、门和玩家位置。

## 界面与反馈

地图必须清楚区分墙、玩家、钥匙、门、陷阱和出口。HUD 显示 `Lives: n/2`、是否持有钥匙、门的状态和当前状态。碰到锁门时显示 `Door is locked`，取得钥匙显示 `Key collected`，开门显示 `Door opened`。

## 固定规则

坐标与 Maze Collector 相同。撞墙或撞锁门不算成功移动。seed 相同必须产生相同状态。

## 自动测试接口

- 界面：DOM 网格。
- `#start-btn`、`#restart-btn`；`#board` 为游戏区域。
- `[data-testid="score"]` 显示生命与钥匙；`[data-testid="status"]` 显示状态。
- 控件名称：`START`、`UP`、`DOWN`、`LEFT`、`RIGHT`、`RESTART`、`RESTART_KEY`。
- state 至少包含：`status`、`player:{x,y}`、`lives`、`has_key`、`door_open`。
- 事件：`game_started`、`player_moved`、`wall_blocked`、`door_blocked`、`key_collected`、`door_opened`、`trap_hit`、`player_respawned`、`game_won`、`game_lost`、`game_reset`。
