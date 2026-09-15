# Maze Collector

## 游戏目标

做一个俯视角网格迷宫游戏。玩家需要收集迷宫中的 3 枚金币，再到达出口，并且不能用完 18 次有效移动。

## 完整玩法

地图固定为 7×5：

```text
#######
#S.C.E#
#.#.#.#
#C...C#
#######
```

`#` 是墙，`S` 是起点 `(1,1)`，`C` 是金币，`E` 是出口。点击 Start 后，玩家使用方向键每次移动一格。撞墙、在金币未收齐时进入出口都要被阻挡，并且不消耗移动次数。进入金币格会收集金币，金币不能重复收集。

玩家收齐 3 枚金币后进入出口即获胜。18 次有效移动用完仍未通关则失败。结束后不能继续移动。

## 胜负与重开

- 收齐 3 枚金币并进入出口：`won`。
- 18 次有效移动用完且尚未通关：`lost`。
- Restart 按钮或键盘 `R` 返回初始菜单，恢复地图、金币和移动次数。

## 界面与反馈

画面显示完整网格、玩家、金币、出口和墙。HUD 显示 `Coins: n/3`、`Moves: n/18` 和状态。撞墙时短暂显示 `Blocked by wall`，金币不足时碰出口显示 `Collect all coins first`。状态固定使用 `Menu`、`Playing`、`Won`、`Lost`。

## 固定规则

坐标原点位于左上角，x 向右增加，y 向下增加。只有成功进入相邻可走格才增加 moves。seed 相同必须得到相同地图和初始状态。

## 自动测试接口

- 界面：DOM 网格。
- `#start-btn`、`#restart-btn`；`#board` 为游戏区域。
- `[data-testid="score"]` 显示金币数；`[data-testid="status"]` 显示状态。
- 控件名称：`START`、`UP`、`DOWN`、`LEFT`、`RIGHT`、`RESTART`、`RESTART_KEY`。
- state 至少包含：`status`、`player:{x,y}`、`coins_collected`、`moves_used`、`moves_remaining`。
- 事件：`game_started`、`player_moved`、`wall_blocked`、`coin_collected`、`exit_locked`、`game_won`、`game_lost`、`game_reset`。
