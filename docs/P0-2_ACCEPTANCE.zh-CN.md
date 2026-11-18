# P0-2 隔离地图发布与准入验收记录

日期：2026-11-08（运行事件时间保留服务端 UTC，部分为 2026-11-09）。状态：**P0-2 单一固定 canonical 隔离 SIM 切片通过。** 主验收者已完成实际内置 Browser 的草稿编辑、冻结、发布、实时准入、刷新恢复、异常保守处理及修复后的正常停用。本文是本切片唯一的前端与浏览器验收记录；产品总索引仍为[产品主方案](../../PRODUCT_MASTER_PLAN.zh-CN.md)。历史 READY 不等于当前准入，停用后页面应为未准入状态。

## 范围与入口

- 产品目标与阶段出口：[产品主方案](../../PRODUCT_MASTER_PLAN.zh-CN.md) 第 8、9、19、20 节。
- 后端合同：[SIM 发布协议](../../Fleetserver/docs/SIM_PUBLICATION.zh-CN.md)。
- 当前环境唯一入口：[environments/p0-sim](../../agv-digital-twin/environments/p0-sim/README.md)。Gateway `127.0.0.1:55231`、专用内核 `55212`、Worker `55232`。
- 本轮临时运行日志、截图与证据统一位于 [环境 artifacts](../../agv-digital-twin/environments/p0-sim/artifacts/)，不把密钥或 Worker 凭据写入本文，不移动 P0-1 历史证据。

仅支持后端明确配置的 `p0-sim / empty-crossing-v1 / LAB-01`。不向 REAL 发布，不实现任意建筑图的物理场景生成，不启动 P0-3 实验任务，也不实现对接、顶升或交接动作。

## 本轮实现

同一 shell 的地图页提供：读取实际配置和草稿 → 从隔离 SIM 导入现图 → 选择已保存修订/跳入现编辑器 → 登记资料与可增删假设 → 校验冻结不可变版本 → 明确选择隔离目标 → 一次发布与持续只读回读 → 显式证据重核或停用换版。

占据图 frame、分辨率和原点读取真实保存元数据；用户只登记资料来源、配准依据、背景版本与假设。hash 使用短摘要并可展开完整值。修改画布仍由既有编辑器保存修订与冲突机制处理，不重写绘图算法。

`currentAdmission` 是后端实时核对结果，车辆与实验页共享此来源；历史发布 READY 只作为历史记录。发布身份在 POST 前保存，刷新只查询原 ID，UNKNOWN/404 不自动重放或回退。READY 换版前须先显式停用；UNKNOWN 可申请停用，但真正许可由后端与 Worker 的停稳、订单及版本证据裁决。

API 请求 URL 与本地 ledger scope 分开：显式部署先 GET capabilities 确认稳定 deploymentId；旧未声明连接/其他部署记录保留只读历史，不删除、不迁移、不向新部署查询，不阻断新部署的请求。发布台在 scope 确认后初始化；写入或回执操作进行中不切换范围，公共背景/模型 GET 不阻断首次身份确认。

## 离线检查

当前代码冻结检查：**66/66 Node 测试通过**；前端 JavaScript 语法检查通过，Git diff 检查无空白错误（仅 CRLF 提示）。已覆盖的关键回归：

- 4 类管理命令的持久信封、认证、UNKNOWN、404/409、跨页锁和只读回执查询。
- 部署身份确认、旧历史保留、新 scope 隔离、在途写入/回执保护、生产 API 与 shell 并行公共背景读取的初始化。
- 冻结输入与阻断假设、明确隔离目标、发布前持久 ID、刷新 GET、不确定结果和部分发布事实、历史记录不解锁实时准入。
- 显式 verify/retire、READY 先停用再换版、新准入版本变化只 GET 刷新导航目的站和运行模型。
- 配置核验摘要与含运行反馈的完整观测摘要分开，旧版本缺少配置摘要时不推算替代；冻结提示随提交/核对阶段更新，不把首发受理当作就绪。
- 仅显式 `sim-publishing/publications/{id}/retire` POST 的客户端等待预算为 45 秒，留出 Gateway 的 35 秒停用核验预算；普通命令和 GET 仍为 15 秒。没有增加自动重试，超时仍须核对原记录。
- 已使用执行版本的一次性 guard：除仅预检 REJECTED 外，已有 publication 历史的 release 不能以新 requestId 再次发布。控制器在新请求/存储副作用前拒绝，选择/发布按钮禁用，提示重新冻结草稿生成新版本；历史查询保留。该末次 guard 只有定向控制器与界面渲染回归，没有新增 GUI 或新世界验收。

