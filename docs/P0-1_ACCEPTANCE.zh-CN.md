# P0-1 实施与验收记录

日期：2026-11-08。范围为现有静态门户的导航、状态解释、回执恢复和发布资源补齐。**这是本地源码实施、离线检查与内置 Browser 对隔离 QA 夹具的实际验收记录，未部署，未发送任何真实车辆命令。** 浏览器已验证的窄范围见下表；生产、实车与完整产品流程不在本次通过范围。

## 已实现的窄切片

| 项目 | 实现与证据边界 |
|---|---|
| 单一 shell 导航 | `#/operations`、`#/missions`、`#/maps`、`#/fleet`、`#/simulation`、`#/events`；未知路由回到总览。`editor.html` 与 `/twin/` 保留独立入口，没有复制六套页面 |
| 持续状态解释 | 连接、运行模型、无可用目的站、车辆 stale/离线、未决导航请求和操作错误保留明确原因；区分 openTCS API 快照年龄与本页接收年龄，不称机器人 heartbeat |
| 请求恢复 | `fleet-api.js` 在 POST 前持久化完整原始信封，以当前 API 目标划分本浏览器索引；刷新/恢复不自动重发。控制密钥仍仅内存，重开后需重新验证 |
| 回执与关联订单 | `command-receipts.js` 提供原 requestId 的 GET 查询、回执状态和 transport_order 资源关联；显示内核订单与观察时间，不把 ACCEPTED/订单终态当物理停稳 |
| 不确定与失败 | DISPATCHING/UNKNOWN/网络错误/409 冲突/404 缺回执保留原意图；不因过期或“未找到”认定从未发生副作用。REJECTED 与 HTTP 错误分开，受理与执行失败分开 |
| 控制边界 | 普通页面显示 API 目标与当前会话；当前 API 未声明完整 REAL/SIM 身份时不伪造已确认环境。未知/不支持的业务能力保持缺口，不新增 dock/lift/工艺动作 |
| 静态发布准备 | `package_web.py`、Gateway 静态白名单及 `sw.js` 覆盖 12 个公开资源，包含 `portal-state.js` 和 `command-receipts.js`；QA 脚本、配置、Git 与产物 manifest 不作为公开资源 |

## 浏览器与存储支持范围

写入支持可信 HTTPS 或 localhost，并要求 `navigator.locks.request` 和可用本地存储。Web Locks 用于同一 API 目标跨 tab 的原意图协调；服务端仍负责权限、requestId 幂等与执行事实，两者不可替代。

普通 HTTP LAN IP 不是本轮写入支持来源。缺 Web Locks 时保留认证后的 GET 查询，结果仅本页内存、不写共享索引，页面解释只读原因并禁写。存储损坏/不可用时也拒绝新副作用。此支持范围有代码与离线测试依据；本轮已在 loopback 内置 Browser 实测顺序双 tab 协调和刷新恢复，不能外推普通 LAN、并发竞态、键盘或完整可访问性通过。

本地索引不是全站审计：其他浏览器/API 目标分别维护，删除浏览器存储不会删除服务端记录。查询没有重发权限；服务器原回执、关联订单和物理执行是不同事实。当前没有把本地索引提升为完整事件中心或通用资源对账界面。

## 真实 HTTP 合同核对

- POST `/api/v1/commands` 的 HTTP 200 可以是 REJECTED；202 对应 DISPATCHING/UNKNOWN，必须读取回执 `status`。
- create_order 的 ACCEPTED `result` 为 `{id,replayed,order,confirmation}`；pause/resume 的 `result.id` 是车辆 ID，不能拿去查订单。关联订单以 `resource.type=transport_order` 和其 ID 为准。
- GET `/commands/{requestId}` 需要当前控制凭据。404 REQUEST_NOT_FOUND 不证明没有副作用，409 REQUEST_ID_CONFLICT 不允许覆盖旧信封。GET `/orders/{orderId}` 的上游 404 与回执 404 分开呈现。
- 401/403 使控制授权失效；后端已有 key/策略不变。没有新增生产写 API、直接 MQTT/DDS 或机器人控制通路。
- `upstreamAgeSeconds` 表示 openTCS Web API 快照新鲜度；SSE 可连不等于车端安全/定位/地图版本已经就绪。

