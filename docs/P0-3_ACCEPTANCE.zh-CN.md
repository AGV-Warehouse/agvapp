# P0-3 固定单车正式调度实验验收记录

日期：2026-11-08（以下运行时间为服务端 UTC，跨入 2026-11-09）。状态：**P0-3 首个固定 canonical 单车隔离 SIM 切片已完成实际内置 Browser 验收：正常导航、页面关闭后的记录与恢复、正常撤单的非即时停止语义、停稳收尾及 Worker 停止后的准入阻断。** 本文是本轮唯一 P0-3 验收记录，不将这个切片外推为完整 P0-3、完整 NPI、REAL 或生产通过。

## 范围与入口

产品与阶段出口以[产品主方案](../../PRODUCT_MASTER_PLAN.zh-CN.md)为总索引。当前环境唯一入口为 [P0 SIM 环境](../../agv-digital-twin/environments/p0-sim/README.md)：同一 Gateway `127.0.0.1:55231`、隔离内核 `55212`、Worker `55232`。临时日志与浏览器证据统一留在该环境 ignored [artifacts](../../agv-digital-twin/environments/p0-sim/artifacts/)；凭据不进入本文。

本切片仅支持后端声明的 `p0-sim / empty-crossing-v1 / LAB-01` 固定 canonical SIM。实验绑定当前真实 READY publication 与实时准入 release，目的站来自当前配置；明确点击开始才提交一次正式导航。没有 REAL 切换、顶升、对接、交接或任意地图生成。

## 实现与证据边界

同一门户六个工作区继续使用现有 shell、导航与命令回执。虚拟实验页提供：读取版本与历史 → 核对当前准入 → 选择配置目的站 → 明确开始 → 按 run ID 观察、恢复与取消。独立 Digital Twin 演示保留在折叠入口。

运行 ID 是恢复索引；实际创建/取消仍使用既有 v1 管理命令与持久回执账本。原信封在 POST 前落盘，跨标签页锁与未决请求门控保持有效。刷新、重新认证、第二标签页及轮询只做 GET；404、UNKNOWN 或响应丢失不自动补发命令。运行记录与后端观察采样不依赖页面保持打开。

RTS 展示 kernel 计划路线、claimed 与 allocated 原始资源；资源名必须能匹配当前已同步版本的实际模型，才在既有运行地图叠加分配资源。金色虚线为实际读回的 Nav2 计划，紫色为已分配资源，蓝线为后端保存的 AMCL 估计轨迹，绿点仅来自实际 fresh map 仿真真值源。AMCL 估计不是 ground truth，计划不能替代执行，缺失/过期/跨坐标系数据不补画。当前实现未取得权威独占控制归属字段，主界面明确显示尚未提供。

请求 ACCEPTED、内核 FINISHED、到站、无活动任务与持续停稳分别核对。完成许可由后端不同源时间戳的实际反馈裁决，界面不以网页重复读取的次数代替持续停稳。已 settled 的收尾证据封存，主界面保留原源观察时间；confirmed 为 true 时标明“完成时的停稳证据（已封存）”，失败但 settled 时标明“收尾时的停稳证据（已封存）”。settled 不等于任务成功，也不代表车辆此刻仍停稳或发布此刻仍准入。正常撤单**已下发动作可能继续，停稳另行核实**；请求受理或内核 WITHDRAWN 均不表示车辆已停稳。本次实际延迟约 119 秒，不能称为即时停车。

网关观察年龄与 Worker 源观察年龄分别展示。诊断默认折叠，不在每次刷新构建完整历史 DOM；展开仅显示当前观察及最近 10 条事件，标出后端证据总数。

## 已执行的离线检查

当前 **80/80 Node 测试通过**。包含既有命令/发布/地图/shell 回归，以及 P0-3 的真实 FleetAPI 账本与控制器组合检查：

- 明确开始绑定 publication/release、真实配置目的站与车辆身份；保存 run 索引及命令信封后才 POST。
- 响应丢失后的原 run/receipt GET 恢复、第二标签页恢复、并发开始保护、404 保留原身份，均不自动重发。
- READY/实时准入不匹配、REAL 目标、无权、存储不可用与未知目的站在副作用前阻断。
- 取消使用统一回执账本；取消 ACCEPTED 与停稳/执行完成分开。
- kernel FINISHED 不单独视为 settled；封存收尾的源时间与历史性质明确，失败收尾不称任务完成。
- 资源缺失不补画；同 frame 实测 AMCL、Nav2 计划和真值分层；真实资源名对应现有模型坐标；诊断按需与数量限制。
- 同一 shell 的实验与 RTS 视图只在部署身份确认后初始化，部署变化销毁旧视图，运行总览之外不显示 RTS 面板。

这些测试包含离线 DOM harness 和模拟 API，不证明实际浏览器布局、ROS 运动、网络异常或完整辅助技术可访问性。实际 GUI 及运行结果单独记录如下。

## 实际 Browser 与运行证据

以下结果由主验收者的实际内置 Browser 及环境运行观察提供；未执行的场景不计通过。