测试中的 DOM harness 是离线状态/事件模拟，不证明浏览器布局、键盘行为或真实 ROS 执行通过。

主验收者汇总的后端检查为 **61 项通过**（含末次 release 复用 guard），Worker 检查为 **11 项通过**；它们与上述 66 项 Node 检查分别统计，不相加冒充浏览器用例。实际浏览器、执行环境与停用结果见下一节。

## 实际浏览器与运行证据

下列状态由主验收者的实际内置 Browser 观察提供，截图另经独立只读复核；不把未执行的任务运动或实车场景计入通过。

| 检查 | 当前结果 | 证据或剩余工作 |
|---|---|---|
| 实际隔离 Gateway 与草稿读取 | 通过 | 实际 `55231`、专用 `55212` 与 `55232`，不是 P0-1 fixture；仅当前固定 canonical SIM |
| 编辑器指定草稿/修订 | 已观察 | 认证后打开保存草稿；主验收者将 `L-STAGE-L-WAIT` 速度由 0.05 改为 0.04 并保存 r3，名称 `P0-2 Browser NPI validation`，交通块保留 |
| Objects 目录误触修复 | 已观察通过 | 942×831 下对象区滚动与 footer 分离；[修复前](../../agv-digital-twin/environments/p0-sim/artifacts/editor-sidebar-overlap-before.jpg)、[修复后](../../agv-digital-twin/environments/p0-sim/artifacts/editor-sidebar-overlap-fixed.jpg)。复制运行拓扑另加明确替换确认 |
| canonical 图像名称 fallback | 代码与离线检查通过 | metadata 无 originalImage 时使用 image/source/占据图标签，避免 undefined；此文本字段未单独录制 GUI 证据 |
| 新 deployment 与旧 fixture 隔离 | 已观察通过 | 主验收者真实 reload 后来源为声明的 SIM，旧 fixture UNKNOWN 不再进入当前 attention；已展开确认旧历史只读保留且不阻新环境 |
| NPI 资料与阻断假设 | 已观察 | 未确认的阻断假设先阻止冻结；主验收者限定为 SIM-only、保留非阻断待测项后成功冻结 r3，不代表现场参数已确认 |
| 冻结/发布与内核实际回读 | r3、r4 均已观察 READY 与实时准入 | r3 原请求 `5816b6a2e5…6968e1`；后续将路段速度 0.04 改为 0.03，实际保存/冻结 r4，release `585e…`、request `dc226…` 获得历史 READY 与实时准入。完整身份以环境记录为准，未创建导航任务 |
| Worker 实际版本/会话与实时准入 | 发布后实时允许；最终已停用 | 初次历史 READY 后，适配器运行反馈的完整观测差异曾误阻断实时准入；后端精确区分配置等价与完整观测后，主验收者重新读取并 verify 原请求，后端允许，保持同 source，未重新 apply。最终停用后不再处于准入状态 |
| 执行环境不可达时的实时阻断 | 已观察通过 | 主验收者停止 Worker 后，当前准入变为未就绪/已阻断，历史 READY 保留，导航提交禁用。界面将真实 `SIM_UPSTREAM_UNCERTAIN` 解释为无法取得执行环境/内核的可信回读，不猜故障归属 |
| 刷新恢复/显式核验/重复保护 | 已观察通过限定路径 | 实际 reload、重新认证、读取配置、原 ID verify 通过；第二 tab reload 并认证后恢复同一 r4，没有新增 publication |
| 运行目的站同步 | 已观察通过 | 实时准入通过后仅 GET 刷新配置与模型，实际恢复 4 个 LAB01/02 EXIT/STATION 目的站，提交按钮可用；主验收者未点击发任务 |
| 停用与再次换版 | 修复后实际通过限定路径 | 原始失败保留：进程刚退出的 ProcessLookupError → HTTP 500 → UNKNOWN；后续嵌套 5 秒停机超时与后代异步退出 → HTTP 409 → UNKNOWN。修完整 owned-token 生命周期并对齐 25 秒 Worker、35 秒 Gateway、45 秒客户端预算后，第三个原 UNKNOWN 经用户明确 retry 成为 RETIRED。第四个版本重新 READY/live 通过，正常停用约 3.4 秒完成，无 UNKNOWN；不是仅延长超时就判通过 |
| 桌面/窄屏布局 | 已观察通过限定页面 | 主验收者检查 375/320 页面无横向溢出，独立截图复核未发现阻断性遮挡。首轮：[375](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-maps-375.jpg)、[320](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-maps-320.jpg)。r4：[车队与实时准入](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-r4-ready-fleet.jpg)、[320（client 305）](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-r4-ready-320.jpg)、[375（client 360）停用入口](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-r4-retire-375.jpg)。新 hash 分栏实际读取正确 |

