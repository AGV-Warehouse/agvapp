# 当前页面与用户交互审计

最新整改见 [2026-11-15 操作流程修复](#workflow-fixes-20261115)；此前整改见 [2026-11-15 实施记录](#implementation-fixes-20261115)，原复核见本文 [2026-11-13 全实现审核](#implementation-review-20261113)。下方历史内容按当时范围保留，其“尚未接入”或发布阻断判断不代表当前实现和环境。产品阶段与出口仍以根目录产品主方案为准；固定 pair 的实际 Browser/SIM 结果统一记录在 [pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)。

审计日期：2026-11-08。范围为当前工作区源码与已有验证文档；本次没有打开浏览器、控制机器人、运行 Docker 或重新验证线上 UI。只新增本报告，不修改应用实现。文件行号以本次工作区为准。

## 判断与证据口径

现有系统已具备运输任务表单、车辆/订单查看、暂停/恢复/撤单、草稿地图编辑和独立仿真实验入口。近期应补齐这些流程之间的状态解释与衔接，而不是再做一套重复的任务表单。正式 openTCS—Bridge—Gazebo 实验已有独立验收证据，但它们尚未成为门户里的统一实验产品。

“已有代码”表示存在可追踪实现，不等于本次验收了浏览器表现；“文档环境验证”仅指引用文档所记录的特定环境与场景；“待接”表示未在所查前后端找到完整用户流程。API 存在不等于页面已接入。

当前入口是同源根页面 `index.html` 的四个 `data-view` 视图，以及 `editor.html`、`/twin/`。`/operations`、`/missions`、`/maps`、`/fleet`、`/simulation`、`/events` 是拟议信息架构，不是目前已经存在的六条页面路由。`setView()` 只改变同一 shell 的显示状态，没有建立这些 URL。

## 当前入口与交互清单

证据路径以工作区根为基准；同一行列多个位置表示前端入口、处理或后端边界互相印证。

| 现入口 | 元素与用户交互 | 证据 file:line | 状态 | 应保留或缺口 |
|---|---|---|---|---|
| 根页面导航 | Overview / Vehicles / Orders / Activity；外链 Map editor、Digital Twin | `agvapp/index.html:109`、`:129`；`agvapp/app.js:593` | 已有代码 | 保留统一 shell；拟议六页先映射现有视图，勿宣称路由已上线。 |
| Overview 地图 | 实时 openTCS 点/路径/站点/车辆；平移、缩放、Fit、图层开关、点选 Inspector；Refresh model | `agvapp/index.html:252`、`:378`；`agvapp/app.js:387`、`:560`、`:813` | 已有代码 | 保留只读拓扑与独立栅格底图；缺 planned / authorized / executed 分层及实际路权解释。显示路径不是授权或已走轨迹。 |
| Vehicles / 侧栏搜索 | 搜索车辆、选择车辆，表格显示状态、位置、电量和当前任务 | `agvapp/index.html:145`、`:408`；`agvapp/app.js:84` | 已有代码 | Unknown 电量/速度不应补假值；缺按 real/sim/replay、来源、控制归属、注册状态组织的车队管理。 |
| Inspector Details | 点/路径/站点/车辆属性；车辆显示 reported position、coordinates、battery、velocity、order、processing | `agvapp/index.html:437`；`agvapp/app.js:234` | 已有代码 | 保留选对象查看；增加数据来源/年龄及“为何不可调度”，不能只用 online 一个灯表示可接单。 |
| New order / Dispatch | New order 切到 Dispatch；Vehicle 与 Destination 下拉，起点取车辆上报位置，Send order 提交 | `agvapp/index.html:487`；`agvapp/app.js:728`、`:737`；`agvapp/fleet-api.js:83` | 已有代码，后端真实 create_order | **任务创建不是未实现功能**。目前是一车到一已注册站点的运输意图，不是多步骤工艺任务、取放货或任意坐标任务。 |
| Orders | 表格显示订单 ID、指定/执行车辆、目的地、状态、创建时间；空订单提示 | `agvapp/index.html:530`；`agvapp/app.js:145` | 已有代码 | 缺点击订单后的完整时间线、请求回执关联、执行步骤/等待原因和历史筛选；不要把 BEING_PROCESSED 等同正在移动。 |
| 选中车辆 Withdraw order | 仅选中有上报 task 的车辆可撤单；提交后提示等待车辆反馈 | `agvapp/index.html:476`；`agvapp/app.js:784`；`Fleetserver/fleet_gateway/opentcs_client.py:191` | 已有代码 | 网关仅允许 `fleet-` 创建的订单，使用 `immediate=false`。这是撤单请求，不是急停、确认停稳或立即资源释放。 |
| Pause fleet / Resume | 对 capabilities 中每个 robotId 逐车提交，汇总全部/部分请求接受情况 | `agvapp/index.html:192`；`agvapp/app.js:766`；`agvapp/fleet-api.js:101` | 已有代码 | 保留逐车结果与反馈等待；虽 DOM ID 名为 estopButton，界面动作实际是 Pause fleet，不能标成物理 E-stop。 |
| Control access | 输入 control key、验证后启用当前 tab 控制；End session 回只读 | `agvapp/index.html:598`；`agvapp/app.js:703`；`agvapp/fleet-api.js:94` | 已有代码 | 密钥只在内存，不是有账户/角色管理的登录产品；缺统一失效/重新认证提示和跨页面会话体验。 |
| Activity | 本页连接变化、操作请求/错误的会话记录，最多 40 条 | `agvapp/app.js:54`、`:605` | 已有代码 | 不是持久审计查询或全系统事件中心；应保留轻量即时反馈，再接可筛选的持久事件/证据。 |
| Map editor 草稿 | New/Open draft、Open bundle、Copy live topology、导入 ROS YAML+PGM/PNG、背景叠图 | `agvapp/editor.html:41`、`:59`、`:77`、`:292`；`agvapp/editor.js:492` | 已有代码；范围见地图文档 | 保留现编辑器；Copy live 仅投影可表示部分，不能当完整内核备份。 |
| Map editor 对象 | Select / Point / Path / Station / Block；拖动、重命名/引用更新、删除、Undo/Redo；X/Y 米制、点类型、路径源/终点/限速/锁定、站点关联点、互斥成员 | `agvapp/editor.html:96`；`agvapp/editor.js:269`、`:357`、`:422` | 已有代码 | 路径直线向前且限速 .05 m/s、站点 NOP、Block 单车互斥；没有曲线、载具作业或物理安全校验。 |
| Map editor 保存/验证/历史 | Save draft 带 expectedRevision；Validate 展示错误/警告；Browse revisions 后恢复并另存新修订 | `agvapp/editor.js:319`、`:527`、`:667`；`Fleetserver/fleet_gateway/map_workspace.py:300` | 已有代码 | 显示 revision/unsaved/not published；冲突需重载，缺友好差异比较/合并引导。结构校验不等于碰撞或 commissioning 验收。 |
| Map editor 导出 | Download bundle；Export openTCS JSON；Open bundle 导入新草稿 | `agvapp/editor.html:230`；`agvapp/editor.js:690`；`Fleetserver/fleet_gateway/map_workspace.py:359` | 已有代码；文档记载独立内核导入读回验证 | 保存/导出**不发布**；导出缺车辆、包络、驱动属性。正式发布审批/版本绑定/地图分发/回滚/目的站注册仍待接。 |
| `/twin/` 模式与场景 | live fleet 链接 / simulation 入口；单个已保存场景 Open；选机器人、Add/Remove、Follow、Reset view | `agv-digital-twin/web/index.html:88`、`:99`、`:127`；`agv-digital-twin/web/app.js:501`、`:525` | 已有代码 | 页面明确当前只支持一个 saved scene；不是任意场景创建器，也不是 worker 注册/调度控制台。 |
| `/twin/` 四车 run | 选四个 READY SIM 车、Roundtrips 1/2/3、Start/Stop fleet demo、Reconcile all robots、Run history 与目标/真值样本统计 | `agv-digital-twin/web/index.html:164`；`agv-digital-twin/web/app.js:723`、`:766`、`:798` | 已有代码；文档记载四车执行/取消/恢复验证 | 是独立车道 Nav2 demo，标签明确非 openTCS 调度验证；run 关闭页面后继续。缺通用任务/算法配置、A/B、标准回放与正式调度 run 的统一入口。 |
| `/twin/` 单车与地图诊断 | Go A/B、坐标 X/Y/Heading、Stop；LiDAR/Plan/Trail；SLAM 手动步进采集、命名保存、载入地图/参考图；查 pending/同意图重试 | `agv-digital-twin/web/index.html:223`、`:281`、`:296`；`agv-digital-twin/web/app.js:908` | 已有代码，属于独立仿真控制 | 保留模式隔离、地图来源、sourceId 与所有权；原型 lift 按钮不构成 wafer 载台、高桌对接、buttonTag 或正式升降作业能力。 |

## 提交后的状态与失败交互

| 场景 | 现有处理与后端能力 | 证据 file:line | 应保留或缺口 |
|---|---|---|---|
| 提交 → 等待回执 → 接受 | busy 禁重复点击；命令有 protocolVersion/requestId/issuedAt/expiresAt；ACCEPTED 清 pending，并提示等待车辆执行 | `agvapp/app.js:649`、`:737`；`agvapp/fleet-api.js:35`；`Fleetserver/fleet_gateway/api.py:218` | 保留“接受请求 ≠ 到站”；将请求、内核订单、物理执行分成关联状态。 |
| DISPATCHING / UNKNOWN / 网络不确定 | 非确定拒绝保留同 envelope/requestId；改变车辆/目的地会被 pendingSubmission 阻止；网关提供受保护回执 GET | `agvapp/fleet-api.js:50`；`agvapp/app.js:743`；`Fleetserver/fleet_gateway/api.py:223` | 文案要求查回执，但 Operations 未见专用查询/对账按钮，也未自动调用 GET receipt；内存 pending 刷新即丢，应优先补可恢复的请求详情流，不能鼓励新建第二单。 |
| 错误 / 部分失败 | HTTP error 转可读 message；toast + Activity；批量暂停/恢复列每车接受或失败详情 | `agvapp/fleet-api.js:20`、`:101`；`agvapp/app.js:649`、`:770` | 保留具体反馈；增加 error code/recoveryAction、对象定位和持续状态，避免仅瞬时 toast。 |
| 空模型 / 无目的站 | 地图空态/Setup guide；目的站必须同时存在于配置注册表和未锁定模型站点；模型刷新失败令 modelFresh=false 禁发单 | `agvapp/index.html:363`；`agvapp/app.js:165`、`:195`、`:560` | 区分“有栅格背景”“草稿有点”“已发布可调度模型”；三者不能用同一“地图已就绪”。 |
| 无车辆 / 搜索无结果 / 无订单 | 有独立 empty 文案；不能选不存在的车，发单控件依赖状态 | `agvapp/app.js:122`、`:143`、`:162`、`:171` | 保留；缺指向注册/配置/排错的下一步，勿误给不可用的自动发现按钮。 |
| 离线 / stale | SSE 出错或 10s 无事件置连接失败，旧数据显示 stale；网关检查 openTCS API age 并禁止不新鲜控制 | `agvapp/fleet-api.js:62`；`agvapp/app.js:69`；`Fleetserver/fleet_gateway/opentcs_client.py:115` | 来源是 openTCS Web API 新鲜度，不是车端直接 heartbeat；应分别显示 portal/gateway/kernel/robot/sim worker 故障范围。 |
| 认证失效 | Operations 有效 key 标志仅 Boolean；401 显示错误但无统一自动清 session/重连导引；地图操作需 operator，automation 不可用 | `agvapp/app.js:171`、`:703`；`agvapp/editor.js:105`；`Fleetserver/fleet_gateway/api.py:152` | 现 key 流程不是有 TTL 的账户登录；区分未授权、key 被撤销/失效与 Twin lease 到期。 |
| 不可调度 | 前端禁 offline/stale/paused/无目的站/旧模型；后端再次刷新，缺车/离线/故障返回409，上游不新鲜503 | `agvapp/app.js:198`；`Fleetserver/fleet_gateway/opentcs_client.py:127` | online 尚不代表完整 commissioning/调度资格；展示 integrationLevel、待资源、故障、暂停与本地对账所需信息前，不能承诺“可立即运行”。 |
| Twin 会话到期/旧source | lease 有 expiresAt，控制与地图变更要求 fresh state/source；pending 有查结果/原样重试；run UNKNOWN 有显式 reconcile | `agv-digital-twin/web/app.js:738`、`:824`、`:918`、`:979` | 保留控制归属和停止确认；与门户 operator key 不是同一种会话，不应无提示地互换。 |
| Twin worker offline | 验证文档记载 `/twin/` 离线503页、API JSON503 SIMULATION_OFFLINE，主站仍200；run故障保持中断历史而非重放 | `agv-digital-twin/VALIDATION.md:198`、`:206` | 文档环境验证，不是本次浏览器复测；保留离线入口与后台运行事实，缺统一 worker 健康/来源面板。 |

## 后端能力与尚未接入的产品边界

- Gateway 真实提供 `/api/v1/robots`、`layout`、`model`、SSE `events`、`commands`、命令回执及 `fleet-` 订单查询。create_order 根据配置目的站生成 NOP 运输订单并用 requestId 派生稳定订单名，重复意图核对 digest。暂停/恢复和撤单都有真实 openTCS 调用；不是前端动画。证据：`Fleetserver/fleet_gateway/api.py:200`、`:218`、`:237`；`Fleetserver/fleet_gateway/opentcs_client.py:140`、`:182`。
- 地图工作区真实持久化草稿/修订/栅格，提供导入、结构验证和 JSON 导出，未提供发布到在线 kernel 的完整 API/页面流程。`Fleetserver/docs/MAP_WORKSPACE.zh-CN.md:8`、`:34`、`:48` 明确 M1/M2 与 M3 缺口；其中独立内核导入验证不代表门户发布上线。
- R3b/R3c 的真实正式调度验收已有文档证据：双车实际共享资源互斥、取消、单车真实 MQTT 断连与显式恢复；恢复仅覆盖离起点不超过 .12 m 的区域外故障，不是任意 mid-edge/shared-area/restart 恢复。证据：`agv-digital-twin/VALIDATION.md:310`、`:340`。对应实验报告可含 planned/authorized/executed、resourceOwner、waitReason、sourceAge；同文 `:362` 明确这些 RTS UI 尚未实现。不要把独立验收脚本当成现有可点击产品页面。
- 实时模型投影只返回 points / paths / stations / layers，未返回 blocks/member、车辆资源占用或 planned / authorized / executed 三层。证据：`Fleetserver/fleet_gateway/plant_model.py:36`、`:57`。**地图草稿支持编辑 Block，不等于首页实时 API 已支持路权显示**；R3c 报告字段也没有因此自动接到 production gateway/UI。设计路权面板前须补只读投影和时间/来源合同。
- 网关 observability 当前是按类别轮转的有界 JSONL 日志，未在所查 API 找到历史事件查询。证据：`Fleetserver/fleet_gateway/observability.py:1`、`:28`、`:47`；`Fleetserver/fleet_gateway/api.py:237` 的 SSE 是 fleet 快照，不是持久事件历史 API。因此 `/events` 要接历史查询能力，不能将会话 Activity 或日志文件直接称为统一审计页面。
- 未发现用户可操作的 worker 注册/身份/健康/分配流程，也未发现将真实车、Nav2 demo、正式 openTCS run 和 replay 统一编排的页面。算法版本选择、同场景 A/B 比较、可交互回放应列为待接；现有 run history 不等于已经具备这些能力。
- Fab 高桌 wafer 载台、立牌/buttonTag 和正式 lift 作业属于未来研究。本报告不把原型仿真按钮、NOP 站点或草稿物件解释成这些业务能力。

## 六页增量落位建议（拟议，不是现有路由）

| 拟议页面 | 复用现有交互 | 首先需要增加的产品合同 |
|---|---|---|
| `/operations` | Overview 地图、Inspector、搜索、发单快捷入口 | real/sim/replay 与控制 owner 常显；路径分层、路权 owner、等待原因与 source age；故障影响范围。 |
| `/missions` | Orders 表、现成 Dispatch 表单、选车 Withdraw | 请求回执→kernel order→执行反馈关联；UNKNOWN 查询与显式对账；历史筛选/详情，不重写已有单站运输表单。 |
| `/maps` | 保留 editor.html 与草稿/版本/校验/导出 | 草稿/已发布/机器人实际地图版本分栏；正式发布、影响范围、commissioning、回滚和分发合同完成前不展示可用发布按钮。 |
| `/fleet` | Vehicles 列表和 Details | 资产身份与数据来源、连接/地图/调度资格/控制权；worker 注册与实车 onboarding 是新增合同，不是现有按钮改名。 |
| `/simulation` | `/twin/` 场景与四车 run/history | 保留独立 Nav2 demo 边界，逐步接正式调度 run 的配置、状态、记录与只读回放；提供实验持续后台运行提示。 |
| `/events` | 保留本页 Activity 即时反馈 | 持久事件、按车/订单/run/request过滤、时间线和证据链接；源数据不存在时不伪造统一审计历史。 |

实施顺序建议：先统一状态词汇和详情区（请求/执行、来源/年龄、只读/控制归属），补 Operations 的回执查询与订单详情；再在现 shell 增加可链接视图状态并承接地图/仿真入口；最后按真实后端合同补发布、worker 管理与实验比较。保留 `FleetAPI`、`setView`、现 `navigateForm`、editor 修订机制和 Twin run runner，避免为六页导航重写现有 JavaScript。

本轮没有进行 UI 可用性、响应式或键盘操作现场验收；上述增量建议需用真实环境的任务成功、离线、UNKNOWN、认证失效、无地图和不可调度场景逐项验收。

<a id="implementation-review-20261113"></a>

## 2026-11-13 全实现审核

本轮按四个仓库的当前工作树复核目录、存储、架构、发布、运行、历史投影及网页交互。没有改业务实现、提交源码、部署、重启服务或执行控制命令。固定 pair 的实际网页操作和结果见 [本轮 Browser 记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md#implementation-audit-20261113)，这里记录源码结论、维护风险和本地验证，不建立第二份阶段进度表。

### 审核结论与范围

**当前实现适合继续做限定范围的工程验证，不建议直接作为可交接、可重复部署的发布版本。** 四仓库的职责方向清楚，命令幂等、不可变版本、UNKNOWN 阻断和历史证据保留已有实质实现；主要缺口是不同页面使用了不一致的状态投影、部分持久化缺少崩溃恢复、历史查询容量不足，以及发布来源不能完整复现。

P1 表示发布前应处理的问题；P2 表示会影响日常使用、部署或维护的问题；P3 表示局部工程整洁问题。源码推导风险、本地复现、实际 Browser 观察分别标注。没有因为未见异常就判定安全通过，也没有把既有 SIM 成功记录当成本轮重新运行。

审核基线（开始审核时的 Git 状态；未跟踪项按 `git status --short` 的目录折叠口径计数）：

| 仓库 | HEAD | 已跟踪修改 / 未跟踪项 | 当前发布方面的含义 |
|---|---|---:|---|
| agvapp | e2e4d0a690ef5d982d68988623bdc4acd4e97cda | 8 / 48 | 当前 scene-builder、历史与仿真页面等不全在该提交中 |
| Fleetserver | da4758e（短 SHA） | 25 / 51 | 当前场景、发布、运行、结案等服务不能仅由 HEAD 还原 |
| linorobot-new | 7b145990cecddfe4391735ca5a196937c82119ab | 9 / 4 | 正式 Bridge 当前工作树与提交基线不同 |
| agv-digital-twin | 80b070d6431b62bfeb270206091f1c2d37824f0e | 15 / 45 | pair 环境及 Worker 等新增实现存在于工作树 |

本地清单和验证证据统一保存在 `agv-digital-twin/environments/p0-pair/artifacts/implementation-audit-20261113/`。未读取或输出密钥到审核文档；未覆盖既有失败记录。

### P1-01：失联与已停止被合并，主层会作出没有依据的停机结论

- 位置：`agvapp/src/pages/simulation/environment-ui.js:23`；`Fleetserver/fleet_gateway/sim_environment.py:205`。
- 原因：后端容器检查失败返回 `state=unavailable, running=false, error=...`；前端只判断 `running===true`，将其余值映射为“仿真服务已关闭，不占用仿真 CPU”。`false` 在这个响应中不构成停止证明。
- 影响：操作者可能把主机无法观测理解为计算已经停止；展开诊断后又看到连接失败，主层与证据冲突。控制按钮阻断是另一条逻辑，不能抵消状态文案错误。
- 证据：源码确认；实际 Browser 见本轮验收记录 B01。
- 修复要求：区分运行、确认停止、容器不存在、状态未知/不可达；保留最后可信观测时间。只有权威停止反馈才能显示已关闭或不占用 CPU。增加“检查失败但此前运行”与“确认 exited”两类用例。

### P1-02：故障会话结案没有贯穿任务、事件和回放投影

- 位置：`Fleetserver/fleet_gateway/history.py:110`、`:179`、`:247`；`scene_history.py:249`；`sim_replay.py:16`、`:199`；`sim_session_closure.py:80`；`agvapp/simulation-run-ui.js:175`。
- 原因：结案服务追加 `sessionClosure.status=COMPLETED`，刻意保留原运行失败与物理到站事实；运行详情支持这一状态。但 `run_outcome()` 只读 `completion` 和原 `state`，把原 `ACCEPTED` 投影成 `ACTIVE`；场景档案调用时还剥离了 `sessionClosure`。事件查询白名单忽略 `SIM_SESSION_CLOSED`，回放标签表也没有该事件。
- 影响：同一故障会话在详情中可以结案，在任务统计中仍进行中，事件中心查不到结案过程，回放只能看原始事件。会干扰未完成任务判断和事后复盘。
- 证据：本地调用结案形状的 `run_outcome()` 得到 `ACTIVE`；源码确认；实际跨页面观察见 B02。
- 修复要求：建立统一的“会话已结案、未成功到站”投影并传递结案字段；任务、场景档案、事件、回放和计数共用语义。不能为修 UI 而把原失败改成到站成功，或把 `physicalArrivalConfirmed=false` 改为 true。

### P1-03：Worker 的关键 JSON 原地覆盖，损坏后无法提供恢复诊断

- 位置：`agv-digital-twin/fleet_lab/p0/worker.py:152`、`:156`、`:202`、`:207`、`:213`。
- 原因：`manifest.json`、`applied.json`、`execution.json` 使用 `write_text()` 原地写入，没有临时文件替换及持久化屏障。创建运行进程后，又覆盖 `execution.json` 以补充 PID。构造 Worker 时直接 `json.loads()`，不捕获损坏或不完整文件。
- 影响：写入中断、磁盘满等情况下，已启动运行的所有权 token/PID 记录可能不可读；Worker 下一次启动直接退出，无法通过正常状态入口报告并保守核对。禁止自动重放的设计应保留，但还需要可诊断的失败启动。
- 证据：仅在隔离临时目录写入截断的 `execution.json`、`applied.json`，用替代 baseline 实例化 Worker；两种情况均抛 `JSONDecodeError`。未启动进程、未改运行目录、未做真实断电注入。结果见 `worker-corruption-probe.json`。
- 修复要求：关键记录采用单一事务账本，或至少同目录临时文件、flush/fsync、原子替换与版本校验；进程所有权记录必须能恢复。遇损坏进入明确的不可准入诊断态，保留原文件，不自动生成新意图或清空历史。

### P1-04：历史查询先全量加载证据，再过滤，会阻塞 Gateway 事件循环

- 位置：`Fleetserver/fleet_gateway/history.py:103`、`:208`、`:276`、`:301`、`:335`、`:342`。
- 原因：`rows()` 无 WHERE；事件查询读取并解析整张 `sim_run_evidence`，生成投影后才做搜索、时间过滤、排序和大小限制。`async` 路由直接同步调用 `service.query()`，数据库读与 JSON 解析期间不让出事件循环。32 MiB 的结果限制发生在扫描之后。
- 本地量测：工作区保留的旧 `sim-runs.sqlite` 大小 547,717,120 B；4,329 条 evidence 的 body 总计 538,597,494 B。一个确定无匹配的事件检索仍耗时 3.531 秒。它是本地旧数据，不是在线服务器的容量或性能结果，见 `history-read-benchmark.json`。
- 影响：数据增长后，历史页面的读取可能同时延迟 SSE、健康状态和控制 API；缩小搜索关键词并不减少源表扫描成本。证据保留是必要要求，不能通过删除历史来掩盖这个问题。
- 修复要求：为历史摘要建立可索引投影，SQL 下推时间/身份/类型过滤，按稳定键分页；大证据按需读取。将重查询移出事件循环，并定义归档、容量预警和跨账本备份恢复流程。加入有代表性证据体积下的延迟与并发检查。

### P1-05：运行版本缺少可重建的源码与镜像清单

- 位置：`Fleetserver/fleet_integration/component-versions.json:1`；`agv-digital-twin/environments/p0-pair/Dockerfile:2`；`environments/p0-pair/compose.yaml:4`、`:35`；四仓库 Git 基线见上表。
- 原因：组件清单记录旧提交、模糊的 `working_tree`、Fleetserver 自身 `HEAD` 占位与旧测试计数；新增核心文件未全部入库。pair 镜像依赖 `agv-fleet-lab-r3c:local`、`fleetserver-opentcs` 等本地标签及相邻 robot checkout，没有把本次工作树与镜像内容固定成一个完整发布单元。
- 影响：另一台机器只 checkout 清单中的提交，不能保证获得当前页面与服务；出问题时也无法单靠版本号判定是哪组前端、Gateway、Bridge、Worker。
- 修复要求：先完整审阅并保存四仓库源码，再生成包含精确 revision、dirty patch/额外文件内容摘要、依赖镜像 digest、合同与静态资源摘要的发布清单；提供由干净检出构建到健康检查的可复现入口。当前审计不擅自提交用户工作树。

### P2：交互、路径与维护问题

| 编号 | 问题与证据 | 影响 / 建议 |
|---|---|---|
| P2-06 | `environment-ui.js:25` 每次新状态整体重建 `innerHTML`；`simulation-run-ui.js:187` 仅保留一个诊断 details，5 秒轮询可重建其他展开项。实际见 B03 | 用户正在阅读的环境依据、运行历史会收起；应局部更新并保留所有展开状态及焦点，覆盖轮询中展开、选择、键盘阅读场景 |
| P2-07 | `src/pages/maps/scene-builder/controller.js:18`、`:19` 修改与 undo/redo 总是设置 `dirty=true`；未对比已保存基线。实际见 B04 | 撤销回原内容仍提示未保存并阻挡生成；保存基线与当前规范化内容比较，撤回原状应恢复干净状态 |
| P2-08 | 根 `README.md:9` 的“当前示例有未结案任务”及成功/退役未通过描述，与 `P0-3_PAIR_ACCEPTANCE` 后续 `table-finish-20261111` 结果不一致 | 新维护者会按过期故障说明行动；导航只链接主方案和最新限定验收，旧失败按历史保留；本轮未替用户修改产品阶段 |
| P2-09 | `fleet_lab/p0/scene_worker.py:35` 的路径为 runtime/scene-canonical/64 位 hash/32 位 UUID/robot/...；本次 Windows 测试先报 WinError 206，改到 pair artifacts 下仍在更深文件处超长 | 源文件名本身不等于最终生成路径可用；明确 Worker Linux 容器路径与 Windows 主机测试根约束，预检完整路径长度并给出可操作错误。短根验证因宿主权限不可用，未宣称跨平台已通过 |
| P2-10 | `environments/p0-pair/scripts/connect_server.py:18` 将 SSH 用户/IP 写死，`Fleetserver/fleet_integration/Caddyfile.remote-pair:8` 固定站点；Compose 为 `restart: no`，依赖外部主机和隧道 | 当前限定实验隔离是有意设计，但迁移、换 IP、主机重启需明确操作。把环境身份与可配置地址分离，保留 allowlist/loopback，不因可配置而放宽控制范围；分别说明基础服务恢复和业务显式启动 |
| P2-11 | `Fleetserver/tools/package_web.py:10`、`fleet_gateway/api.py:396` 附近、`agvapp/sw.js:2` 分别维护资源表；SW 使用未带内容 hash 的 URL，逐文件 network-first 更新；package 逐个覆盖目标文件 | 源码推导风险，未现场注入升级断网。资源版本可能混合，新增文件容易漏同步；示例入口也不在 SW 预缓存表中。建议单一资源清单、版本目录/内容 hash、完整构建原子切换，明确离线支持范围；Docker 整体镜像发布应继续保留 |
| P3-12 | `linorobot-new/.gitignore:6` 为 `COLCON_IGNOREbuild/` | 疑似两条规则拼接，不能按预期忽略 `build/` 或匹配 `COLCON_IGNORE`；拆开并用 `git check-ignore` 验证。不能通过清理现有目录来代替修正规则 |

另一个需要统一的主层语义是“未读到”与“没有”：未认证/未完成查询时，运行概览不应把空的前端状态直接解释成“当前版本尚无任务运行记录”。本轮 Browser 现象见 B07，修复时应随 P1-01/P1-02 一并检查 loading、unauthorized、unavailable、empty 与历史状态。

### 文件位置与格式审核

| 类别 | 当前实现判断 | 要求与后续检查 |
|---|---|---|
| 工作区与仓库 | 根目录导航、四独立仓库的划分合理；不能在根用一次 commit 表达全套版本 | 发布清单记录四个精确版本；不要复制一份源码到第五个目录作为“发布源码” |
| 前端分发 | 独立 agvapp 经 `package_web.py` 进入 Fleetserver 的 `web_dist`；白名单限制 HTTP 静态文件，未直接暴露仓库根 | `web_dist` 为可重建产物，不作为源码权威；打包清单与服务白名单应由同一来源生成 |
| 配置与凭据 | 运行配置/密钥置于 ignored runtime；Compose 引用私有配置；实际控制地址主要为 loopback | 不把 runtime/密钥复制进报告或 Git；迁移时由模板生成，明确必填项和部署身份 |
| 账本与证据 | Gateway 使用 SQLite；RunStore 明确 WAL 和 synchronous=FULL；Worker/Bridge 有独立所有权、执行与观测记录 | 发布、任务、场景、命令、Worker 身份和 Bridge journal 要有一致备份范围；普通 JSON 的崩溃安全见 P1-03；容量见 P1-04 |
| 路径约束 | 后端资源 ID、静态路径白名单与备份解包边界已有约束；备份工具拒绝 `..`、绝对路径、反斜杠、链接、Windows 保留名和大小写重复 | 继续以不可变 ID 定位文件，人类名称只用于展示；覆盖用户中文名称、跨平台编码及最终生成路径长度。当前没有认定一般路径穿越漏洞 |
| 实验输出 | pair 脚本/配置/验收输出集中于现有 p0-pair，artifacts 与 runtime 忽略规则已存在 | 本轮只新增该 artifacts 子目录；保留所有失败证据，不清理既有数据库、journal、日志 |
| 文件名与扩展名 | 本轮源码清单未发现需要整体重命名的特殊路径；Python、JS、JSON/YAML 和 zh-CN 文档命名可辨识 | 不建议为了“统一格式”搬动全部目录；优先修完整路径长度、编码、原子写和版本可追溯性 |

`agv-digital-twin/tools/worker_backup.py` 的安全解包能力值得保留，但它针对旧 Twin runtime 的备份格式；不能把该脚本存在解释为当前 Gateway 多账本 + 固定 pair Worker + Bridge journal 已完成整套恢复演练。本轮未执行真实恢复演练。

### 架构判断

| 层 | 当前职责 | 审核建议 |
|---|---|---|
| agvapp | 产品交互、草稿编辑、状态展示、历史与回放入口 | 保留门户；从 controller/render 中分离统一领域状态投影和可复用视图。不要让每个页面自行解释 ACCEPTED、settled、sessionClosure |
| Fleetserver | 管理合同、认证、命令幂等、版本与运行账本、openTCS 适配、历史投影 | 当前服务拆分方向合理；保持一个业务意图一个身份。重查询隔离、持久化和统一结果合同优先于增加抽象层 |
| linorobot-new | 本地控制/Nav2 与正式 Fleet Bridge | 保留执行身份、journal、未知状态保守阻断；本轮仅源码复核，不声称 ROS 构建或实车通过 |
| agv-digital-twin | 场景编译、Gazebo、Worker、观测与实验 | 应独立于生产控制；明确 host agent、Worker、运行进程和观察器各自生命周期，恢复基础设施不等于恢复任务 |

实现没有必要推倒重写，也没有依据建议改 openTCS 内核。应先统一跨页语义、修可靠存储与查询成本，再整理重复的资源清单和渲染方式。

维护成本方面，`agvapp/app.js` 为 1,233 行、`editor.js` 为 1,107 行；部分新增 controller/render 将多个状态转移及大段模板压在一行。问题不在行数本身，而是错误分支、异步失效与 DOM 生命周期不易单独审查。适合按 API 状态、领域投影、视图渲染拆开并格式化；不建议在状态合同仍不一致时大规模换前端框架。

认证已有 operator/automation 分工、内存会话、部署身份核对与查看器边界，但不是人员账户、岗位权限与个人责任审计体系。如果目标从限定工程实验扩大为多生产人员日常运行，需要另定义读/控权限和人员追溯。当前没有据此假称存在公网入侵问题，也没有执行渗透测试。

### 本轮验证结果与限制

| 检查 | 本轮结果 | 解释 |
|---|---|---|
| agvapp Node 测试 | 258 passed | 本地当前工作树；不等价于真实浏览器全部交互通过 |
| Gateway 非 asyncio 子集 | 178 passed，222 deselected | `-m 'not asyncio'`；完整异步测试在此 Windows 受限环境的 socketpair 建立处阻塞，已中止，不宣称全套通过 |
| fleet_lab 测试 | 260 passed，4 failed，1 skipped | 三个失败为 socket WinError 10013；一个为路径过长。重测与原失败均保留，未把环境失败隐去 |
| Twin 顶层 tests | 排除 test_maps 后 59 passed | 完整收集因缺 numpy 失败；未临时安装依赖或改锁文件来制造通过 |
| Python 语法 | 201 个文件通过 compile | 不写 pyc，不代表 ROS 依赖/运行时验证 |
| JS/CJS 语法 | 57 个文件通过 node --check | 独立于页面行为和接口语义 |
| 管理合同导出检查 | export_contracts.py --check 返回 0 | 本次合同文件一致性检查 |
| Worker 损坏记录探针 | 两种 JSON 损坏均使初始化异常 | 隔离目录，无运行进程与真实故障注入；属于问题复现 |
| 历史读取量测 | 本地旧账本无匹配查询 3.531 秒 | 不代表当前服务器性能；确认全量扫描成本 |
| 实际 Browser | 见 P0-3 本轮记录 | 包括六工作区、回放、两个编辑器、示例入口、刷新、详情、部分窄屏；没有新增业务控制意图 |
| 实际 SIM / ROS 镜像构建 / 实车 | 本轮未执行 | 在线上游不可达，且本轮是独立审核；历史成功不能替代本轮运行验收 |

无法使用当前终端直接 SSH 核对服务器文件和数据库；浏览器能访问门户。因此本轮没有证明线上每个静态文件/服务模块与本地工作树逐字一致，也没有用服务器 SQL 前后对比证明业务计数不变。在线缺陷依赖可见页面证据，本地根因依赖当前源码，两者的边界保留。

### 发布复核出口建议

下一次发布评审应看到：P1-01/P1-02 跨页面一致的状态证据；P1-03 损坏/中断后的保守可诊断恢复；P1-04 在目标保留量下不阻塞实时接口；P1-05 从清晰版本清单构建并核对资源。随后在允许控制的固定隔离场景中，按 Browser 正式入口验证发布、开始、撤单、结案和正常退役，再单独记录实际 SIM 结果。此处是本次审核的复核条件，不替代产品主方案或扩展为任意场景、实车及生产安全结论。


<a id="implementation-fixes-20261115"></a>

## 2026-11-15 审核整改记录

在四仓库原工作树上实施，修改前摘要保存于 pair artifacts/implementation-fixes-20261115/before-source-hashes.json。未提交、推送或覆盖既有改动。以下记录对应源码整改，不将 11 月 13 日 Browser 缺陷直接改写为线上已通过；当前实施状态由产品主方案第 4 节统一维护。

| 原问题 | 本轮实现 | 复核边界 |
|---|---|---|
| P1-01 | 不可达/未知不再映射为已关闭；只有无错误且明确 exited/dead/created 才显示停止 | Node 回归覆盖 unavailable 与 exited；实际 Browser 待复验 |
| P1-02 | 新增 CLOSED 历史结果，保留未成功到站；场景档案传递结案，事件收录 SIM_SESSION_CLOSED；回放投影版本升至 2 | 任务及场景档案同步测试通过；回放新增异步测试，受环境阻断未运行通过 |
| P1-03 | UTF-8、flush/fsync、同目录原子替换；损坏、缺失配对和残留 pending 文件进入恢复诊断并阻断写操作 | 截断 JSON、替换失败、配对缺失均有隔离回归；未做真实断电/磁盘满注入 |
| P1-04 | 独立只读线程、增量精简证据缓存、派生 SQLite 筛选索引，保留稳定快照分页 | 约 548 MB 旧库首次 2.1337 秒，后两次 0.1000 / 0.0949 秒；业务表未迁移或删减。尚未完成线上并发负载和长期归档演练 |
| P1-05 | 四仓库源码快照、逐文件摘要、可执行位、基线提交与 dirty 状态、镜像身份字段、校验 CLI | 源码可冻结重建；Docker 不可达，输入/输出镜像和线上部署核验仍待完成；不将旧 HEAD 清单冒充完整发布 |
| P2-06/07 | 轮询保留详情展开及对应焦点；scene dirty 与已保存基线比较，undo/redo 可回到干净状态 | 前端回归通过；实际键盘、焦点和 Browser 再验待环境恢复 |
| P2-08/09/10 | README 改为指向唯一状态入口；Windows 扩展生成路径；受限校验的可配置 SSH/HTTPS 地址 | 原长路径失败测试已通过；迁移真实服务器地址未执行 |
| P2-11 | 单一 web-assets 清单、staging 打包/保留 previous、注入资源代号、SW 验证整组 hash 后安装并等待旧页退出 | 打包和缓存混合版本拒绝测试通过；未执行线上断网升级/回滚 |
| P3-12 | 拆开 COLCON_IGNORE 与 build/ 忽略规则 | 仅规则修正，未删除现有目录 |

本轮测试分别为 Node 263 passed；Gateway 非 asyncio 186 passed（223 deselected）；fleet_lab 266 passed、1 skipped、3 个 loopback 测试 deselected；新增连接配置 6 passed。这些数字来自不同测试范围，不相加或折算成 SIM/Browser 通过率。失败初跑、路径错误和最终复测均保留。证据位于 pair 的 artifacts/implementation-fixes-20261115/。

发布阻断：当前 SSH 到服务器返回 Permission denied；Docker Desktop Linux engine 管道不存在；当前会话无浏览器控制工具。因此未重启服务、未替换线上镜像、未发单、未改变仿真环境。下一次正式验收须从 Browser 进入，尤其复验 B01—B04、旧缓存升级、刷新/双页不产生意图以及正常退役。原始失败和历史验收保留。

<a id="workflow-fixes-20261115"></a>

## 2026-11-15 操作流程修复

本节记录随后面向操作者流程的实施变更与本地前端验证，保留前述审核及当时的发布阻断事实。部署身份、实际页面观察、发布、任务、撤单、停止与退役结果统一见 [固定 pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)；本节不复制实际运行结果，也不以源码或单元检查代替 Browser/SIM 验收。

| 流程问题 | 本轮实现 | 保留的行为边界 |
|---|---|---|
| 无法取得主机状态时，操作者可能误认为仿真已关闭 | 环境主层区分未知、不可达、未找到容器和确认停止；未知明确显示“尚未确认停止”。准备服务按钮的禁用原因与下一步直接可见 | `running=false` 与错误同时出现不构成停止证明；页面不据此宣称不占用计算资源 |
| 准备服务失败依赖操作者自行执行复杂命令 | 网页按连接中断、运行环境未就绪、容器缺失或身份不匹配分别解释；正常连接提示为确认仿真电脑开机、登录后等待准备并刷新，持续故障联系维护人员 | 首次安装、维护与日常网页操作分开；网页不承诺启动已断电的电脑，也不自动恢复任务 |
| 未授权或尚未读取运行时，空面板被解释成“没有运行” | 单次任务右栏及历史空列表区分未授权、读取中、尚未读取、读取或核对失败、已读取且无记录；缺少有效 `runs` 数组的响应不能被当作空目录 | 只有已确认的读取结果才显示无记录；读取和刷新不产生新业务意图 |
| 审阅后轮询改变当前对象，确认动作可能作用于另一任务或发布 | 撤单绑定原 Run、订单、车辆、版本与执行源；两处停用发布入口绑定原发布身份。环境四类停止/结案动作先在页内审阅，保存 `controlContext`，确认时携带 `expectedContext`，服务端在锁内重新核对 | 目标、权限或上下文变化须重新审阅；旧请求仍按原身份查询，不重放。普通撤单、关闭观察器、关闭仿真计算和故障结案分别说明 |
| 明确拒绝原因被随后的状态刷新抹掉；发布拒绝后又被要求执行不可用的停用 | 保留本次拒绝提示。`REJECTED_EXECUTION_UNCONFIRMED` 明确说明发布未通过且执行停止尚未确认，提供刷新核对或审阅“停止仿真计算（保留未结案）”的下一步 | REJECTED 本身不代表停止；该分支正常关闭仍需当前 Worker 停止证明且无未结案 Run，不把拒绝改写为正常退役 |
| 工作台难以找到停用入口，已退役版本的再次发布按钮只禁用不解释 | 增加“查看并停用当前发布”，直接进入场景编辑器第 3 步；已用版本说明“新建生成方案 → 生成 → 确认新版本 → 审阅发布”；未通过准入的发布也可返回工作台核对车辆与任务 | `step=simulation` 只切页并读取状态，不自动生成、冻结、发布或执行；旧版本与运行记录保留 |
| 已发布但准入失败仍提示“等待场景发布” | 区分等待发布、已有发布结果待核对、车辆准入尚未通过及真正就绪 | 历史 READY 不等于当前可发任务；不引导对未知结果重复发布 |
| 自定义路线场景显示了本就不支持的停稳故障恢复按钮，撤单后缺少完整收尾路径 | 依据 Run 持久 `profileId` 或与原 `releaseId` 精确对应的版本资料识别 `scene-routes-pair-v1`，隐藏该恢复按钮并在控制器阻止误调用；未结案撤单/失败任务显示“停止计算 → 结案 → 准备空闲仿真服务 → 停用原发布 → 关闭服务”。结案完成后的环境提示继续说明剩余步骤，并绑定原发布 | 不按场景名、车辆名或目录顶层默认 profile 推断；保留 canonical 固定 pair 的原恢复入口。准备空闲服务不恢复原世界或任务；未成功到站及历史证据保留 |
| 故障结案已进入回放时间线，却不能从关键事件选择框定位 | 将原 `SIM_SESSION_CLOSED` 事件纳入“停稳与任务收尾”分组，可直接定位其原记录时间 | 沿用“故障会话已结案，未成功到站”的含义，不修改历史投影、原时间或到站事实 |
| 历史回放仍出现全局实时反馈中断横幅 | 进入回放立即隐藏 `staleBanner`，实时刷新期间保持隔离；退出回放恢复当前真实连接状态对应的横幅 | 只改变历史页面的提示可见性，不停止实时观测、不改写状态，也不隐藏返回实时控制后应见的异常 |
| 恢复与环境控制锁顺序相反；状态响应可能混用旧显示与新控制上下文 | 后端统一 Run → Publication 锁顺序，以已持锁观察方法避免重入；异步探测结束后用同一业务快照生成显示字段、操作条件与 `controlContext`，变化时撤销旧准入和停止证明 | 并发检查和旧请求幂等分别核对；不将内部一致性检查扩大为实车或任意外部操作并发安全结论 |

对应实现主要位于 `src/pages/simulation/environment-ui.js`、`simulation-run-ui.js`、`map-release-ui.js`、`src/pages/maps/scene-builder/publication-ui.js`、`src/pages/maps/scene-builder/workspace.js`、`app.js` 与 `replay-ui.js`，并与 Gateway 环境控制、发布、Run 和故障结案合同配套。

### 本地前端验证

第三版前端执行 `node --test tests/*.test.cjs`：**276 passed，0 failed**。空态、回放横幅与结案定位补丁的定向检查为 69 项通过，已包含在该完整运行内。随后第四版补充自定义路线场景的收尾引导与原 profile 门控，完整 Node 结果为 **279 passed，0 failed**；新增覆盖原 profile 与原版本精确匹配、禁止不支持的恢复接口、canonical 入口保留及结案后原发布指引。不同版本的数字与定向子集合不相加。

日志保存在 [完整 Node 结果](../../agv-digital-twin/environments/p0-pair/artifacts/workflow-audit-20261115/frontend-v3-full-node.txt) 与 [最后三组定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/workflow-audit-20261115/frontend-v3-browser-findings-node.txt)。这些是本地组件、控制器与离线 DOM 检查，不证明实际服务健康、车辆停稳、成功到站或整个浏览器流程通过；实际结果仍仅见 [pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)。

第四版完整结果见 [279 项 Node 日志](../../agv-digital-twin/environments/p0-pair/artifacts/workflow-audit-20261115/frontend-v4-full-node.txt)。本节只记录实现与本地验证，不在此重复实际撤单、结案或退役结果。

### 第四版当时的更新流程限制

Service Worker 会继续为已打开的旧标签页提供该代已校验的整组资源。部署后普通刷新不保证切换到新代；当前需要关闭该站点的所有旧标签页后重新打开。**页面尚无“新版本可用”提示或一键更新入口**，交接时仍需明确说明这一操作。此限制保留，不把后端或静态文件已更新等同于操作者当前页面已更新。

### 2026-11-15 网页版本提示与显式更新

后续 A 版增加网页版本入口：只在整套公开资源逐项 SHA-256 核对通过后提供更新；“一键更新此页”才激活等待中的版本并重新载入当前页。标签页、嵌入编辑器、动态资源与导航按页面版本固定；新 SW 保留旧代缓存，其他标签页的草稿和撤销记录留在原页。旧代资源缺失时不回源混用新版，提供网页内完整重下载；错误编辑 iframe 只关闭并返回所属工作台更新，不单独切代。

当前页及其编辑器在更新前、切换确认后分别核对未保存场景、未应用属性/工位、底图校准草稿、保存/生成/发布/环境操作与原请求状态；未就绪时给出先保存、核对或关闭编辑器的下一步。更新保留原路径、场景参数和回放路由，不保存连接密钥、不自动恢复权限、不重放业务请求。打包给脚本/样式增加 SRI，首次未受控页面必须完成整代校验并明确进入工作区；不自动接管未响应的旧文档。下载或校验失败保留旧版本并可重试。

B 版把短版本标识收进详情，主摘要改为业务文字；后续由支持标记的版本明确更新后，消费一次性页面标记，显示更新完成、权限需重新验证，并将焦点返回版本摘要。普通旧链接和 referrer 不推断为更新成功；标记只用于表现层反馈，不是授权或业务审计回执。**A→B 的 A 端尚无该标记，因此本轮成功确认与焦点增强仅经单元检验证，未宣称实际 Browser 覆盖。**

本地验证分别为 A 版完整 Node **304 passed**、生命周期定向 **27 passed**（前者子集）；B 版完整 Node **307 passed**、生命周期定向 **30 passed**（前者子集）；打包定向 **2 passed，31 deselected**。日志见 [A 完整 Node](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-A-final-node-full.txt)、[B 完整 Node](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-B-final-node-full.txt)、[B 生命周期](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-B-final-lifecycle.txt)、[打包检查](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-A-packager.txt)。这些数字不相加，也不替代 SIM/Browser 结果。

首次从没有更新协议的 v4 迁移仍需维护时关闭该来源旧页面后重新打开；普通刷新不能承诺引入 A。新协议遇到未响应或未确认版本的旧页会明确阻止切换。旧代缓存暂不自动回收，以保护休眠页和编辑 iframe；缓存被浏览器清除时走显式完整版本恢复。实际部署、A→B 切代、路由、双标签页、未保存 iframe 及业务意图检查统一见 [固定 pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)，本节不复制实际运行结果。

随后 Browser 暴露的历史请求索引与 GET 轮询误阻断由 C 修复：发布使用原请求身份与已解析状态，Run 使用原运行身份及结案/停稳封存结果（原始 `ACCEPTED` 也可已结案），方案使用原执行身份与未完成控制标记；保留的历史句柄不等于未决操作。前端单独按实际 HTTP method 计数写请求，持续 GET 与回执查询不再长期挡住更新；业务写入、未知原命令与草稿仍受保护。C 完整 Node **315 passed**，关键子集 **120 passed**，见 [完整结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-C-final-node-full.txt) 与 [定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-C-targeted.txt)。

D 增加实际可操作的核对入口：手动“检查更新”即使没有新版，也会检查当前更新准备状态；存在未决事项时提供前往原发布、单次任务、作业方案、环境操作或命令回执的按钮。入口沿既有路由显示并展开原区域，只允许已有只读加载；编辑 iframe 未关闭时保持原草稿并要求经原保存/返回流程处理，不能借入口绕过关闭保护。跨路由先显示目标再定位，从历史回放进入核对会明确退出回放。D 完整 Node **318 passed**，更新/工作台/SW 定向子集 **48 passed**，见 [完整结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-D-node-full.txt) 与 [定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-D-targeted.txt)。C→D 实际切代、成功提示和核对入口结果仍仅由 [pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md) 记录，不以这些单元数字替代。

E 修复作业方案默认初始化被误认为未保存编辑：更新保护独立比较本地表单与已确认基线，自动默认值、默认车辆行不算用户编辑，实际改动及改回原值分别阻断/解除；原有“尚未保存不能冻结”语义保留。原执行尚未恢复时禁止编辑未绑定默认表单；普通读取不清除实际输入，失败保存保留修改，已确认 PUT 后的读失败不会抹去保存事实。完整 Node **324 passed**，scenario/update/app 子集 **57 passed**，见 [E 完整结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-E-node-full.txt) 与 [真实挂载等定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-E-targeted.txt)。

F 增加作业方案页内“放弃未保存修改 → 审阅 → 确认恢复原内容”：取消保留输入，确认只深拷贝本页基线，不写服务端、不清原执行或持久请求索引。审阅绑定当前输入、基线、实际方案身份/修订、本地绑定、部署范围、权限修订和原执行身份；再次输入、晚到不同身份或已确认保存都会使旧确认失效。同身份只读刷新不取消有效审阅，输入保持焦点时也同步隐藏失效确认并显示说明。完整 Node **331 passed**，scenario/update/app 子集 **64 passed**，见 [F 完整结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-F-node-full.txt) 与 [F 定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-F-targeted.txt)。本节只记录实施和本地检查，E→F 的实际网页更新及放弃修改结果仍统一见 [pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)。


G 修复多页版本握手把 `WindowClient.url` 创建地址误当当前地址的问题：页面启动后的 `history.replaceState` 不改变该创建地址，故以逐页面独立消息端口核对协议、当前文档与内嵌版本的一致证明及整代完整缓存；同源页面白名单、二次页面清单检查、旧代资源保留和当前页草稿保护不变。未响应、旧协议、当前版本不一致与旧代缓存缺失分别给出原因。完整资源恢复也改用错误页的即时恢复身份，安装前后分别复核，只有顶层恢复页自身可豁免原损坏缓存；其他页面仍须通过正常核对，iframe 不能独立恢复切代。

G 完整 Node **339 passed**，SW/update/app 子集 **56 passed**，见 [G 完整结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-G-node-full.txt) 与 [G 定向结果](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-G-targeted.txt)。回归执行真实更新脚本，模拟创建地址未带版本而当前父页、未保存编辑 iframe 和干净第二页已经固定版本；保留 [修复前确定性失败](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/frontend-update-G-creation-url-before.txt)。恢复身份伪造、晚变更与缓存丢失仅为离线单元覆盖，未宣称实际 Browser 通过；实际 E→G 更新、其他页草稿与撤销、F 的放弃流程结果仍只记录于 [pair 验收记录](P0-3_PAIR_ACCEPTANCE.zh-CN.md)。
