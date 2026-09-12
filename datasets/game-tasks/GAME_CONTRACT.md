# 生成要求

每道题都要生成一个可以独立打开和完整游玩的浏览器游戏。只输出以下四个文件：

- `index.html`
- `styles.css`
- `game.js`
- `game.manifest.json`

游戏固定使用 800×600 视口，不加载网络资源，不依赖 CDN、字体服务、远程图片或后端接口。玩家操作必须来自真实的键盘、鼠标、触控或摄像头画面。

带复杂环境的题目遵守以下约定：

- 3D 题使用原生 WebGL 和本地生成纹理。
- 多人题由评测器打开两个同源页面，只能通过 `BroadcastChannel` 在本机同步。
- 摄像头题使用 `getUserMedia`；评测器授予权限并注入固定假视频。
- 存档题使用 `localStorage` 或 IndexedDB，评测器会真实刷新页面检查恢复结果。
- 排行榜只统计题目声明的本局或本地成绩，不访问服务器。

`game.manifest.json` 必须严格使用下面的结构。数组内容按题目实际要求填写，不能改用 `schema`、`entry`、`interface`、`pages`、`status_fields` 或 `event_types` 等简写字段。

```json
{
  "schema_version": "gametestlab.game-manifest.v3",
  "entry_path": "index.html",
  "surface": "dom",
  "viewport": { "width": 800, "height": 600 },
  "controls": [
    {
      "action_id": "START",
      "actor": "primary",
      "device": "mouse",
      "key_event": "press",
      "selector": "#start-btn",
      "description": "开始游戏"
    }
  ],
  "hud_selectors": {
    "score": "[data-testid=\"score\"]",
    "status": "[data-testid=\"status\"]"
  },
  "state_schema": {
    "fields": {
      "status": { "type": "string", "description": "当前状态" }
    },
    "required": ["status"]
  },
  "event_schema": [
    {
      "type": "game_started",
      "description": "游戏开始",
      "payload_fields": {}
    }
  ],
  "bridge": {
    "protocol": "gametestlab/2",
    "evidence_only": true,
    "actions_via_real_input": true
  }
}
```

`surface` 按题目填写 `dom`、`canvas2d` 或 `webgl`。每个控件都要写成对象，并与题目中的 `action_id`、`actor`、`device`、按键、selector、坐标或摄像头帧完全一致。`hud_selectors` 至少包含题目给出的 `score` 和 `status`；`state_schema.fields` 与 `event_schema` 必须覆盖题目要求。除字段定义允许的内容外，不添加额外顶层字段。

游戏要提供只读观察接口 `window.__GAMETESTLAB__`，协议为 `gametestlab/2`：

- `isReady()`：游戏是否完成初始化。
- `reset({seed})`：按固定 seed 恢复菜单状态；每次调用增加 `event_epoch`，并重新从 `seq=1` 记录 `game_reset`。
- `observe()`：返回 `tick`、`status`、`state`、`event_epoch` 和 `latest_event_seq`。
- `getEvents({afterSeq})`：返回当前事件周期中序号大于 `afterSeq` 的事件。

`status` 只能是 `menu`、`playing`、`won`、`lost`。事件序号从 1 连续递增，状态和事件必须是可序列化的普通 JSON。观察接口不能提供代替玩家操作的方法。所有时间逻辑必须由 `Date`、`performance`、timer 或 `requestAnimationFrame` 驱动，以便评测器用虚拟时间重复执行。