## 最终裁决

第四个实际发布请求为 `68036fe858…468299`，release 为 `0213a8daf1…5c243b`。主验收者确认历史 READY 与实时准入通过后，明确执行正常停用：`RETIRING 00:20:54.520 → RETIRED 00:20:57.934`（UTC），约 **3.4 秒**，没有进入 UNKNOWN。第三个原 UNKNOWN 的显式 retry 也已 RETIRED；四个 publication 历史均保留。完整请求/版本身份与阶段记录以环境审计为准，本文只使用便于识别的短摘要。

最终截图：[第四次正常停用后](../../agv-digital-twin/environments/p0-sim/artifacts/p0-2-final-retired.jpg)。独立复核可见“已停用”、当前准入“未就绪/已阻断”、关联发布版本“未准入”，缺失执行环境观测时间显示“尚无证据”；配置核验与含运行反馈的完整观测摘要分栏，未把停用后的历史记录当作当前运行资格。主验收者已关闭第二临时 tab、恢复视口并完成浏览器工具收尾。

该截图拍于末次 release 复用 guard 之前，当时旧已用版本的发布按钮仍可点击；保留原实际时点截图，不篡改。此后前后端补齐禁用/拒绝：已使用的执行版本必须重新冻结为新 release，原 requestId 的回执查询与服务端幂等结果不变。该修正以离线定向回归为证据，不补称已有新的浏览器通过 case。

**通过范围：** 单一 `p0-sim / empty-crossing-v1 / LAB-01` 的固定 canonical 地图、受限调度路网修订、NPI 资料/假设、冻结、隔离发布与真实版本回读、实时准入门控、原请求查询、显式停用换版，以及本轮记录的受控异常路径。

**未验范围：** 没有发导航任务或验证任务运动；P0-3 完整任务/实验闭环、任意建筑图与物理世界生成、REAL、实车、对接、顶升、交接、载荷或生产安全均不在通过范围。未做完整键盘/辅助技术可访问性验收，也不把本轮截图外推为所有页面尺寸通过。

**已知残留：** 停用已实际发生但成功响应丢失时，尚未实现通用自动对账。应先 GET 查询原发布记录；服务端仍为 UNKNOWN 或上下游不一致时，继续保守保留未决与审计，要求人工 review，不能自动重发、清理历史或仅凭进程退出判为 RETIRED。本轮受控显式 retry 成功不代表所有响应丢失、重启或中段恢复场景都已解决。
