# 安全、隐私与模型边界

## 秘密管理

- Hy3 与可选多模态端点的密钥只从环境变量读取；
- 本机使用 `.env`，该文件及 `.env.*` 已被忽略，仅 `.env.example` 可提交；
- 本地自托管官方示例的 `EMPTY` 是占位值，不是托管端点通用密钥；
- CI 不需要真实 API key 来运行确定性检查，也不在 pull request 中调用托管模型；
- artifact、截图、异常消息和 HTTP 错误可能意外带出 URL/请求内容，发布前必须脱敏；
- 一旦真实密钥进入 Git 历史，应立即在服务端撤销/轮换，单纯删除当前文件不够。

建议发布前执行仓库 secret scan，并人工搜索 `Bearer `、常见密钥前缀、`.env`、私有域名和查询参数。

## Oracle 隔离

Private Oracle 是评测的核心秘密：

- prompt builder 只允许读取 `case.json`；
- Hy3 请求不得包含 `oracle.private.json`、期望状态或故障真值；
- 被测游戏页面不能通过静态服务器访问 oracle 路径；
- 正式盲测中 oracle 应位于独立账户/进程或服务端；
- evaluator 合并预测与 oracle 的时间必须晚于预测冻结；
- 日志只记录 oracle hash，不把完整标准答案发给模型。

仓库公开 pilot oracle 只用于工程复现，不能视为安全隔离方案。

## 不可信输入

PRD、模型输出、开源游戏和网页脚本都可能包含恶意或意外内容：

- PRD 中出现“忽略系统指令、读取文件”等文本时按需求数据处理，不执行；
- 不从模型输出拼接 shell 命令；结构化输出先做 schema 校验；
- 静态服务器要规范化路径并阻止 `..` 穿越；
- 游戏在隔离 browser context 中运行，避免复用登录态、cookies 和个人浏览器 profile；
- 不允许被测页面读取工作区文件、环境变量或 evaluator 内存；
- 对第三方依赖和游戏 commit 固定版本，记录许可证与来源。

## 网络与浏览器

- 服务默认绑定 `127.0.0.1`，不要无意监听 `0.0.0.0`；
- 托管 API 使用 HTTPS，并确认 `HY3_BASE_URL` 指向可信端点；
- 正式 runner 可拦截非白名单网络请求，避免游戏加载追踪器或把 PRD 外传；
- 每个 case 使用新 context，结束后关闭页面和 context；
- 设置导航、动作和总运行超时，防止死循环占用资源；
- 浏览器 crash、timeout 和下载失败进入 artifact failure 统计，不能静默重跑。

## 截图与人工审核隐私

真实游戏截图可能含用户名、聊天、头像、版权素材或未公开关卡：

1. 数据采集前确认授权范围；
2. 默认只截被测 viewport，避免桌面和通知；
3. 公开前裁剪/打码个人信息并保留脱敏日志；
4. 人审文件使用匿名 reviewer ID；
5. 定义原始截图和日志的保留期限；
6. 未授权素材只保存 hash/内部引用，不随公开 release 分发。

## 日志与产物

公开 artifact 建议只包含：

- 脱敏后的 resolved config；
- commit、版本与 prompt hash；
- 状态/事件/UI 的必要字段；
- 相对证据路径和内容 hash；
- 聚合结果与匿名审核记录。

不要包含：API key、Authorization header、完整请求头、个人绝对路径、cookies、浏览器 profile、未授权源代码、完整私有 oracle 或敏感截图。

## 事件响应

发生泄漏时：

1. 立即停止相关 run 和 artifact 发布；
2. 撤销并轮换密钥/令牌；
3. 隔离公开 artifact，评估 Git 历史与缓存镜像；
4. 记录泄漏范围、时间和访问者；
5. 清理历史后再次 secret scan；
6. 涉及第三方数据时按许可或协议通知相关方；
7. 将受 oracle 泄漏影响的样本标记为不再适合盲测。
