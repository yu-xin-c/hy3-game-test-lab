# Science Lab

## 游戏目标

配出中性溶液，把温度从20°C升到60°C、再降到40°C并装瓶。

## 完整玩法

加入 Acid 后 pH=3；再加入 Base 后 pH=7。按住 H 时每秒升温20°C，松开停止；按住 C 时每秒降温20°C，松开停止。只有 pH=7 且温度=40°C 时 Pour 才成功。

## 胜负与重开

- 按规定混合并在40°C时装瓶获胜。
- 温度达到80°C，或未中和就 Pour，立即失败。
- Restart 恢复空烧杯、pH=7、20°C、加热关闭和菜单。

## 界面与反馈

固定 800×600 视口。HUD 始终显示分数或进度，以及状态 `Menu`、`Playing`、`Won`、`Lost`。菜单、主要游戏区域、终局和 Restart 都要完整可见。

## 固定规则

相同 seed 必须得到相同初始状态和同一时间表。游戏结束后输入不能再改变分数、进度或胜负。所有时间规则使用毫秒，并能由虚拟时间推进。

## 自动测试接口

- 界面类型：canvas2d；主要区域：`#lab-canvas`。
- HUD：`[data-testid="score"]` 和 `[data-testid="status"]`。
- state 至少包含：`status`、`acid_added`、`base_added`、`ph`、`temperature`、`heating`、`cooling`、`bottled`。
- 事件：`game_started`、`acid_added`、`base_added`、`heater_started`、`heater_stopped`、`cooler_started`、`cooler_stopped`、`temperature_changed`、`solution_bottled`、`experiment_failed`、`game_won`、`game_reset`。
- 控件：
  - `START`：mouse 操作 #start-btn
  - `ADD_ACID`：mouse 操作 #acid-btn
  - `ADD_BASE`：mouse 操作 #base-btn
  - `HEAT_DOWN`：键盘 KeyH down
  - `HEAT_UP`：键盘 KeyH up
  - `COOL_DOWN`：键盘 KeyC down
  - `COOL_UP`：键盘 KeyC up
  - `POUR`：mouse 操作 #pour-btn
  - `RESTART`：mouse 操作 #restart-btn