| 检查 | 结果 | 证据与限制 |
|---|---|---|
| 当前版本与明确发单 | 正常路径已观察通过 | 实际 workbench 读取后当前准入显示“后端允许”，通过正式实验入口发起单次导航；没有因页面导航自动发单 |
| 首次正常正式导航 | 已观察通过 | run `137d46b2749cefb21c5294ae2594d956`；order 短摘要 `fleet-b607…b3b4`，完整身份以环境记录为准 |
| 内核与物理完成分开裁决 | 已观察通过 | kernel `FINISHED`，实际位置 `L-EXIT`，`atDestination / noActiveOrder / confirmed / settled` 均为 true；不同源时间报告 3 帧，`00:42:07.475 → 00:42:09.635 UTC`，不以 FINISHED 单字段冒充物理完成 |
| 关闭页面后服务端持续采样 | 已观察通过限定路径 | 关闭全部运行页 31.95 秒，服务端 evidence `64 → 79`，增加 15 条；重新打开恢复同 run 与同 order，浏览器关闭未使任务观察停止 |
| 封存收尾与实时证据语义 | 修正后实际观察 | 首轮封存 24 秒后仍写“新鲜反馈报告停稳”，现明确封存并展示原源观察时间；主验收者在两条 run 实际看到封存提示与原源 ISO 时间。最终 reload/auth/query 后实际确认 FAILED 与“收尾证据”分开：[最终封存历史](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-final-sealed-history.jpg) |
| AMCL 历史轨迹保留 | 修正后实际观察通过 | 首次完成时 stale 源曾导致蓝轨迹未保留；修正后实际 mini 图与主地图先读到 40 点历史 trace，新 run 最终 74 点保留，stale 不再丢历史。[最终估计轨迹](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-final-estimated-trajectory.jpg)。历史估计轨迹不宣称当前源新鲜或真值 |
| 正常撤单受理与内核任务撤销 | 已观察通过限定语义 | run 短摘要 `add6…`、order `fleet-1c…`，取消请求 `472c6f00e4be743b7d8c4d0d02f26b5c` 为 ACCEPTED，内核 `00:44:09.324 UTC` 报告 WITHDRAWN；实际车继续已下发的两 leg 至 `L-STAGE`，`00:45 UTC` 仍在运动。[受理但未停稳](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-cancel-accepted-not-stopped.jpg) |
| 撤单后实际停稳与失败收尾 | 已观察，不能算成功导航 | 首个 physical stop 为 `00:46:07.911 UTC`，比 WITHDRAWN 晚约 **118.6 秒**。最终 kernel 为 FAILED、confirmed=false、settled=true，3 帧源观察覆盖 `00:46:07 → 00:46:11 UTC`，IDLE、`L-STAGE`、noActiveOrder；末段及终点 allocated 仍保留，不推算资源全部释放。[撤单后的收尾](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-cancel-settled.jpg) |
| Worker 停止与重新启动 | 已观察通过限定路径 | 在 idle 时停止 Worker，已选择有效目的站的 start 从 true 变 false；两条 sealed 历史保持不变。Worker 重启为 STOPPED，没有自动 apply 或重放运行；Browser publication verify 为 UNKNOWN，随后显式 retire，`00:47:59.523 UTC` 明确 RETIRED。回实验页读取后两条历史仍在，start gate=false。[Worker 离线门控](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-worker-offline-gate.jpg)。不外推为运动中断连恢复或所有 UNKNOWN 自动恢复 |
| 刷新、重新认证与第二标签页 | 实际观察通过限定路径 | 关闭全部运行页后重开，以及第二标签页重新认证，均恢复同一 `137d…` run/order，不新增导航意图 |
| 响应丢失及终态重复取消 POST | 定向离线回归 | 没有强行制造真实丢响应，也没有将真实浏览器重复取消新 POST 当作已验；相应幂等与不重发由定向回归证明 |
| 故障前后封存记录稳定 | 后端只读复核通过 | 两个 sealed snapshot 的 SHA 完全一致，证据数分别保持 93 / 108，不因 Worker 停止、重启或发布停用继续采样、改写历史 |
| 375 / 320 窄屏 | 已观察通过限定页面 | viewport 375 / client 360、320 / client 305 均无横向溢出：[首 run 完成 375](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-first-completed-375.jpg)、[撤单历史 320](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-cancel-history-320.jpg)。不扩称所有页面与完整可访问性通过 |
| RTS 实际资源叠加 | 已观察限定图层 | 实际看到紫色已分配资源：[运行中的 RTS](../../agv-digital-twin/environments/p0-sim/artifacts/p0-3-rts-running.jpg)。不将紫色分配推算为已执行 |

## 最终裁决与后续出口

通过的是首个固定 canonical 单车正式调度实验切片。正常 run 已到站并 sustained stationary；正常撤单 run 的任务受理/撤销与实际车辆停稳分开保留，最终为 FAILED 的可核对收尾，不能涂改成成功。Worker idle 停止使新运行门控关闭，重启不自动重放，既有封存历史保持稳定。

最终检查分别为 **80 项 Node、67 项后端 pytest、13 项 Worker 检查通过**。最终 publication 明确 RETIRED；只读核对为 2 runs / 2 orders / 3 commands。浏览器实际观察与这些离线计数分开报告。

完整 P0-3 仍需多车互斥/资源等待的实际 RTS 证据、可操作回放与完整场景编排等后续出口。运动中的链路断连、通用 UNKNOWN 恢复、正常撤单更快停止或其他停车语义均未在本次通过范围。Node、后端、Worker 和浏览器结果分别统计，不相加冒充 GUI 用例。

REAL、实车、任意地图、两车资源竞争、顶升、载荷、对接/交接与生产安全均不在本记录通过范围。没有修改 openTCS 内核。