## 本轮实际检查

| 检查 | 实际结果 | 不能推出的结论 |
|---|---|---|
| Node 合同/状态/DOM 逻辑 | 上一轮最终集成 **42/42 项通过**，包含回执恢复/跨 tab/无锁/存储与 UI 目标关联等回归 | DOM stub/纯函数不是可点击 GUI、布局或浏览器能力实测 |
| Gateway/API+地图现有测试 | `test_api.py`、`test_map_workspace.py`、`test_default_map.py` 上一轮共 **25 项通过**；使用本地 ASGI/fixture，不连上游 | 不是线上部署或真实车控制验收 |
| QA fixture durable tests | 前轮 6 项，本轮补刷新保留/HTTP 计数与显式 reset 两项行为回归，现 `tests/test_preview_p0.py` **8 项通过**；含 10 命名场景、幂等/冲突、认证/两类 404、私有资源、HTML 标识与 SSE | 夹具数据不属于产品，也不证明真实调度/运动或窄屏布局 |
| 实际 loopback HTTP 冒烟 | 临时 ThreadingHTTPServer 仅绑定 `127.0.0.1`；根页/两新模块/model/robots/原 UNKNOWN 回执 GET 均 200，banner/header 与 resource 匹配；未 POST，finally 关闭 | 仅验证本地传输和夹具，未做浏览器交互 |
| 临时静态 bundle + 真实 Gateway ASGI | 12 个资源 byte-for-byte 一致；QA 脚本、config、asset-manifest、`.git/config` 均 404；临时目录清理，未写生产 `web_dist` | 不是部署、缓存升级或离线 PWA 浏览器验收 |
| 内置 Browser GUI（本轮） | 已实际点击六路由，返回 simulation 后刷新保路由；UNKNOWN 提交、第二 tab 恢复/禁写、刷新清 key 保意图和重新认证 GET 查询通过；HTTP POST 总数/该 ID 均为 1，上游请求 0；两种窄屏六路由均完成，详见下表 | 隔离 QA 夹具，不是生产 API/真实动作；不证明完整可访问性或生产链路 |

独立审查闭环包括：机器人资源不误查订单；HTTP 状态与回执/订单状态分离；未决请求的表单锁与所选对象撤单目标分离；storage event 排在在途锁之后，不覆盖已更新的终态回执；无锁查询不写共享索引。对应逻辑回归已纳入上述 42 项 Node 检查；实际 GUI 证据按下表单独记录。

历史阻塞（后续已解除，不是当前验收状态）：2026-11-08 后续重试：用户重启 Codex 并明确继续内置 Browser 验收后，root 在同一地址启动夹具，仅调用一次内置 Browser 打开 `http://127.0.0.1:55231/`；工具仍报告 `saved user permission or managed policy denies`。root 已完成工具要求的结束记录并停止浏览器操作，没有更换 Browser、host 或端口。当时 GUI 实测为 **0 case**；该次结果不改变上述离线检查结论。

CI 配置已改为运行全部 `tests/*.test.cjs`、检查五个 JavaScript 入口/模块语法，并发现运行标准库 fixture unittest（现 8 项）。只修改配置并做本地检查，没有推送或执行远端 CI。

## 可复制的离线检查与本地预览

从工作区根目录执行（现有 Node 与 venv）：

```powershell
$p0Tests = (Get-ChildItem agvapp/tests -Filter *.test.cjs).FullName
node --test $p0Tests
.\.venv\Scripts\python.exe -m unittest discover -s agvapp/tests -p test_preview_p0.py -q
```

从 `Fleetserver` 执行：

```powershell
..\.venv\Scripts\python.exe -X utf8 -m pytest fleet_gateway/tests/test_api.py fleet_gateway/tests/test_map_workspace.py fleet_gateway/tests/test_default_map.py -q
```

需要人工本地预览时，从工作区根运行：

```powershell
.\.venv\Scripts\python.exe agvapp/tools/preview_p0.py --scenario unknown --port 55231
```

打开 `http://127.0.0.1:55231/`；`/__fixture__/` 可切 empty/offline/unknown/accepted/failed/unauth/conflict/missing/rejected/dispatching。只使用页面标明的 `fixture-only-key`，不要输入生产凭据。每个 HTML 注入显著 LOCAL QA FIXTURE，响应有 `X-AGV-Fixture`；没有上游请求或持久数据库。夹具 origin 禁用 Service Worker 缓存，仅服务显式公开资源。Ctrl-C 停止。内存场景和命名请求是 QA 输入，不能加入产品默认数据或作为真实指标。

同一 `?fixture=...` 场景刷新现在保留服务端内存、原 requestId 与计数；选择不同场景才重建该夹具。需要显式清场时，仅夹具控制端点 `POST /__fixture__/reset` 接受 `{"scenario":"unknown"}` 和 `X-Fleet-Key: fixture-only-key`，并核对同源；它不是产品 API，只清夹具内存/计数，不删除浏览器索引。`GET /__fixture__/info` 返回 generation、`commandPostCount` 与 `commandPostsByRequestId`：seed 不计 HTTP POST，重复 HTTP 提交即使幂等仍计入，便于以后真实双 tab 验证“只 POST 一次”。

横幅已改成单行，避免自身换行干扰窄屏观察；这只是夹具准备，不能作为布局验收证据。已完成的真实浏览器范围见下表；测试控制、内存 handler 和静态 CSS 声明不替代未完成的布局或交互结果。

## 交付与未完成边界

本轮未部署，不修改生产凭证/服务/机器人。P0-1 只增加门户骨架、状态解释、本浏览器请求索引和真实只读回执入口；**完整 P0 不勾完成**。

P0-2 的受控地图发布、版本分发/回读与 worker/车端准入仍未做；P0-3 的浏览器场景→正式仿真任务→RTS 路权→异常对账→评价全链仍未做。当前没有新增实时 planned/authorized/executed/资源占用 API、全站历史事件查询、统一 REAL/SIM 切换、生产工艺或载台顶升能力。

产品主方案与整体验收边界见 [PRODUCT_MASTER_PLAN.zh-CN.md](../../PRODUCT_MASTER_PLAN.zh-CN.md)；本记录只作为其 P0-1 实施证据入口。

## 历史内置 Browser 权限问题与反馈复现

环境为 Windows Codex 内置 Browser，目标是仅本机的 `http://127.0.0.1:55231/`（localhost 夹具，无上游转发）。可用上文命令启动夹具，再请求内置 Browser 打开该 URL。用户报告未看到初次 permission prompt，已在设置允许该地址并重启 Codex；重启后对同一地址的一次尝试仍返回 `saved user permission or managed policy denies`，未进入页面或执行 GUI case。期望：已保存的允许设置正确生效，或明确指出阻止该 origin 的具体权限/托管策略及可用处理方式。没有通过换浏览器、host、端口或 CDP 绕过限制。

后续只读诊断已定位具体本地原因：当前 chat 的 `C:/Users/pytho/.codex/browser/sessions/01a1bc0d-ce72-7a20-9dd6-1c8b529ec290.toml` 第 3 行在 `origins.denied` 中保存了 `http://127.0.0.1:55231`；全局 `C:/Users/pytho/.codex/browser/config.toml` 的 `approval_mode="never_ask"`，没有 global denied。交叉只读检查实际安装的 `browser/26.1103.32239/scripts/browser-service.mjs` 第 4563 行，权限决策先返回持久化 conversation deny，再处理 global allow。该会话拒绝优先级足以解释为何全局设置允许和重启没有解除当前 chat 的阻止；不应将此已定位原因写成云端 managed deny，也无法从记录推定用户曾点击拒绝。

反馈补充应包含上述会话记录与决策顺序，并询问：公开支持的入口如何查看、解释和清除这条会话级拒绝，以及为何未显示初次提示却留下该记录。当时尚未查到可清除此记录的公开入口，恢复权限仍未解决；agent 没有编辑任何权限文件，也没有在该次只读诊断中再次访问 Browser，当时 GUI 未验。之后用户自行处理及成功验收见下一节；公开支持的会话权限重置入口仍未确认。


## 本轮内置 Browser 实际 QA（已完成的限定范围）

用户自行清除当前会话的拒绝记录后，root 已在原 `http://127.0.0.1:55231/` 成功操作内置 Browser；此前权限阻塞及“0 case”均为历史尝试，不代表下列本轮结果。这里仅记录实际观察，不将用户操作底层记录描述为已找到公开支持的权限重置入口。截图目录为 [qa-p0-1/](qa-p0-1/)，对应证据链接见下文。

| 场景 | 实际操作与观察 | 结果/边界 |
|---|---|---|
| 六主入口 | 点击 operations、missions、maps、fleet、simulation、events；back 回 simulation 后 reload，路由保留 | 通过；地图发布与完整实验能力仍未接 |
| UNKNOWN 提交 | 两 tab 分别验证 fixture-only-key；tab1 为 AGV-01→B 提交 `7adaf090838c24a68589d2fd35abc18c`，收到 UNKNOWN | 通过；假数据，无真实调度或车辆执行 |
| 第二 tab 协调 | tab2 实时恢复同一意图，发单 disabled | 通过顺序双 tab 未决阻断；不是同时点击竞态证明 |
| 刷新与查询 | tab1 刷新后 key 清除，原 requestId 与目的 B 保留；重新验证后 GET 原回执，显示关联订单 BEING_PROCESSED | 通过；UNKNOWN 仍不能解释为失败或物理完成 |
| HTTP 计数互证 | 独立夹具计数总 POST=1、该 requestId POST=1、upstreamRequests=0；[最终夹具证据](qa-p0-1/fixture-final.json) passed=true | 通过；刷新/查询/第二 tab 未产生第二次 POST |
| 窄屏回执 | tab2 在 375×812、320×740 均实际截图；查询操作实际在 375 完成，320 仅截图长回执；clientWidth 分别为 360/305，均等于 documentWidth | 该视图无横向溢出；不外推全部页面 |
| 两种窄屏六路由 | 320×740 与 375×812 均逐点六路由，h1 对应；document.scrollWidth=clientWidth，分别为 305/360；桌面 1280×900 为 1265/1265 | 通过这些视口的导航与横向溢出检查 |
| 窄屏控件 | 320 地图点击 Vehicle AGV-01 显示 Details；控制对话框全部按钮在屏内，Escape 关闭 | 通过所测点击与单项键盘关闭；不是完整键盘/可访问性验收 |
| 编辑器入口 | 地图与发布→editor.html 真实编辑器→Operations 返回可用；编辑器 320 宽为 305/305 | 入口与横向布局通过，不宣称地图编辑全流程通过 |
| 控制台与结束状态 | tab2 error/warn 日志为空；viewport 已恢复，临时 tab3 关闭，交付 tab4 保留 | 本次未发现业务 bug，未为此次 GUI 验收修改业务代码 |

截图：[桌面总览](qa-p0-1/operations-desktop.jpg)、[320 总览](qa-p0-1/operations-320.jpg)、[375 回执](qa-p0-1/receipt-375.jpg)、[320 发单](qa-p0-1/dispatch-320.jpg)、[320 控制对话框](qa-p0-1/access-320.jpg)。375 事件与对账中实际查询原回执成功。

独立视觉复核：UI agent 已逐张复核以上五张截图，未发现阻断遮挡、横向溢出或按钮不可达；dispatch 下缘需自然纵向滚动，不列为 bug，fixture 横幅文字截断属于 QA 标识而非生产 UI。该复核限定于所列截图。

限定结论：上述浏览器导航、顺序双 tab 未决阻断、刷新/查询及所测视口布局已通过；没有制造同步点击竞态，不声称并发压力通过。完整键盘/可访问性、缓存升级/离线 PWA、生产部署、真实服务与车辆动作仍不在本次验收范围，完整 P0 不勾完成。
