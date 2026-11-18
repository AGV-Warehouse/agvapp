# P0-3 固定双车正式调度与共享区验收记录

首轮日期：2026-11-08（下列首轮运行时间均为 2026-11-09 UTC）。最新实际记录见本文后部“有界场景编排与只读回放”节，修复部署及新会话 60 秒就绪观察已补证，剩余最终 Browser 项待补；“Shutdown、正常撤单与运行中 MQTT 断连恢复”及 TF / READY 复验保留各自独立历史范围。首轮状态：固定 canonical 双车隔离 SIM 的正式发单、真实共享区等待/交接、双车到站停稳、刷新与第二页恢复、窄屏及正常停用已取得主验收者实际 Browser/运行证据。最终颜色及历史空报告修正已实际 reload 复核；不等于完整 P0-3、完整 NPI 或生产通过。

## 范围与唯一入口

总索引见[产品主方案](../../PRODUCT_MASTER_PLAN.zh-CN.md)。首轮在现有 P0-3 Run、v1 commands/receipts、publication 及正式 Bridge 上扩展固定 `p0-pair / empty-crossing-pair-v1 / LAB-01 + LAB-02`；环境入口为 [P0 pair](../../agv-digital-twin/environments/p0-pair/README.md)。环境配置、凭据与临时证据保留在该目录 runtime/artifacts，具体端口与启动以环境说明为准。

该环境有独立 deployment 身份、数据库、kernel 与 Worker。浏览器同源时仍按部署身份重建发布和运行控制器；旧 single 账本与索引保留原范围，只读历史不向 pair 查询，不清空、不迁移、不重发。原[单车验收](P0-3_ACCEPTANCE.zh-CN.md)的封存结果保持历史性质。

## 已实现行为与证据语义

- 车辆选项使用后端 canonical 身份及每车实时 ready；目的站来自当前固定配置。每车可明确开始一次 Run，同车 active/UNKNOWN 阻断新意图，另一车可提交自己的 Run。
- Run 索引在既有部署范围内按车辆保存；所有发单与正常撤单继续使用统一命令回执账本和跨页锁。刷新、轮询、第二标签页、重新授权均只恢复原 ID，不自动 POST。
- RTS 为两车展示实际源观察、计划、claimed、allocated 和 AMCL 历史执行采样；同版本地图中分别标蓝色 LAB-01、橙色 LAB-02。估计轨迹不等于 ground truth，Nav2 计划不能替代执行，缺失/跨坐标数据不补画。
- 共享块展示真实 members/owners，以及后端依据实际请求冲突和执行状态判定的 waiting。资源 source 时间和 age 缺失即未知；空 owners/claims/allocations 不证明独占、无冲突或已释放。释放与等待车获配须以连续实际读回核对。
- 已 settled 的到站/停稳/运动证据封存，保留各车原源时间。取消 ACCEPTED 不等于停稳；失败收尾不称导航成功。

## 首轮离线检查（历史）

`node --test tests/*.test.cjs`：**88/88 项通过**（agvapp）。其中正式 Run 20 项包括固定 pair 每车并发发单、同车重复阻断、双车索引刷新恢复、第一车 UNKNOWN/404 不补发且允许第二车发单、源图层身份/颜色与空资源不推断释放。其余包含既有 ledger、scope、发布、地图与 shell 回归。另对 app.js、map-release-ui.js、simulation-run-ui.js 执行 Node 语法检查。

Runtime 主责报告：35/35 项 host 定向检查通过（pair、release/telemetry、R3c pair）。实际 compose 配置、Docker 构建及启动完成；新 Worker 初始 STOPPED/running=false/ready=false，无自动重放。独立内核先 GET 确认空模型，再显式初始化 canonical 双车和共享块，无运输任务；证据为环境 artifacts 的 worker-startup.json、worker-canonical.json、kernel-empty.json、kernel-baseline.json。这些启动与初始化证据不等于双车运动或互斥验收。

离线 fixture 不证明实际 ROS 运动、互斥安全、浏览器布局或所有断连恢复。后端/Worker 数量由对应实际检查单列，不能与 Browser 用例相加。

## 首轮真实 Browser 与运行证据（01:43–01:58 UTC，历史）

真实 GUI 由主验收者在内置 Browser 操作，运行原始源另行约 1 Hz 顺序采集。明确提交恰好 2 Run / 2 command，使用同一 publication `548ce132f9720556d7cb221f658592f1`、release `8efac212e8cf471e82b667669d659395`。

| 车辆 | 原 Run / order | 实际结论 |
|---|---|---|
| LAB-01 | `db63bda53aec62b7fb82c8081860cf3f` / `fleet-5edfb02c59e236cb291f2c8315c2ba18` | FINISHED，R-EXIT，到站/无活动任务/confirmed/settled 均 true；3 帧不同源时间持续停稳 `01:46:32.836 → 01:46:36.137 UTC` |
| LAB-02 | `787b2e95347a740413736e103dafdcd2` / `fleet-8ef5e4c728878d4053623c38da77845f` | FINISHED，L-EXIT，到站/无活动任务/confirmed/settled 均 true；3 帧不同源时间持续停稳 `01:50:21.810 → 01:50:25.402 UTC` |

| 实际检查 | 结果与证据 |
|---|---|
| 固定 pair 版本与车辆发单 | Browser 从后端 canonical LAB-01/LAB-02 分别选择并明确开始；第二车 start 可用，未被第一车执行笼统阻断；最终恰 2 Run / 2 command |
| 真实等待与资源归属 | LAB-01 占共享块；LAB-02 正式 assigned、claims 与占用资源相交且新鲜停稳，真实等待 186 个采样。等待阶段见[原等待页](../../agv-digital-twin/environments/p0-pair/artifacts/pair-waiting-before-compact.jpg) |
| 释放与后车获配 | 900 个采样的归属序列 `[] → LAB-01 → LAB-02 → []`，分别在 index 0 / 10 / 206 / 428；首次占用 `01:43:16.990`、交接 `01:46:32.979`、最终空报告 `01:50:14.957 UTC`。见[交接原始窗口](../../agv-digital-twin/environments/p0-pair/artifacts/handoff-raw-window.json)、[最终摘要](../../agv-digital-twin/environments/p0-pair/artifacts/raw-summary-final.json) |
| 双车实际完成 | 内核状态、真实位置及每车独立持续停稳分别核对；FINISHED 没有单独替代物理完成。见[双车完成原始读回](../../agv-digital-twin/environments/p0-pair/artifacts/both-finished-raw.json)、[退役后只读运行记录](../../agv-digital-twin/environments/p0-pair/artifacts/retired-runs-readonly-db.json) |
| RTS 可用性 | 首轮重复完整 Run 使地图过深，改为两张并列简卡、共享块只显示一次和折叠证据后实际 reload 通过。[紧凑页](../../agv-digital-twin/environments/p0-pair/artifacts/pair-waiting-compact.jpg) 已处于 LAB-02 获配阶段，不能作为 LAB-02 等待图；[交接后 RTS](../../agv-digital-twin/environments/p0-pair/artifacts/pair-handoff-compact.jpg) 单独保留 |
| 正常刷新与第二标签页 | 实际恢复相同两 Run 身份，未新增命令；周期只读刷新期间车辆/目的站可选择且值保留。header 曾误报本地发布 pending，改为部署确认和授权后 GET status + 原 publication，实际自动恢复并消除假警，无需另点地图页 |
| 封存共享区读回 | 曾出现旧 sealed 的 LAB-02 owner 覆盖最新空报告；改为每块按源时间选最新，缺失/无效时间待核。实际最终 reload 确认最新空覆盖旧 owner，并显示“最后观察 / 历史封存”，空报告不称实时释放 |
| 375 / 320 窄屏 | viewport 375 / client 360、320 / client 305 均无横向溢出：[375 图](../../agv-digital-twin/environments/p0-pair/artifacts/pair-completed-375.jpg)、[320 图](../../agv-digital-twin/environments/p0-pair/artifacts/pair-completed-320.jpg)。这两张是颜色修正前的布局证据，保留原错误时点。LAB-01 列表第二时曾误用橙色，修正后实际 reload 为 LAB-02 橙 `#cd6322`、LAB-01 蓝 `#346bc2`；最终 [375 图](../../agv-digital-twin/environments/p0-pair/artifacts/pair-final-history-375.jpg)（375×812，scrollWidth 360）、[320 图](../../agv-digital-twin/environments/p0-pair/artifacts/pair-final-history-320.jpg)（320×740，scrollWidth 305）再次确认无横向溢出 |
| 正常停用与账本保留 | Browser 显式停用 `01:57:17.450 → 01:57:21.191 UTC`，约 3.74 秒至 RETIRED；owned processes 36→0，双车 TO_BE_IGNORED、无位置/活动任务/allocated/claimed。后续 45 个采样保持 STOPPED，两个 order 仍 FINISHED，两个 SQLite 各 20480 bytes 保留。见[停用进程审计](../../agv-digital-twin/environments/p0-pair/artifacts/retirement-owned-journals.json)、[停止后的原始读回](../../agv-digital-twin/environments/p0-pair/artifacts/final-stopped-raw.json) |

最终 [桌面历史页](../../agv-digital-twin/environments/p0-pair/artifacts/pair-final-history-desktop.jpg) 实际复核颜色、最新空报告的历史标签及 header 自动恢复；第二标签页保留两原 Run，无 POST。最后仅重新选择目的站、未点击 Start，合计仍为 2 orders / 2 command。临时标签页关闭，交付页保留。

新 deployment 当前初始历史读空已实际核对；没有额外 GUI 声称旧 single 本地索引一定存在。旧范围保留/只读、不迁移、不跨环境查询由既有 deployment 回归支持。实际未强制制造丢响应、同车重复 POST 或运动中断连；对应离线回归不能冒充 GUI case。未执行“关闭全部运行页再观察后台采样”独立 case；首轮后端采样独立于页面，但不借用旧单车关页结果声称双车已经复验。

最终检查分别为 **88 项 Node、72 项后端 pytest、35 项 Runtime 检查通过**，不相加为浏览器用例。最终 publication RETIRED，双 Run 到站/持续停稳已封存，历史不是当前准入或车辆此刻停稳证明。

## 首轮实测限制（历史）

最终 Runtime 原始采样累计 900 帧（`01:43:06.984 → 01:58:05.931 UTC`），其中运行期间 47 帧 aggregate READY=false；主要原因是 TF simAge 短暂超过既有 1.5 秒门槛（实测约 1.58 / 1.68 / 2.94 秒）及探测异步瞬态。相应 sourceAge 小于 0.117 秒，API 无读取错误；没有放宽阈值或人工干预。不能据此宣称全程 READY 稳定，双车 FINISHED、实际等待和采样互斥证据仍单独成立。

原始观察为约 1 Hz 顺序 GET，未观察到多 owner 仅说明采样时刻的资源归属。最终摘要中最小新鲜真值中心距离约 1.4925 米，不能换算为连续时间无碰撞、生产性能或安全通过。后端读回、物理反馈与 GUI 观察分别报告。

## TF / READY 抖动修复复验（2026-11-09 UTC，限定通过）

以下是 `2026-11-09 UTC` 的追加复验，不替换上轮 `01:43:06.984 → 01:58:05.931 UTC` 的 900 帧 / 47 帧 READY=false 历史观察。900 帧正测、双车正式运行、关页采样、Worker 停止/重启负测及所发现问题的最终 Browser 复核已完成，限定结果如下；不扩称完整 P0-3 或生产通过。

根因代码审查发现单线程观察循环在昂贵的 occupancy/telemetry/report 工作间每次仅消费一次回调，形成 TF 观察积压；另一个传感器判断错误耦合旧 navigation.ready，可能放大失败。原 TF simAge 中位约 1.25 秒与修复后约 0.01 秒的对照支持上述推断，但旧 capture 缺分量/receipt 字段，不能完全分离发布端与观察端延迟。修复在昂贵的 occupancy/telemetry/report 工作前排空 ROS 回调，独立保留传感器与导航判断，以及 TF 合成/分量的原始源 stamp 和回调接收年龄；没有放宽既有 TF simAge `[-0.1, 1.5)` 门槛。构建及分层离线/容器检查记录见 [候选修复验证](../../agv-digital-twin/environments/p0-pair/artifacts/tf-runtime-fix-validation.json)。

主验收者已通过真实 Browser 明确冻结并发布新 release `4f7b85a9730743b7a55de66c0436f725`，发布读回 READY。当前准入新增的只读“就绪源诊断”折叠详情已实际展开，展示原始 aggregate/每车观察、blockers 和 navigation/TF 结构，不推算 READY 或改变命令门控。[实际诊断截图](../../agv-digital-twin/environments/p0-pair/artifacts/tf-ready-diagnostics-after.jpg) 中观察到 TF stamp `54.78`、simTime `54.794`、simAge `0.014`；odom 分量 receipt age `0`、wallAge `0.014`，map→odom 分量 simAge 约 `-0.406` 保留源 stamp 原值，不将分量直接冒充合成 TF。该截图仅证明该次原始观察及 UI 展示。

独立 ROS domain `197` / 独立 namespace 的真实负测记录了初始 READY、TF 停发期间时钟前进、原 TF 过期后阻断、TF 恢复后重新就绪，共 4 项检查成立，见 [隔离 TF 门控审计](../../agv-digital-twin/environments/p0-pair/artifacts/tf-gate-isolated-audit.json)。此检查未向 pair topic 或控制链注入故障，不替代运行中 pair 断连/恢复验收。

新一轮约 1 Hz 顺序独立采样于 `02:17:46.083415 → 02:32:45.039480 UTC` 自然完成，index `0..899`。900 帧全部 running/READY=true，源读取错误 0；按订单阶段为 commissioned idle 188、ordersActive 425、bothFinished 287 帧，分别全部 READY。LAB-01 新鲜里程计 moving/idle 为 197/703 帧，LAB-02 为 222/678 帧。合成 TF simAge 的 p50/p95/max 分别为 `0.010/0.018/0.022` 与 `0.010/0.020/0.022` 秒；原始 stamp 保留，既有阈值未改。见 [后测审计](../../agv-digital-twin/environments/p0-pair/artifacts/readiness-audit-after.json)、[前后对照](../../agv-digital-twin/environments/p0-pair/artifacts/readiness-before-after-comparison.json)。旧采样没有 TF 分量/receipt 字段，不能凭对照完全区分原发布端延迟与消费端回调积压。

| 车辆 | 本轮正式 Run / order | 明确提交 |
|---|---|---|
| LAB-01 | `bb256ad87f9b1187b8cf13b3be069c3a` / `fleet-ecf836451c00cd8c8ba72b07bab57e66` | Browser，约 `02:20:53 UTC`；command `be22f6b75a3aef7e5a27acc3fb6d6d98` |
| LAB-02 | `972f3c387976b5cdae94d1580f8bf9cb` / `fleet-9a9535e72126eeab26f45a87532a30e7` | Browser，约 `02:21:18–19 UTC`；command `2d070809ad7da30c18d90c9fb1b91b16` |

该轮两订单 FINISHED，共享区采样归属 `[] → LAB-01 → LAB-02 → []`，转折 index 为 0/194/391/613；LAB-02 waiting 177 帧，未采样到双 owner。[后测摘要](../../agv-digital-twin/environments/p0-pair/artifacts/raw-summary-after.json) 的最小新鲜真值中心距离约 1.481 米，只是采样值，不是连续时间无碰撞或生产安全证明。最终共享块空报告也不代表两车全部 allocated 已释放，终点 allocated 仍保留。AMCL 事件驱动的旧 pose 保持 fresh=false，不借由 TF 新鲜伪装成实时 pose。

主验收者实际关闭两个运行标签页 `02:29:11.782 → 02:30:23.808 UTC`，约 72 秒；对应 72 个后台采样均 READY、两订单保持恰好 FINISHED、新鲜里程计均停稳。见 [关页窗口审计](../../agv-digital-twin/environments/p0-pair/artifacts/browser-closed-window-audit.json)。

正测结束后才实施 UI 历史查看修正：原历史按钮查询后没有同步所选车，5 秒轮询会覆盖所点 Run；新增仅内存查看 ID，同步车辆，保留显式历史跨轮询，切车/明确开始清除查看 ID，初次 reload 仍按原 pending 恢复，不改 pending 索引或命令门控。Node **91/91**（发布 UI 16/16、正式 Run 22/22）及语法检查通过，包含 fresh Worker + stale TF 仍 blocked、HTML 转义、旧 single 缺字段兼容和历史查看/恢复/零额外 POST。还修复了后台 GET 进行中历史点击被 readAct 静默丢弃的问题：显式历史意图使用既有串行 act 等待当前读取后执行，不提交命令。14 项静态资源 source/target/manifest SHA256 一致；离线/产物检查与下述实际 Browser 结果分别报告。

后续 Worker stop 负测于 `02:33:37.54 → 02:33:58.29 UTC` 执行，20 秒后强制终止、exit 137，不能称优雅停机或正常退役。主验收者实际 Browser 确认未就绪、Start 禁用、历史保留。重启于 `02:34:25.886 → 02:34:26.276 UTC`，新 sourceId，STOPPED/running=false/ready=false/stateLoaded=false，无自动 apply 或重放；两订单仍 FINISHED，applied/execution 身份文件及四个 execution.sqlite 主文件摘要未变；未在 stop 前 hash WAL，不能声称整个 SQLite family 字节不变。旧两 journal 主文件各 20480 bytes；新两各保留主文件 4096、WAL 144232、SHM 32768 bytes，见 [journal sidecars](../../agv-digital-twin/environments/p0-pair/artifacts/worker-start-negative-journal-sidecars.txt) 及 [重启原始读回](../../agv-digital-twin/environments/p0-pair/artifacts/worker-start-negative-after.json)。

重启后发现 Gateway `admission()` 对 `worker.observedAt=null` 调用 `.replace` 导致 status HTTP 500；这不是 READY 已恢复，也不能用旧页面状态充当当前准入。Runtime 主责完成缺失时间的最小修复，相关后端 pytest 70 项通过；实际 status 返回 JSON 200、ready=false、sourceAgeSeconds=null、SIM_READINESS_EXPIRED + SIM_SESSION_CHANGED，四条历史 Run 保留原封存内容可读，见 [Gateway 修复后实际读回](../../agv-digital-twin/environments/p0-pair/artifacts/gateway-nullguard-live-readback.json)。最终 Browser 已在正常 reload/授权/读取后确认后端未就绪与 Start 禁用。该异常修复完成，没有借旧页面状态宣称恢复 READY。


最终 Browser 历史查看复验：从 LAB-01 点击本轮 LAB-02 Run `972f3c387976b5cdae94d1580f8bf9cb` 后，车辆选择和证据同步为 LAB-02/该 Run；显式读取及多个实际 5 秒轮询后未回跳。同车旧 Run `787b2e95347a740413736e103dafdcd2` 跨刷新/轮询仍保持原 ID，见 [旧历史保留图](../../agv-digital-twin/environments/p0-pair/artifacts/tf-history-old-run-retained.jpg)。切回 LAB-01 恢复本轮 `bb256...`，再点 `972...` 正确，全程没有 Start 或新任务 POST。

最终窄屏实际复核 [375 图](../../agv-digital-twin/environments/p0-pair/artifacts/tf-final-history-375.jpg) 为 viewport 375 / scrollWidth 360，[320 图](../../agv-digital-twin/environments/p0-pair/artifacts/tf-final-history-320.jpg) 为 viewport 320 / scrollWidth 305，无横向溢出。[最终 RTS](../../agv-digital-twin/environments/p0-pair/artifacts/tf-final-rts-desktop.jpg) 明确两车到站停稳为历史封存、最新空 owner 报告“不证明实时释放”，没有把停止后的历史当作实时源。

主验收者 Browser 于约 `02:39:53 UTC` 显式重核后为 UNKNOWN，再明确停用，于 `02:40:02.943379 → 02:40:03.104549 UTC` 得到 RETIRED，见 [本轮停用图](../../agv-digital-twin/environments/p0-pair/artifacts/tf-pair-retired-after.jpg)。这是停止负测后的停用，不与此前运行中正常停用耗时比较。[最终运行审计](../../agv-digital-twin/environments/p0-pair/artifacts/final-retired-after-runtime-audit.json) 与 [进程/journal 检查](../../agv-digital-twin/environments/p0-pair/artifacts/final-retired-after-processes-journals.json) 确认 owned/Gazebo 进程均 0、Worker STOPPED、两原订单 FINISHED、四 Run 保留，八个 journal family 未删除。Gateway PID 17504 保持服务；[最终 idle stats](../../agv-digital-twin/environments/p0-pair/artifacts/final-retired-after-docker-stats.txt) 单次观察 worker/kernel/MQTT CPU 为约 0.01%/0.19%/0.02%，不是性能基准。保留一个交付标签页，未新建顶层方案或迁移旧历史。

本轮结论：固定 pair 的上述 900 个正测采样未再出现 READY 抖动，真实 TF 停发及 Worker 不运行仍阻断，两个实际 Browser 发现的问题修复后复验通过。此结论受采样窗口和固定场景限制，不证明任意负载下永不抖动、所有断连恢复或连续时间安全。Runtime 定向检查、后端 pytest、Node 与 Browser 证据各自成立，不能相加为 GUI 用例。


## Shutdown、正常撤单与运行中 MQTT 断连恢复（2026-11-09 UTC，限定通过）

本节是上述 TF 900 帧复验后的追加范围。固定 pair 下的退出、正常撤单、同会话 MQTT 断连/观察恢复、明确已停稳故障任务收尾、新会话导航及最终 UI/停用均已取得主验收者实际 Browser 与独立源证据；不扩大完整 P0-3、实车或通用故障恢复范围。所有正式发布、发单、普通撤单及故障收尾由主验收者在 Browser 明确操作；只读采样、代码回归和真实 GUI 分别报告。先前 TF 的 900/47 与后测 900/0 保留原时间和范围。

### 退出与重启的实际范围

旧 P0 Worker 入口没有显式 SIGTERM 处理，PID1 留在 HTTP 服务循环，前轮实际在 20 秒后被 Docker 升级 SIGKILL（137）。实际 ThreadingHTTPServer.daemon_threads=True，不能将根因归为 server_close 等待非 daemon 线程。现单/双 P0 共用显式 signal→停止 Event→有界 HTTP 循环退出，拒绝新 mutation/迟发 spawn、保护在途停用身份，再按 execution token/PID start time 停完整树；分层并行 deadline 保留组退出码，SIGKILL、异常退出、mutation 未排空或进程残留均非 0 并审计，不放宽重放规则。

Worker idle、无运行世界时，明确 Docker stop 于 `03:07:52.954 → 03:07:53.722 UTC` 完成，约 0.768 秒，容器 exit 0。已有世界进程、双车停稳且没有运输订单时，明确 stop 于 `03:11:54.434 → 03:11:58.601 UTC` 完成，约 4.167 秒，容器 exit 0；owned 进程 36→0，未 SIGKILL，分组退出码包含正常 0 和预期 SIGTERM 的 -15。见 [独立 shutdown 复核](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-world-independent-review.json)、[idle stop](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-idle-docker-stop.json)。这不是“运输订单运动中停止世界”验收，也不把所有子进程都描述为 exit 0。

一次 stop 前脚本错误要求该新环境存在两条旧 FINISHED order，实际为零订单，断言未通过；该失败原样保留，未称预检通过，实际 READY/双车停稳/零订单由独立前置采样补核。见 [原断言说明](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-world-preflight-assertion-note.json)。重启仍不自动 apply、初始化或重放；新运行须 Browser 明确新冻结和发布，旧执行 journal 保留。

### 普通撤单：受理、内核终态与实际停稳分开

业务 release `31b0a326c202466c9e5ef17799b3d657` / publication `be5beda7e15d497dc51ebc28f89179df` 下，LAB-01 Run `9201559cc3be058e724e071f0a5684ef` / order `fleet-9c05bef2c315848a6bfd403fc16cf9b1` 正式运行时，由 Browser 于约 `03:18:54.782 UTC` 明确普通撤单，command `6fe1a4c387d13c8978d3b5a5a57f58e3` 为 ACCEPTED。普通 withdrawal 仍为官方 `immediate=false`：内核 `03:18:55.385` 已 WITHDRAWN，但 Bridge 仍完成已下发运动至 R-EXIT，约 `03:19:43.403` 才见内核 FAILED 与实际零速度。独立运动采样的持续停稳窗口为 `03:19:43.032 → 03:19:45.032 UTC`，距撤单请求约 48 秒才开始停稳，不称立即停车。

后端严格核对同源/同版本、保留原 movement ID、Bridge lastNode 与内核位置一致、空执行图、安全状态、无活动订单及持续新鲜停稳，封存 `FAILED / settled=true / confirmed=false`。Browser 实际确认见 [失败收尾图](../../agv-digital-twin/environments/p0-pair/artifacts/cancel-failed-stationary-sealed.jpg)。LAB-02 peer Run `85d609343f0bdb44b5e22f4070103276` / order `fleet-f6e8a541685394e3564b50328bc3cffe` 后续 FINISHED。独立原用例共 1045 个 HTTP 采样、无源读取错误/READY=false/双 owner 采样，归属 `[]→LAB-01→LAB-02→[]`，最小新鲜真值中心距离约 1.4687 米，均只限采样。见 [普通撤单独立摘要](../../agv-digital-twin/environments/p0-pair/artifacts/cancel-case-independent-summary.json)。

实际撤单位置是 R-WAIT 转向、peer 等待；未命中 CROSS 的窄时间窗口。不能把该用例标成“狭窄 CROSS 正中撤单”通过，也不能将采样间距换算为连续无碰撞证明。

### 同会话 MQTT 断开与重新观察

后续新返程意图中，实际触发点为 LAB-02 在 R-WAIT 转向且持有 SHARED-CROSSING，LAB-01 等待。Broker 明确 stop 于 `03:31:25.651 → 03:31:27.921 UTC`，ROS/Gazebo/仿真时钟继续；Browser 实见双车 UNKNOWN、原身份/历史保留、Start 禁用。Broker start 于 `03:32:31.187 → 03:32:31.627 UTC`，worker、每车 sourceId、release 均未变；恢复新鲜 MQTT/物理零速度，但双 Bridge `paused=true / FATAL MQTT_DISCONNECTED` 锁存，准入仍 false，未自动继续。注入位置及原速度见 [故障触发前读回](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-mqtt-pretrigger-summary.json)，重连见 [原始恢复读回](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-mqtt-restored-readback.json)。这是同进程网络链路恢复，不是跨 session 认领或旧任务自动重放。

LAB-01 A4 Run `3ac3ed37878bfa4bbd16a92f114cc9d2` / order `fleet-d23b64a6497de65960da511c7768a513` 与 LAB-02 B2 Run `d1a5d5a4424b7623c69f666042811b14` / order `fleet-3c9cb420f2cc0e5c1906529895743745` 分别经 Browser 明确普通撤单，原 command 为 `c7b580dcc610f79694fc70093c206c54`、`3a3d42780cc6d43e7eb98e4abf00e394`，均 ACCEPTED。A4 内核 FAILED、无活动订单，但 Bridge 保留上条已完成 A3 的 movement ID；B2 长期 WITHDRAWN、仍有原 active order 与已下发 node/edge，owner/资源保留。没有用正常撤单受理或零速度假称资源已释放，原缺口见 [只读阻断证据](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-mqtt-normalwithdraw-readonly.json)。

观察 API 明确区分 `observation.status=UNKNOWN/TRUSTED` 与新任务准入；断连保留原 Run/order/command/source 及 `lastTrustedObservation` 历史资源，不把历史拼入当前缺失源。重连只 GET 恢复可信观察；故障仍阻断时 UI 明示“观察已恢复，故障 / 准入仍阻断”，不自动重发或恢复行驶。

### 明确的已停稳故障任务收尾

为闭合已复现的普通撤单阻断，新增单独 operator-only、enabled 固定 pair SIM-only 的 `finish_stopped_run`，界面为两步“结束已停稳的故障任务”。该操作使用新唯一 requestId、既有 v1 CommandService/耐久回执及原 transport_order 资源链接，不复用普通撤单 ID；automation 即使误配置也拒绝，默认无 recovery guard 或直接提交未匹配 prepared 完整原信封均拒绝。协议细节见既有 [管理协议](../../Fleetserver/docs/PROTOCOL.zh-CN.md)。

副作用前服务端再次核对原 Run/order/vehicle/release/hash/source、两车同会话新鲜 VDA/里程计/时钟、安全状态及锁存故障；三个不同 VDA timestamp/headerId/receipt 源观察跨至少两秒，每帧有新鲜物理零速度和时钟推进。这不是三个不同 odom stamp 的声称。authorized/smoothed 零速度仅作新鲜佐证，陈旧 final cmd_vel 明确保留陈旧年龄，不造 heartbeat。还核对双车位于 canonical 已知节点、Bridge lastNode 与内核位置一致、VDA 位置距节点≤0.12 米（模型毫米转米）、SHARED-CROSSING sole owner 精确为原车、peer 无活动意图/claims/共享分配。新 VDA 但时钟冻结/回滚、负年龄、双 owner、错误/离节点、旧 source 或任何不可信来源均拒绝。

只有该明确操作调用官方 withdrawal `immediate=true`，含义为已确认停稳后结束旧内核意图；不是急停，不清故障、不恢复 READY、不修改资源或本地 reconcile。HTTP 不确定保留原 ID，仅查原回执，不自动重试。ACCEPTED 后仍须新的车载 cancelOrder action FINISHED、空执行图、无活动订单及持续新鲜停稳才封存。

主验收者唯一实际恢复 command `4276dda440c372da5de57b4ec4db3a6c` 于 `03:52:15.197 UTC` ACCEPTED。新 VDA action `29dfe9ff-f24d-4cb5-949b-1fe9be5b19ae` 于 `03:52:15.243 → 03:52:15.294` 从 RUNNING 到 FINISHED，约 51 毫秒；该时间是已停稳状态下动作确认，不是运动中的停车时间。后置三个 VDA header 2181/2182/2183 的源时间 `03:52:15.338 → 03:52:17.339` 跨 2.001 秒，新鲜里程计零速度、时钟推进；B2 FAILED/settled=true/confirmed=false，empty graph、无 active，原 R-WAIT owner 仍保留，故障与 READY=false 保持。独立证据见 [后置证明](../../agv-digital-twin/environments/p0-pair/artifacts/stopped-recovery-postproof-independent.json)，[Browser 封存图](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-stopped-failed-stationary-sealed.jpg)。

A4 失败收尾严格关联本库同 deployment/car/session/release、在本 Run 创建之前已 FINISHED/confirmed/settled 的 A3 Run `ab52a4c9dafc4801d87adf0da99e31cb`，保留 movement ID 必须精确映射 A3 自身 order 或固定单 driveOrder 的 `-0`，且同终点/节点；记录 `closurePriorCompletedRunId`，A4 confirmed 仍 false。不称 A4 已执行、成功或确定从未下发，不接受任意旧 ID 空图作为证明。

故障业务 publication 经 Browser 显式停用于 `03:55:27.960 → 03:55:31.515 UTC` RETIRED，约 3.555 秒；旧 journal 保留，各组无剩余进程/无 SIGKILL。见 [分组退出摘要](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-business-retirement-groups-summary.json)。同一 worker source 的旧任务没有因恢复而重放。

### 性能与已发现的交互缺口

原 Run GET 默认嵌入至多 300 条完整证据，旧 Run 实测 22,241,112 bytes / 4.859 秒；每 5 秒刷新还会重复读取所选 Run，导致显式发单等待后台读取。改为默认 recent 10 + `evidenceWindow.total`、内部 observer 读 body、前端同 Run 复用；完整不可变证据仍在原分页接口，未删库。相同旧 Run 实测 1,294,584 bytes / 0.172 秒，total 238 保留。见 [部署后大小与身份核对](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-performance-deployed-readback.json)。这是一组本机读回，不是生产性能承诺。

发布页忙于后台读取时，draft/release/target/revision 选择原先可点但被静默丢弃，现忙时明确 disabled、完成后恢复；主发布记录同 requestId 自动从 PREFLIGHT 更新 READY，不抢别的历史选择，两项已实际 Browser 复验。恢复命令后，旧“诊断与源证据”展开巨大 JSON 使 AX 读取超时，原 tab13 关闭，重新从同一门户 tab14 读取原身份，没有补发。诊断改为有界摘要：原 ID/时间、收尾依据、每车 odom/nav/safety/action ID、资源有限项及总数、轨迹 count、最近十条证据索引/状态/源时间；明确非全量，原始证据仍服务端分页保留。该摘要已在同一 IAB 新 tab15 授权后实际复验：点击原 B2 FAILED 历史并展开诊断，AX 读取约 0.57 秒，pre 19100 字符，summaryOnly=true；可读 newCancelOrderFinished=true / settled=true / confirmed=false 及保留故障，能收起且未再卡顿，见 [实际摘要图](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-bounded-diagnostics-browser.jpg)。第二页保留原恢复 command `4276...` ACCEPTED，没有再 POST。375 的 DOM 实测为 viewport 375×812 / scrollWidth 360，无横向溢出；[原 375 历史截图](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-final-history-375.jpg) 实际只有 360×203，视觉复核发现 viewport 切换合成过渡，窄内容占旧桌面一侧，保留原文件但不作为 375 视觉通过证据。[320 历史页](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-final-history-320.jpg) 实际图像 285×660、[320 展开摘要](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-final-diagnostics-320.jpg) 实际 305×705，主验收者视觉确认可读；其 CSS viewport 为 320×740 / scrollWidth 305，展开摘要 19100 字符仍无横向溢出。截图像素尺寸与 CSS viewport 分开报告，未改图或删除原记录。临时 tab15 关闭，tab14 保留新运行；旧 tab13 的实际卡死仍作为已修复缺口保留，不能抹去。

目前检查为后端 gateway **123/123**、Node **97/97**、Runtime **48 项**（含 shutdown 9 项，及既有 pair/release/observation/simulation/telemetry 定向检查；此前 ROS 检查保留历史，不冒充本次重跑；[Runtime 检查记录](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-runtime-validation.json) 的创建时间不是新的测试执行时间）、schema --check、JS 语法及 14 项静态资源 source/target/manifest/HTTP 一致，分别成立，不相加冒充 Browser 用例。新增恢复门控负例覆盖默认拒绝、raw 绕过、automation、同 ID 改内容、unknown 不重发、锁序、旧/变会话、时钟冻结/回滚/负年龄、双 owner、peer 仍持共享资源、节点不符、车载取消尚未完成及严格历史谱系。

### 受控重新投入与最终停用

主验收者另明确冻结并发布新 release `654eb658b647402f9e592af562f2b328`，于 `03:56:40.877 UTC` READY，再明确发新 Run `2ed7d5f7baa45c4b7ace0cc66c3692b3` / order `fleet-9d9531f32099a94438cee2464252cff5`、command `aa162f49131f52397c9935613e21eae8` 开始正式导航。最终 FINISHED / confirmed=true / settled=true，源观察至 `04:01:39.995 UTC`；Browser 已实际读到到站、无活动订单与持续停稳封存，见 [新导航完成图](../../agv-digital-twin/environments/p0-pair/artifacts/recommission-navigation-finished.jpg)。独立 VDA header 302..305 源时间 `04:01:36.155 → 04:01:39.154 UTC` 跨 2.999 秒，前三帧仅 1.999 秒，未冒称前三帧已满两秒，见 [重新投入独立后置证明](../../agv-digital-twin/environments/p0-pair/artifacts/recommission-independent-postproof.json)。这是退役后显式新冻结/新发布/新意图，不是旧任务续跑或跨 session 自动认领，也不泛化为实车原地恢复。

主验收者再明确停用新 publication，于 `04:02:40.341946 → 04:02:43.913979 UTC` RETIRED，约 3.572 秒，见 [最终停用图](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-final-retired-publication.jpg)。[最后桌面 RTS](../../agv-digital-twin/environments/p0-pair/artifacts/recovery-final-rts-desktop.jpg) 实际图像为 1265×712，CSS viewport 已恢复；不将 viewport 设置值当作截图像素尺寸，唯一 tab14 作为交付页；没有自动发单。[最终账本审计](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-final-retired-ledgers.json) 与 [进程/组/journal 审计](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-final-processes-groups-journals.json) 确认 Worker STOPPED、publication RETIRED、owned token/Gazebo 进程均 0；两车 TO_BE_IGNORED、position/active/allocated/claimed 均空。内核仅有新 order `9d...` FINISHED，跨会话历史不从当前内核推算：RunDB 10 条全部保留，新 Run `2ed...` confirmed/settled；14 command / 14 唯一 requestId，唯一恢复 `4276...` 恰一次，三条普通 cancel 原 ID 无重复。两个 release 的 pair/leaf groups 无 SIGKILL、无剩余进程异常，journal 保留。Gateway PID 92152 在线，stderr 0 bytes。[紧接审计的单次 CPU](../../agv-digital-twin/environments/p0-pair/artifacts/shutdown-final-idle-docker-stats.txt) 为 Worker 1.99%、kernel 0.66%、MQTT 0.02%，不是稳态性能 SLA，不能套用先前轮次的 0.01% 数值。[最终独立审计](../../agv-digital-twin/environments/p0-pair/artifacts/cancel-disconnect-recovery-final-independent-audit.json) 已自然完成全部采样：重新投入窗口 `03:57:32.598240 → 04:04:32.122567 UTC` 共 839 个顺序 HTTP、4199 个 ROS 采样，无源读取错误。正式停用前 618 个 running 操作期样本 READY=false 为 0；停用过程中 index 618/619 于 `04:02:41.992306 / 04:02:42.484971 UTC` 仍 running 但 READY=false，原 blocker 为“pair runtime stopped; explicit release review required”，是主验收者授权的计划收尾、子进程尚在回收阶段，原两帧完整保留，不隐去或借此宣称所有 620 个 running 样本全 READY。末态 STOPPED/资源空。旧前测 900、后测 900 与随后 180 帧原始文件 SHA 仍与旧 manifest 一致；无未完成采样或剩余审计 finding。

本追加范围限定通过：正常撤单受理没有被当作实际停稳；MQTT 复连只恢复观察而保留故障/原身份；唯一明确的已停稳故障任务收尾在服务端严格门控下完成，车载后置证据验证后才封存失败；随后显式新会话的独立新导航成功，并再正常停用。未测试的窄窗口和模式仍保持未验，不能扩称任意通信恢复、紧急停车、完整 NPI 或生产安全。

## 有界场景编排与只读回放（2026-11-09 UTC，实际记录，最终复验待补）

本节追加本轮实际证据，不覆盖以上任何历史结果。基线为 **10 Run / 14 command**，原完整证据 3356 行约 408 MiB。场景编排限定固定 pair SIM、最多 8 步、每步延迟至多 60 秒；保存、冻结、明确开始后，后台经既有 Run/v1 ledger 派发。Run/request ID 先持久化，完整信封在第一次实际派发前才准备一次；已准备、已提交或不确定意图不刷新 TTL、不自动重发。普通撤单、失败或未知立即暂停剩余派发，已发任务仍须独立核对实际收尾；“停止剩余作业”只跳过未提交步骤。

### 场景一：取消等待车辆，停止未派发的依赖步骤

Browser 明确保存、冻结并开始 scene `bb9a574d4c31feeeb677fb14066a7b1c` / execution `76390cac6525e6cd883cbf7605eba335`，绑定 release `93c331d09f96475f90ebbed6c2204bd3`。配置为 A：LAB-01→LAB-01-EXIT；B：LAB-02→LAB-02-EXIT、延迟 10 秒；C：LAB-01→LAB-01-STATION、依赖 A 成功。B 的延迟在新增 C 后仍保留；此前输入只监听 change 导致重绘丢失值及组件样式问题保留为本轮发现并修复的交互缺口，不冒称初版即正常。

| 步骤 | 原 Run / command | 实际结果 |
|---|---|---|
| A | `00b4acb47eb74f1eb680644c0ca01ca0` / `2fae4dce3a04418b99ce13dfe8bf3c1f` | order `fleet-126cbb385b69e2f11839c315a297674f`；最终 SUCCEEDED，confirmed/settled/到站/无活动订单为 true，实际 R-EXIT 停稳 |
| B | `da9d81e8d6854ec59322076b0b7daa73` / `849a932e6275425b978da5d03226384d` | order `fleet-57839793010b44eaa4288e0ad2937e6a`；等待时由 Browser 普通撤单 `0dd51a6a010a63f6397584eb06def866`，最终 FAILED/settled=true/confirmed=false，R-STAGE 持续停稳 |
| C | 预分配 `c0a64b85d14e46de86dc5624a261989d` / `2b61e7b6dd4e48fc9096d58fee2d8df8` | 始终没有真实 Run、完整命令信封或命令账本行；NOT_SUBMITTED 后由 Browser 明确停止剩余作业为 SKIPPED |

独立 `05:55:32.079 UTC` 采样中 A 实际里程计 vx≈0.05 m/s、odom age≈0.012 秒，占共享成员 L-WAIT/CROSS；B 已 assigned、claims 与共享占用冲突、仅持 R-STAGE，实际零速度、odom age≈0.0055 秒、MQTT age≈0.604 秒。该窗口支持“撤销真实等待任务”，不冒充块内移动取消。场景于 `05:56:08.082` 首次被采到 PAUSED_REVIEW，B `05:56:11.083` 首次被采到 FAILED，A `05:58:34.148` 首次被采到 SUCCEEDED；C 未因 A 成功而偷偷派发。Browser 明确停止后，`05:59:43.147` 首次采到 execution STOPPED/C SKIPPED。上述是采样首见时间，准确事件时间另见持久事件记录。

原 IAB 全部标签页关闭的保守见证区间为 `05:57:13 → 05:58:30.940 UTC`，至少 **77.94 秒**；未知的更早实际关闭时刻不伪装为精确值。78 个独立样本保持相同 execution、12 Run/17 command、C NOT_SUBMITTED/无信封，A 从 CROSS 经 R-WAIT 到 R-EXIT，B 全部停稳。重开恢复原身份。此结论仅限主验收者的 **IAB tabs**：外部 Chrome/其他观察客户端在该窗口未盘点，不能声称所有浏览器均关闭或完全排除其他观察者。见 [IAB 窗口审计](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-browser-closed-independent-window.json)、[第一窗摘要](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-first-window-summary.json)。

### 两笔验收外手动任务及场景二的实际起点

在场景一停止后，账本另出现两笔直接 v1 导航，没有对应 SIM Run：`06:04:17.507743 UTC`，command `6ea4e79aa787af84d775badbcc25d0c8`，LAB-02→LAB-01-STATION、order `fleet-29641776228baffa63d48e281abc69c2`；`06:04:29.838804 UTC`，command `c170627d26066367a0f5da3dbe3edc86`，LAB-01→LAB-02-EXIT、order `fleet-7c885dd6afdd94fed819c7c6288c222a`。主验收者明确表示两笔均非其正式场景动作；用户明确确认第一笔为本人手动提交，第二笔没有另行取得独立用户确认，不能补造归因。

两笔均标记 **EXTERNAL_TO_ACCEPTANCE**，第一笔另标 USER_MANUAL，不算场景二或旧 C，也未由审计者自动撤销。两笔实际 order 最终 FINISHED、双车新鲜停稳/内核无活动订单；不能称为 SIM Run confirmed/settled 封存。原先仅冻结、未执行的 scene `79e3c9…` 保留，随后按实际 LAB-02 位于 L-STAGE、LAB-01 位于 L-EXIT 重建新的正式方案。见 [独立外部任务记录](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-external-to-acceptance-command.json)。Gazebo GUI 观察客户端由主验收者另行核对，不能借其存在追溯推定早先 IAB 关页窗口的观察客户端状态。

### 场景二：仅 Gateway 重启、原任务继续、明确派发后续步骤

Browser 于约 `06:15:23 UTC` 明确开始新 scene `45cdaeb73a3d0800880dcb179698662e` / execution `0cac321d26289d05766bb8b5907d2fe5`：第一步 LAB-02→LAB-02-STATION；第二步 LAB-01→LAB-01-EXIT，依赖第一步成功。原 worker source `p0-pair-worker-01:363aaea8de8d42a3a1d5edc9140c3fa0` 和 release 保持。

第一步 Run `f02745d6a438418ab931c14c6b49fc58` / command `d34bab2835c14dee986f6c478cc2b508` / order `fleet-0414fc3f7cb58ffe8e720d5b828bc213` 于 `06:15:24.108970 UTC` ACCEPTED，随后有新鲜实际运动；第二步仅预分配 Run `2ecd0ed557c946a795161c20b4fbad8d` / request `1316401be99a4ebb8c61ba48224a4e2b`，尚无 Run/完整信封/回执时，主验收者明确仅重启 Gateway。停止前见证 `06:16:13 UTC`，新服务 UPSTREAM_RECOVERED `06:16:50.337 UTC`；Worker、Broker、内核、世界未作为该故障动作重启。

独立重启前后原车从 L-STAGE 到 L-WAIT，实际 vx≈0.0394→0.0438 m/s，simTime 1736.758→1773.804；同 Run/order/request/source 保持，原信封 SHA `fc44f238…c0e`、issuedAt `06:15:24.009788`、expiresAt `06:17:24.009788 UTC` 未变化。重启后的 execution 持久 PAUSED_REVIEW/GATEWAY_RESTART_REVIEW_REQUIRED，原 Run 短暂 UNKNOWN 后恢复 SUBMITTED；第二步继续 NOT_SUBMITTED/command=null，13 Run/20 command 恒定。33 个 execution GET 断连错误样本保留，不能删去再称读取全程成功。两个 IAB 页恢复相同 execution，未重复开始。见 [Gateway 重启独立窗口](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-gateway-restart-independent-window.json)。

第一步成功停稳封存后，Browser 第一次明确继续：持久事件 `06:20:54.158766 UTC`，第二步第一次准备信封 `06:20:54.651052 UTC`，同预分配 request 于 `06:20:54.810333 UTC` ACCEPTED，order `fleet-b7fd5d131582c81cf75b465077c4f941`。此时仅 20→21 command、13→14 Run；第一步原信封不刷新，第二步新信封 TTL 从首次派发开始，不使用开始场景时已过期的全量信封。

### 额外负年龄安全暂停、长记录空窗与明确收场

第二步运动中，本轮另出现非计划暂停：原 Run evidence sequence 3783 于 `06:21:46.463918 UTC` 为 UNKNOWN，错误 `RUN_BRIDGE_SOURCE_STALE_OR_UNAVAILABLE`；原 MQTT header 2082、VDA timestamp `06:21:46.290 UTC`，wallAge 为 **−0.001466537 秒**。前后有效行约 0.818/0.457 秒。独立源审支持测量竞态：报告较早采样 now，Paho callback 随后更新 receipt，再使用旧 now 计算年龄；不能称为实际 MQTT 停发。既有严格门控保持失败敏感性：场景 STEP_UNKNOWN→PAUSED_REVIEW，观察恢复后不自动继续，原任务仍执行。原证据见 [非计划暂停](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-unplanned-source-stale-pause.json)。

修复改为同一锁内冻结 MQTT entries、采 monotonic、计算原始 age，不 clamp，不放宽阈值；真正未来 receipt 仍负、旧 receipt 仍过期。独立相关 observation/pair 定向检查 22 项通过，含确定性锁内时钟和并发 callback 回归。随后仅在旧世界正常退役后部署新镜像，并另行新发布及 60 秒 idle 就绪观察，实际范围见本节末尾；不能用旧世界运动冒称修复后长运动复测。

第二步最终 STEP_SUCCEEDED 持久事件时间为 `06:24:19.910855 UTC`。第三采样窗并未完整取得 900 帧：仅 **540 帧**，最后一行于 `06:24:46.079 UTC` 开始，其中 orders 请求从 `06:24:48.142` 至 `14:36:45.976 UTC` 才以 TimeoutError 返回。不能证明这段约八小时空窗内车辆/服务连续稳定，也不能据请求耗时断言 MQTT、Worker 或物理源中断了八小时；原因未证实。该行早先 ledger 与 `14:36:45.978 UTC` 的 execution GET 分属两个时间，不能拼成同步快照。见 [记录空窗审计](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-capture-recording-gap.json)。

另授权的新 60 秒只读窗 `14:42:15.090 → 14:43:14.121 UTC` 完整 60 帧、读取错误 0，双车 READY/新鲜实际停稳、内核无活动订单，14 Run/21 command 不变、基线校验全部保持。主验收者据新鲜观察进行**第二次**明确审阅继续，仅用于双步成功后的场景收场：`14:43:47.026196 UTC` EXPLICITLY_CONTINUED，`14:43:47.103415 UTC` EXECUTION_COMPLETED。STEP_PREPARED 仍仅原两条，没有新的 Run/request/命令，不伪装本例只有一次 continue。见 [完整场景收场读回](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-second-execution-completed-readback.json)。

### 回放合同、采样账本与待补最终验收

离线完整 3356 行原历史纯投影得到 3329 帧、零异常。保存的 Nav2 计划使用容器 frame=map，原点无独立 frame 不当作缺计划；真值 frame=world 没有已记录 map 变换时不叠加。旧 factsheet/initPosition FINISHED 是首帧 baseline；唯一恢复 cancelOrder 在 Run 历史首次出现已是 FINISHED，回放标 firstObserved，不补造未记录的 RUNNING。Kernel 没有原 source timestamp，资源 age 保持未知；source sample interval、recording interval、UNKNOWN 各自标缺口，不把缺记录称为发布端断流、不跨缺口插值。

execution GET 只读库，返回真实存在的 recordedRunIds、每步 runRecorded 和固定 eventsThrough/evidenceThrough；预分配但没有 Run 的 NOT_SUBMITTED/SKIPPED/UNKNOWN 留在步骤清单，不请求虚假 Run。场景事件全分页按固定 highwater 和 execution 过滤，即使零 Run 仍可看编排事件、无假轨迹；真实列出的 Run 404 不吞。Run 与 scenario events 使用独立身份和 sequence 命名空间，scenario `at` 仅是 Gateway 记录时间、物理 sourceTime=null。投影缓存有界、原证据保留，seek 不重复加载数百 MiB JSON；回放不调用 observe、准入或控制。上述独立后端 27 项与回放前端 12 项检查成立，见 [独立合同复核](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-replay-snapshot-independent-review.json)、[完整历史投影](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-replay-projection-candidate-audit.json)。

主验收者已在最新 Browser 候选实际复验场景一 End 精确到 max=275.385 秒；两车以已封存停稳的静态历史 marker 呈现，不制造运动或记录缺口。320 窄屏无横向溢出，历史模式隐藏误导的 live header 告警，见 [320 最终图](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-replay-320-final.jpg)。本段只记录主验收者已通知的范围；最终 375 和旧 B2 End 截图复验仍待通知，不能借旧截图或离线测试提前补为通过，也不把候选编号冒充测试数量。

第一、二采样窗各 900 帧，第三 540 帧及另一次新鲜 60 帧分别保留；每窗基线原 command/body 与已封存 Run 校验均保持。原 10 Run/14 command 未删除，最终 **14 Run/21 command** = 原 14 command + 场景一 2 create/1 cancel + 两笔验收外直接 create + 场景二 2 create。场景 C 无 Run/command，原 scene `79e3c9…` 仅冻结未执行。见 [三窗摘要](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-captures-combined-summary.json) 及各 `scenario-audit-*.baseline.json/.final.json`；新 60 帧另见 `scenario-audit-continue-20261109T144215Z.*`，不合并掩盖长空窗。

从本 release 冻结的 7 个 shared members 核对，三旧窗中 2267 个可核 vehicle 采样未见双 owner，2263 组同 world 新鲜真值的最小采样中心距离约 1.469 米。窗口有重叠、Kernel/Worker 为顺序读取；这不是独立连续帧总数、同一物理时刻采样或连续时间无碰撞证明，缺源/长空窗均未知。见 [采样互斥与距离审计](../../agv-digital-twin/environments/p0-pair/artifacts/scenario-sampled-allocation-independent-audit.json)。

本轮旧 publication `7409…` 经 Browser 明确停用，`14:45:32.003478 → 14:45:35.764107 UTC` RETIRING→RETIRED，约 3.7606 秒。随后仅移除 GUI 观察容器并 recreate Worker，载入 image `sha256:578f20d449078c2ba94a20df1e3611146e2dbe104e60e35e7cc63eaed53e4066`，不重启内核/Broker/Gateway、不改账本、不自动 apply/order。部署启动及原库计数见 [部署记录](../../agv-digital-twin/environments/p0-pair/artifacts/mqtt-snapshot-worker-deploy-20261109T1446Z.txt)。

Browser 再明确冻结/发布 release `94f49085a48a42be8f46a1db227aff56` / publication `c1b1151c4cf30eda7b06657a80b5105b`，`14:48:41.206734 UTC` READY，新 worker source 为 `p0-pair-worker-01:e5d6ae3df8284b68a8dd697a6d7e6702`。独立 `14:49:58.270 → 14:50:57.360 UTC` 完整 60 帧、读取错误 0，60/60 aggregate READY/admissible、双车新鲜实际停稳、kernel 无 active/0 orders。原 MQTT header 各 83→142，VDA 源时间和 receive Unix 原值均前进；wallAge LAB-01 为 0.5194–0.7152 秒、LAB-02 为 0.4833–0.6804 秒，负年龄 0。14 Run/21 command 恒定、全部基线校验保持，见 [修复后独立 60 秒观察](../../agv-digital-twin/environments/p0-pair/artifacts/mqtt-snapshot-final-independent-60s.json)。这只验证本次新会话 idle 就绪，不是新镜像长运动、满负载、任意竞态或生产通过；没有为补证再下新长任务。尚待的最终 Browser 项由主验收者统一补齐，本节不另立进度总表。

<a id="motion-presets"></a>
## 2026-11-09：快速开发档、工况验收档与最终复盘布局

这是上述结果之后的追加验收，旧失败、长空窗、原始证据与账本均保留。范围仍限本机 `p0-pair / LAB-01 + LAB-02`；本轮只新增 **3 Run / 4 command**，最终 **17 Run / 25 command**。没有重跑长距离全量仿真，也未为本轮重复注入旧断连故障。

### 版本和实际参数

门户在冻结前提供默认“工况验收档”和“快速开发档”。选择卡片只影响下一次冻结，不修改当前运行；换档须明确停用、冻结、发布。档位沿 release→准入→Run/方案→回放保存，历史没有记录则显示“历史记录未记录档位”。相同作者草稿 `28d2814f8b58426d963456639e098bba / r1` 未改写，快速档把每条作者限速乘三，保留相对慢路段；自己的快速图重新导入时按精确配置与不可变来源映射还原，未知高限速模型明确拒绝，不猜测除三。

| 参数 | 工况验收档 acceptance-v1 | 快速开发档 development-v1 |
| --- | --- | --- |
| 最高线速 / 角速 | 0.05m/s / 0.25rad/s | 0.15m/s / 0.75rad/s |
| smoother 线加速 / 减速度 | +0.1 / −0.1m/s² | +0.3 / −0.3m/s² |
| smoother 角加速 / 减速度 | +0.5 / −0.5rad/s² | +1.5 / −1.5rad/s² |
| 作者路段限速系数 | 1 | 3 |
| 世界倍率 / 最大物理步长 | 1× / 0.002 秒 | 1× / 0.002 秒 |

工况档保留原物理基线，补齐 Bridge factsheet 的真实加减速度声明；旧无档位版本仍使用原字节/哈希与默认声明，不回填历史。基线 Gazebo 未配置的角加/减速度等独立层字段标 null，不把 smoother 限值冒作每层均配置。快速档显式设置两台 DiffDrive 的线/角速度与加减速度，生成前要求每台恰有一个 DiffDrive。Bridge 保守制动投影仍采用反应 0.5 秒、减速度 0.1m/s²；TF、数据新鲜度、停车与路权门槛未放宽。

旧版本 `94f490…` 经 root Browser 于 `16:12:03.922285→16:12:07.917406 UTC` 明确退役（约 3.995 秒）。Worker 更新至镜像 `sha256:239d65f055bdcb71ce79867fdbbd94ecb7b61ed9b8d69d6bd002ebde8fe64b92`，新 source `p0-pair-worker-01:6497da3e96f349988e30cf93ef1b800b`；启动 STOPPED、无自动 apply/order，14/21 账本不变。GUI-only 观察容器先移除以解除 container 网络依赖，未删卷。Gateway 加载新 API 与静态资源，原数据库和 deployment identity 保留。

root Browser 发布工况 release `3ac3a46d8cc448199e6b59f9ea8cd85c` / request `8fe249dadfb5364861f2528470f4771e`，`16:14:43.963686 UTC` READY；完成后于 `16:18:56.754179→16:19:00.450340 UTC` 退役（约 3.696 秒）。随后同一草稿冻结快速 release `2ce4ad21018c4d52aa2bc7b76184bf36` / request `d02b222523bc0bafd956e68dac4e09b9`，`16:19:43.266203 UTC` READY。当前最终保留此本机快速版本及 `gz sim -g` 观察窗口，双车停稳、无活动任务；不自动退役或恢复任务。切回工况须再次明确换版。

双车实际 GetParameters、生成资产、world/profile/configuration hashes、原始 factsheet 与 Kernel 12 条路段均独立核对一致。工况 Kernel cap 50mm/s，快速 150mm/s；factsheet 保留原发布时间与 receipt age，不能把 commissioning 声明当作新鲜运动证据。见[工况实际参数](../../agv-digital-twin/environments/p0-pair/artifacts/motion-preset-acceptance-actual-20261109.json)、[快速实际参数](../../agv-digital-twin/environments/p0-pair/artifacts/motion-preset-development-actual-20261109.json)。

### 最小真实仿真矩阵

1. 工况 LAB-01 从独立观察的 L-STAGE 经 L-WAIT、90°转向到 LAB-02-EXIT（L-EXIT）：Run `f58b2dc19ed4b75604f096b60b9948ee`，create `b1b61b382961f75189d64af75d505a8b`，FINISHED、confirmed/settled=true。三次不同源停稳观察 `16:17:40.219057→16:17:42.291526 UTC` 跨 2.072 秒，无活动任务。
2. 快速 LAB-01 同起点同路线：Run `c8235de4ccae49da4cf16058f13f46b2`，create `561f98c9dbdcafe83b0b824e3ebe69f9`，FINISHED、confirmed/settled=true。三次不同源停稳观察 `16:21:48.654512→16:21:50.947610 UTC` 跨 2.293 秒，无活动任务。
3. 快速 LAB-02→LAB-01-EXIT：Run `5c3c040ebf282649ebfe9cc80f729330`，create `f24fc60e190f5d046153edc3e7fb9313`。独立 `16:21:23.003 UTC` 新鲜窗口中 LAB-01 独占共享 L-WAIT；LAB-02 仅分配 R-STAGE、声明 R-WAIT 并等待，保持停稳。root Browser 见“等待通行”后正常撤单 `4d4cec6b4aadbd01c4b9315fd6beada1`，ACCEPTED 与实际停车分别核对。最终 FAILED、confirmed=false、settled=true；四次源停稳 `16:21:39.570965→16:21:42.168879 UTC` 跨 2.598 秒，claims 空、仅保留起点 R-STAGE allocation，不能称释放全部资源或成功到站。

工况与快速分别取得约 180.221 / 180.225 秒只读 ROS+MQTT 窗口（29421 / 25452 ROS 事件；每车各 180 条 VDA state），HTTP/账本同窗保留。采集只订阅、GET、读库；控制均由 root Browser 发出。原基线 body/hash 校验保持；刷新、第二标签页和回放没有新增业务命令。Run 没有原始 startPoint 字段，门户诚实标“起点未记录”；本次独立起点见证不回填数据库。

原 SDK released edges、requested→authorized→smoothed→final 与 LAB-01 实际 odom 均证明两档生效：实际线/角峰值约 0.05/0.25 与 0.15/0.75，无速度越界样本。去重原 odom simstamp、仅用 0.2–0.4 秒原源时间窗口、不跨缺口计算后，LAB-01 工况线加/减速峰值约 0.1000/0.0833m/s²、角加/减速 0.4167/0.5750rad/s²；快速为 0.3000/0.3000 与 1.2225/1.5000。均在预设回归容差内，原峰值/p95 未裁剪，odom gap=0。B 仅等待撤单，没有验证 B 的动态能力；本轮也没有运动中急停/断连的新停距结论。原始窗口与[工况分析](../../agv-digital-twin/environments/p0-pair/artifacts/motion-acceptance-independent-audit.json)、[快速分析](../../agv-digital-twin/environments/p0-pair/artifacts/motion-development-independent-audit.json) 分别保留。

同短路线从 issuedAt 到封存 observation 的墙钟耗时分别 **111.272406 秒 / 53.393438 秒**（约 2.084 倍、减少约 52%）。这是包括受理、运动、减速、到站和收尾的两次单样本观察；工况时 GUI 停用、快速时 GUI 开启，实际 CPU/RTF、导航与到站减速不同，不能称严格 paired benchmark、三倍总吞吐或生产节拍保证。没有用瞬时 RTF×墙钟推算物理耗时。

### 最终 Browser 与页面质量

root 使用内置 Browser 实际完成冻结、发布、准入回读、发单、等待、正常撤单、收尾和换版。第二标签页与刷新恢复同一运行；在工况运行时选择快速卡仅影响下次冻结，当前准入仍是工况档；当前世界为快速档时，工况 A 的历史回放仍显示原工况档。

最终复盘 h1 为“运行复盘”，单一历史只读提示，任务明细默认折叠，实时车辆/模型侧栏收起；计划路线、已分配路段、定位轨迹、仿真真值分层，源与技术详情按需展开。1280×720 桌面地图与事件两列，地图顶约 500.36px、首屏可见约 220px；375/320 窄屏单列、无横向溢出。场景一 End 精确 275.385 秒；原断连 B2 End 精确 1661.289 秒、显示最终失败但已停稳收尾；新快速 B End 21.42 秒能区分撤单受理与持续停稳。未知或缺记录不补轨迹，封存后保持空心历史位置。

实际视觉发现并修复 radio 被通用表单拉伸的问题，最终 16×16、横向卡片；375 宽卡片单列无溢出。任务标题不再以持续变化的当前位置冒作原始起点；当前/封存位置分别标注。未封存失败任务显示“任务未成功，停稳与收尾待核对”，不再显示“正在执行”。“回放速度”明确区别于车辆档位。见[最终复盘图](../../agv-digital-twin/environments/p0-pair/artifacts/motion-replay-fast-cancel-final.jpg)、[窄屏图](../../agv-digital-twin/environments/p0-pair/artifacts/motion-replay-320-final.jpg)、[档位卡](../../agv-digital-twin/environments/p0-pair/artifacts/motion-preset-cards-fixed-final.jpg)。真实 Gazebo GUI 已聚焦目视两车，见[实际观察画面](../../agv-digital-twin/environments/p0-pair/artifacts/motion-gazebo-development-view-visible.png)；另一个未聚焦背景截图不作为仿真证据。

前端最终 Node **140/140**、后端 **157**、Twin **168/1 skip**、Bridge colcon **29** 分别通过，原管理 v1 schema 无漂移；不合计为 Browser/真实用例。静态包为 17 项白名单资源，SW v13；新文件留在既有职责目录，运行凭据/采样留 ignored runtime/artifacts。完整网站框架、任意地图、通用编排与实车工况仍按主方案推进，本次没有扩大出口。

<a id="scene-builder-first"></a>
## 2026-11-09：场景搭建首步，几何草稿保存重开

root 按主方案负责页面布局与产品验收，轻量组件/后端 agent 分工，独立 agent 审核边界。入口为“地图与发布 → 开始搭建场景”；`scene-builder.html` 配合 `src/pages/maps/scene-builder/` 中五个模块/样式，提供矩形场地、墙段和设备箱体/立柱/防撞挡块三种预设。对象可选择/移动、复制/删除，尺寸/位置/朝向/高度/墙厚可编辑，具撤销/重做、0.1m 吸附和等比缩放。场地边界不冒充实体墙；高度/厚度现在保存为几何参数，不声称已有三维碰撞或占据图生成。

服务器新增 `scene_workspace.py`，复用现有 MapStore SQLite 连接中的 `scene_drafts/scene_revisions` 分表，不改变原拓扑 Draft。首次保存预分配身份，修订 CAS 事务拒绝旧版本覆盖；旧修订不可变。严格约束有限数值、尺寸、非退化墙、模板、对象身份、数量和请求体，越出场地仅标草稿警告。丢响应后保留原 payload，查询原不可变修订与当前 head；首次查询未读到才提供明确“重试原保存”，保留相同 id/expectedRevision/body，绝不自动另建或换修订覆盖。跨服务器/密钥变化的迟到响应不回填，凭据只在内存。

### root 实际 Browser 流程

从空画布用可访问的键盘两点操作画出 12×8m 场地、(1,1)→(11,1) 的 10m 墙，放入三种预设；将墙命名“南侧隔墙”、厚 0.2m/高 3m，设备“刻印机 A”位于 (3,4)、2×1×1.8m、朝向 90°。立柱位于 (6,4)、挡块位于 (8,2)。后续将场地改为 14×9m，保存为原场景 `f2246d74fd8047b9b0fb7a05783bb2dc` **r4**。新建空工作区→从服务器列表打开→刷新重新连接均恢复原几何和属性。初期 Browser 发现名称输入未随保存更新，修复输入同步及 Ctrl+S 前提交名称后，r3/r4 名称正确；r1/r2 原“新场景”修订保留，不改历史掩盖问题。

第二页先打开 r3；第一页保存 r4 后，第二页把墙高改 3.5m 再保存实际收到 **409**，保留本地几何与旧修订提示，原场景未覆盖。root 明确另存“Fab 场地搭建 · 冲突副本”为 `fdde5ee2baef4021ac9a30937321512d` **r1**。未完成的墙段按 Esc 不新增对象；未保存修改时新建先弹确认，返回编辑保留修改；撤销/重做后明确放弃并重开，服务器墙高仍为 3m。

桌面 1280×720 与 1440×900 以及 375/320 窄屏均实际检查；窄屏 clientWidth/scrollWidth 分别 360/360、305/305，无横向溢出，画布与属性可滚动操作。工具/预设保持可见、对象区独立滚动，尺寸文字随视口保持可读，属性高度与厚度分栏。真实 Browser 绘制使用键盘点位；鼠标拖动/双点、指针取消/失去捕获、等比坐标与缩放不改几何由组件检查覆盖，**没有把它们冒充完整 Browser 鼠标拖拽实测**。

见 [Browser 验收记录](../../agv-digital-twin/environments/p0-pair/artifacts/scene-builder-browser-acceptance.json)、[独立原修订与运行边界读回](../../agv-digital-twin/environments/p0-pair/artifacts/scene-builder-acceptance-readback.json)、[最终桌面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-builder-desktop-final.jpg)、[375 画布](../../agv-digital-twin/environments/p0-pair/artifacts/scene-builder-375-canvas.jpg)、[320 属性](../../agv-digital-twin/environments/p0-pair/artifacts/scene-builder-320-properties.jpg)。独立读回确认原 r1–r4 与副本 r1 几何、原 **17 Run/25 command**、release/source 均保持，Worker 仍为原开发档 READY；本轮只重启 Gateway 载入 API/静态页面，未重建 Worker、修改发布或派发任务。

前端最终 **162/162**、后端全套 **189** 检查分别通过，原管理 v1 schema 未漂移；其中独立 Scene 后端 32 项含并发 CAS、坏输入、旧 Draft 不变、无物理服务初始化及静态边界。23 项精确静态白名单支持嵌套资源，API/凭据/数据库不被打包。没有为了本几何切片重跑真实运动仿真。多边形/门洞、三维预览、同源占据图/Gazebo、路网叠加和新场景实际车辆运行仍待接；这不是完整 NPI 出口。

<a id="scene-builder-generation"></a>
## 场景搭建器：同源导航地图与 Gazebo（2026-11-09）

### 本轮实际范围

“地图与发布 → 场景搭建 → 2 · 生成与仿真”已形成原修订生成、预览、确认版本、明确发布、Kernel 回读、Worker/正式 Bridge 双车准入和单段真实运行。root 负责页面层级、文案及 Browser 操作，轻量组件代理负责生成控件、物理导出及独立只读审计。没有修改 openTCS 内核、清理账本或重放旧任务。

新增 `scene-pair-v1` 只接既有 `p0-pair` 隔离端口、ROS domain 96 和 Gazebo partition。保留旧 `empty-crossing-pair-v1` 独立 gate。编译器 `scene-pair-v1.0` 使用不可变 Scene、米制 map 坐标、运行档位及验证路线中心生成 SDF、PNG/PGM、导航与 Bridge 初态；Worker 在 apply 前独立重建校验来源、几何、栅格、profile、模型和身份。Gateway 不接收任意 SDF、脚本或远端 URL。

当前支持矩形场地、直墙、旋转箱体/立柱/低矮挡块。实体为落地实心盒，碰撞与视觉几何相同，低矮挡块仍计入导航占据。场地边界不自动成为墙；墙端点为精确长度的 butt 几何。栅格为 0.05 m 保守单元相交投影，非整格余量未知，最多 800 万格。全部 7 点/12 有向边按车半径 0.32572995 m + Bridge 中心走廊 0.15 m + 半格对角余量 0.03535534 m 检查；不得只验选中的一段。

纯生成不启动世界、不改 Kernel、不下单。生成结果保留 PREPARING/READY/REJECTED/UNKNOWN；服务重启仅将未决生成标 UNKNOWN，不自动重发。原身份绑定原请求；确认版本的 ID 在 POST 前持久化，未知结果只查或明确重试原请求。发布、停用继续复用原发布 Controller/账本/锁；换身份、换密钥、保存修订变化以及等待锁时出现修改，均阻断晚到操作。

### Browser 与实际 SIM

进入旧标签页时发现用户尚未保存的移动，先通过“保存场景”保留为原场景 `f2246d74fd8047b9b0fb7a05783bb2dc` **r5**，没有挪动几何来通过验收，原六条已有修订 SHA 保持。r5 场地为 `(0,-0.4)`、14×9 m；墙 `(1.8,8.1)→(11.8,8.1)`、厚 0.2/高 3 m；设备中心 `(1.3,3.9)`、2×1×1.8 m、旋转 90°；柱 `(1,1)`、0.4×0.4×3 m；挡块 `(1.7,6.5)`、1.5×0.15×0.15 m。

1. Browser 以默认验证中心 `(7,6.1)`、快速开发档生成，因 `L-WAIT-L-EXIT` 对墙净空不足明确拒绝。实际发现 Worker 的 409 验证响应原先被 Gateway 误分类 UNKNOWN；修正后明确重试原生成 ID 得 REJECTED，保留首轮记录，未发布。对应中文指出墙体/障碍过近，原英文只在依据中。
2. 只将验证路线中心改为 `(7,5.5)`，重新生成 ID `a7e55aac6c835185d499d78c443dbbb9` 得 READY。Browser 确认生成版本 `b1a065334e9330b074cca68e8d8aa5ce`，审阅后唯一一次发布 `925b6b8e541ee0b64b9d8329f81765f0`。旧版本已通过 Browser 明确停用；镜像升级始终在 STOPPED 状态完成，无自动 apply。
3. 实际 Kernel 完整模型回读匹配，双 Worker/Bridge READY。新 `mapId=scene-34c6cd7dfdb33c0d`；origin `[0,-0.4,0]`、280×180、0.05 m。SDF 四个 scene 实体的碰撞/视觉/位姿与 r5 一致，无隐藏围墙；两车初态为 `(3,5.5,0)` / `(11,5.5,π)`。实际 ROS map occupancyHash 与原 PNG 网格一致；AMCL/Bridge/map 路径、导航参数、smoother 和 Kernel 150 mm/s 上限均核对实际来源。
4. 只从 Browser 下达 **LAB-01 → LAB-02-EXIT**，正式 Run `78ce88c487c9c9c34809b2ddeb287c13`、request `cba9fb18349717ecd559e3600d4541b0`、order `fleet-0136826778cc5e0978d24e0b9eb3d38c`。实际经过 L-STAGE→L-WAIT→L-EXIT，FINISHED、到站、无活动订单、持续停稳均确认。发单至封存 **58.103234 s**（含通讯、转向、减速和收尾，不是纯运动仿真时长）；Run 自身 3 个源帧跨 2.120898 s，独立 5 个 VDA 源帧跨 4 s。终态 claims 为空，只保留终点路径/点的位置分配，均不属于 SHARED-CROSSING；不把所有 allocation 宣称为零。
5. 独立 120 s HTTP 窗口 120 帧、零读取错误/READY 掉落；ROS/MQTT 保留原源时间、接收时间及原始记录。A 实际 odom 峰 0.15 m/s / 0.75 rad/s；B 静止且零订单。MQTT 两条 A order 是同一 order 的 update0/1，不是两次业务发单。最终 **18 Run / 26 command**，原 **17/25** 全部 SHA 保持。
6. RTS 从当前 READY 场景 release 读取同源不可变导航图，图片 URL 绑定 releaseId，发布退役/未决不回退旧图；实际模型、图层、停点与 FINISHED 订单可见。当前来源显示 `scene-pair-v1`，不误用旧能力 profile。
7. 实际刷新回到原场景后只查询原 generation/release，恢复 `(7,5.5)` 和开发档并锁定参数；第二标签页读取同一 r5，没有保存/生成/发布/下单。发现并修复恢复时错误显示默认 Y=6.1，以及无变化发布轮询替换 DOM/丢失按钮焦点的问题。375/320 宽分别实测 client/scrollWidth=360/360、305/305，预览和发布操作无横向溢出；临时视口已恢复。

Gazebo 只读 GUI 客户端已启动并保留，但 CUA 原生截图返回 Windows 壁纸，激活失败 `GetCursorPos: Access denied`，**GUI 目视不计通过**，未改用其它截图方式绕过；这不影响实际 SDF/ROS/运行来源核验或内置 Browser 验收。没有门户内嵌三维预览的完成声明。

### 实现与证据位置

前端逻辑集中在既有 `src/pages/maps/scene-builder/` 的 `generation-ui.js`、`publication-ui.js`；后端为 `fleet_gateway/scene_generation.py`，复用地图库并分表保存；Twin 为 `fleet_lab/p0/scene_assets.py`、`scene_worker.py`。所有 pair 新脚本/配置/证据仍在原 environment 目录。25 项精确静态白名单、SW v15，不打包运行密钥/数据库。最终前端 **184/184**、后端 **207/207**、Twin 纯离线 **201 通过 / 1 跳过**分别核对，四仓库 `git diff --check` 通过；这些不替代真实 SIM/Browser 证据。

见 [Browser 记录](../../agv-digital-twin/environments/p0-pair/artifacts/scene-generation-browser-acceptance.json)、[独立运行与历史校验](../../agv-digital-twin/environments/p0-pair/artifacts/scene-variant-independent-acceptance.json)、[实际世界/地图/出生点](../../agv-digital-twin/environments/p0-pair/artifacts/scene-r5-actual-world-map-spawns-20261109.json)、[实际运行参数](../../agv-digital-twin/environments/p0-pair/artifacts/scene-r5-actual-parameters-20261109.json)、[最终账本](../../agv-digital-twin/environments/p0-pair/artifacts/scene-generation-final-ledgers.json)、[RTS 实际底图](../../agv-digital-twin/environments/p0-pair/artifacts/scene-r5-rts-map.jpg)、[375 页面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-generation-375.jpg)、[320 页面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-generation-320.jpg)。

本轮只验同源导出与一段正式导航，未重跑双车互斥/取消/断连矩阵。当前是整体平移的固定七点十二边验证拓扑，不支持自由路网、任意产线布局、复杂立体/悬空资产、门户三维预览、实车、Tag/顶升或生产安全结论。

<a id="scene-builder-routes"></a>
## 场景上的自由点路与停车工位（2026-11-09）

### 产品流程与实现边界

Browser 实际入口为“地图与发布 → 开始搭建场景”：**搭建场景 → 规划路线 → 生成与仿真**。第二步复用同一米制等比画布，左侧放点/连直线/放停车工位，右侧先显示选中属性，再折叠展示坐标创建、对象列表和已配齐起点。可使用画布鼠标/键盘，也可精确输入坐标；支持点、路线、关联停车站的名称、位置、方向及删除，点删除级联关联项、撤销/重做、服务器 CAS 保存与冲突保留。工位设置停车朝向，两车分别选择起始点与朝向。同一点的停车与起始朝向须一致。

Scene **1.1** 在原不可变修订内增加 navigation，旧 **1.0** 的读取、保存字段与摘要不迁移、不补 null navigation；几何源保持。新字段为 points、paths、stations、spawns，协议 ID 自动产生，操作主层使用人类名称；最多 100 点、200 源路线、50 停车站。路线只支持直线、单向或双向，双向明确生成两条有向路径；源速度 0.01–0.05 m/s，生成时要求整 mm/s 与点位 mm 精度，运行档位冻结后生效。停车目前是 NOP 导航目标，不会因为放置图标便获得 Tag、实体停车线、顶升或交接能力。

新增代码集中于现有目录：APP `src/pages/maps/scene-builder/{network-model,network-ui}.js`；Gateway `scene_navigation.py` 与原 Scene/generation/publication 集成；Twin `fleet_lab/p0/{route_assets,route_worker}.py` 与原 Worker/runtime 分派。旧 geometry/compiler/单车及固定 crossing gate 保持。静态资源精确清单 **27 项 / SW v16**，运行凭据、数据和验收证据仍留在原 environment 下，不打入网页包。

### 原修订、实际操作与净空拒绝

原场景 `f2246d74fd8047b9b0fb7a05783bb2dc` 的 r5 几何原样保留。Browser 实际画出：

| 对象 | 位置 / 关联 | 意义 |
|---|---|---|
| P-1 / 车1起点 | (3,5.5) m | LAB-01 起点，朝向 0° |
| P-2 / 通行连接点 | (5.5,5.5) m | 路网通行入口 |
| P-3 / 取放停车点 | 初始 y=7.6，修正后 (5.5,7) m | S-1 / 刻印机取放位，90° |
| P-4 / 车2待命点 | (11,5.5) m | LAB-02 起点及 S-2 / 待命停车位，180° |
| R-1 / R-2 / R-3 | P1↔P2、P2↔P3、P2↔P4 | 三条自由绘制的双向路线 / 六条有向路径 |

首个点通过 Home、方向键和 Enter 在实际画布放置，其余点通过可见坐标表单；三条路线通过画布点选两端完成，两个停车工位通过点选关联节点放置。Browser 保存为 **r6**，故意过近北侧墙的取放点被真实 Worker 净空检查拒绝，页面显示原对象“南侧隔墙”（保留用户名称），没有发布。随后只将 P3 的 y 改为 7，实际撤销回 7.6、重做到 7，再保存为 **r7**；几何未改。源文件、旧修订及拒绝记录均保留。

同源 PNG/PGM、SDF、地图与 Bridge 配置仍绑定 Scene 原修订。全部路线按车半径、0.15 m 中心走廊和半格对角余量检查，等效扫掠半径约 **0.511085 m**；还检查各停车/起点之间，以及停车点相对其他非关联路线的 2 倍扫掠避让。旧场景栅格 origin `[0,-0.4,0]`、0.05 m、280×180 保持，四个物理实体保持；新增路网不是偷偷平移旧固定 crossing。

### 真实仿真发现的资源问题与修复

首次新变体 compiler **1.0** 将所有路线放入单个 `SCENE-TRAFFIC` 互斥块。正式发布 `5a79f0fe36bc708affa8db78cb8ff129` / release `fc3a8a8fe9d9018cc433cb3eeadc81f9` 的 Run **810781cbfd8fc5dc2ff8f6bfdd154202** 实际导航 FINISHED、到 P3、无活动订单并停稳，但 Kernel 在停车后保留 `R-2 + P-3 + S-1` 的位置分配，因 R-2 仍属于该块，实际 owner 为 LAB-01。**这一轮资源释放失败，不能算完整通过。** 原 Run、原发布、原采样与真值误差全部保留，没有改写为失败订单或删除重跑。

原末段 16 份 Run 观察和独立窗口均显示：执行 P2→P3 时 P2 源节点一直保留在分配中，到达 P3 后才释放 P2。结合官方 7.5.0 的 [DefaultVehicleController 资源释放实现](https://raw.githubusercontent.com/openTCS/opentcs/v7.5.0/opentcs-kernel/src/main/java/org/opentcs/kernel/vehicles/DefaultVehicleController.java)，改为新 compiler **scene-routes-pair-v1.1**：

- 停车站及车辆起点必须是只有一个邻接通行点的支路末端；禁止停车点之间直连。不能把多路交会点直接当停车位。
- `SCENE-TRAFFIC` 保护所有非停车节点及目标不是停车节点的有向边；到停车点的最后一段排除。此图实际成员为 **P-2、R-1、R-2:reverse、R-3:reverse**。
- 入网边和 P2 入口受锁；出网末段执行时仍由 P2 源节点持有资源，直至目标完成。停车后即便保留 R2/P3/S1，也不再占整网交通块。没有发解锁/清资源命令，没有修改 openTCS 内核。
- Gateway 和 Worker 各自重建、验证该策略。只对显式 route compiler 1.0/1.1 marker 的 block.memberNames 按集合比较顺序，保留全部字段；旧场景 gate 未放宽。1.0 原发布按原记录保存，不把旧 hash 解释为 1.1。

root 经 Browser 明确停用首轮版本后，仅在 STOPPED 状态更新 Worker；再对同一 r7 明确“新建生成方案”、冻结并发布新版本。并未重放原任务。生成、发布、实际 READY 和下单仍为不同操作。

### 最终真实结果

| 项 | 最终绑定 |
|---|---|
| Profile / compiler | scene-routes-pair-v1 / scene-routes-pair-v1.1 |
| Release / publication | fea7da28b86c5dd8505c33316b240986 / 67fc8ae07700ee624b3550461a2bc785 |
| Map / Worker source | scene-60ad66b802e58cb8 / p0-pair-worker-01:03a9f16385194027b303fd07765d91ce |
| Run / request | 16c89c23c7bf943fa7201fa8ba0eded2 / c31d54db5116f841346225c6af0f2c35 |
| Order | fleet-c914bafa5d8f6c3069ac052457cb633b |
| 业务任务 | LAB-01：车1起点 → 刻印机取放位；LAB-02 始终待命，无订单 |

Kernel 完整回读、Worker 独立重建、双车初始节点/地图/定位准入实际通过。实际 loaded SDF、双 ROS map occupancy/文件路径、有效 profile/事实表和速度参数另有只读绑定证据。root 通过 Browser 只追加这一笔修复复验任务；首次导航与修复复验共 **2 Run / 2 command**，最终账本 **20 Run / 28 command**。最初 18/26、首轮加入后的 19/27 与所有既有不可变原始证据的逻辑 SHA 保持。

最终发单 **19:17:22.831746Z** → Run 收尾封存 **19:18:19.463211Z**，约 **56.63 秒**，包含通讯、转向、减速与收尾，不是纯物理运动时长。正式 Run 为 FINISHED，`orderFinished/atDestination/noActiveOrder/sustainedStationary/settled/confirmed` 均真，Run 自身 3 个递增源帧确认停稳。独立最终 HTTP 原窗口 120 帧加授权尾窗 60 帧：180/180 READY、无 HTTP 错误；其中 27 个不同新源帧跨 **29.998 秒**确认同 session 下到 P3、估计位置/朝向门、VDA 与 odom 零速、无活动任务，且交通块 owner 为空。实测归属 **空 → LAB-01 → 空**。最后仍保留 R2/P3/S1 的位置分配，这些与新 block 的交集为空；不宣称所有分配归零。B 全窗无订单。

新 Run 只在首次 INSERT 时保存原 release 的 `routeContext` 人类标签；实际起点仅在既有新鲜 VDA、地图和节点/估计位置可相互核实时记录，无法核实则空，不把 spawn 当每单起点。主标题和 RTS 卡片显示“车1起点 → 刻印机取放位”，原凭据保留技术 ID，旧历史不回填当前名称。

### 观察精度、记录空窗与 Browser

**这不是精停车验收。** 首轮收尾 Gazebo 真值距固定目标约 **0.321021 m**；最终收尾约 **0.255252 m**，对应 AMCL 估计约 0.049080 m、Bridge 估计约 0.015433 m。各自源时间、接收时间和新鲜度原样保存，并非同一时刻的同步差值。不得隐藏真值偏差、用临时 PID/定位参数调优粉饰结果，或据此宣称 Tag 捕获、顶升交接及实车停车精度。

最终独立 HTTP 原窗与尾窗之间 **16.172089 s** 空窗；Runtime ROS/MQTT 两窗之间约 **19.135 s**、其独立 HTTP 两窗之间约 **8.193 s** 空窗。没有插值、拼接为连续时间证明；Gateway 原 Run 另有持续保存的观察记录，来源分别报告。没有因窗口不足额外发车辆任务。所有原窗、失败尝试与汇总均保留。

Browser 实际验收包括：同源生成拒绝与确认、两次明确发布/换版、真实两笔任务（首轮含资源缺陷）、刷新回读原 generation/release、路网保存重开及第二标签页只读同 r7、撤销/重做、当前 profile 与同源底图、人类标签、375/320 窄屏。两窄屏 client/scrollWidth 分别 **360/360**、**305/305**，画布宽 332/277 px，无横向溢出；临时 viewport 已恢复，主规划页保留。由生成页进入任务会直接展开单次验证区，不需在旧方案历史中找按钮。

Gazebo GUI-only observer 已启动，但 CUA 实际截图是 Windows 锁屏，因此**原生 GUI 目视未通过**；未尝试解锁或绕过。真实 SDF/ROS/导航已独立核对，不以 GUI 失败替代或否定这些不同层证据。

最终前端全套 **201 通过**，新入口变更后相关 APP/发布定向 **20 通过**；后端全套 **237 通过**；Twin 全套纯离线 **237 通过 / 1 跳过**（本机没有 rclpy 的 ROS 专属离线用例）。单元、Browser 和真实仿真分别报告，不相加。四仓库差异格式检查通过。所有新脚本/证据在原 pair environment 内。

证据：[Browser 操作记录](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-browser-acceptance.json)、[最终独立验收](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-independent-audit/final-compiler11-combined.json)、[首轮失败与源入口证据目录](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-independent-audit/)、[实际新世界/路网绑定](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-leaf-gates-actual-binding-20261109.json)、[真实目标/估计/真值](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-target-amcl-truth-comparison-20261109.json)、[采样空窗与资源](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-leaf-gates-capture-windows-resources-20261109.json)、[最终账本](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-final-ledgers.json)、[规划器桌面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-planner-desktop.jpg)、[375](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-planner-375.jpg)、[320](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-planner-320.jpg)、[实际 RTS 地图](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-final-rts-map.jpg)。

当前只支持上述直线路网、叶节点停车和保守全网串行资源。新图的双车并发、取消/断连矩阵没有重跑；新 profile 的故障收尾显式不支持，保留阻断，不复用旧 SHARED-CROSSING 恢复假设。局部路权设计、任意几何/建筑图、复杂资产、工位业务动作、Tag、实车与完整 NPI 出口仍待各自验证。

## 验收后按需停用（用户要求）

用户要求日常仅保留门户和 openTCS。root 经 Browser 审阅并确认停用当前 1.1 发布，原请求 `67fc8ae07700ee624b3550461a2bc785` 于 **2026-11-09T22:15:00.420376+00:00** 明确 RETIRED；随后正常停止 `agv-p0-pair-worker`，旧观察器和旧实验已停止。保留 Gateway、pair openTCS/MQTT；实际 Gateway ready=true，容器 CPU 采样合计约 0.07%，账本仍 **20 Run / 28 command**，版本/卷/历史不删除。此后 Worker/GUI 仅按验收需要启动，不常驻空跑，也不自动恢复旧任务。见 [门户停用画面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-user-stopped.jpg)。

## 会议 MVP：网页启停、真实 Gazebo 观察与一笔导航（2026-11-09 22:47—23:12 UTC）

用户要求在会议前提供可展示 MVP，并将 Gazebo 观察入口集成到网页。本轮新增仿真工作台的“准备服务 → 规划与发布 → 运行与观察”，由 root 决定布局与文案，轻量 agent 分别实施受限环境 API、viewer runtime 和只读审计。沿用已有 r7 场地与路网；没有改几何、运动参数、openTCS 内核或原账本。单次任务默认可见，多车方案、历史恢复、版本及诊断依据折叠。RTS 主卡按当前发布筛选，其他版本历史保留在折叠入口；地图旧文案修正为按来源显示各图层。

### 实际版本、任务与资源

| 项 | 本轮绑定 |
|---|---|
| 场景 | `f2246d74fd8047b9b0fb7a05783bb2dc` / r7，Fab 场地搭建 · 首轮验收 |
| Profile / compiler / 档位 | scene-routes-pair-v1 / scene-routes-pair-v1.1 / 快速开发档 |
| Release / publication | `fae80a912529429dec51a822e92d3491` / `b87e2b7decb0dfef853b77d848f8cff2` |
| Map / Worker source | scene-60ad66b802e58cb8 / `p0-pair-worker-01:75d1c26e36e84312a794063c4b6fec13` |
| Run / command request | `3bf4de2f36721778f8124891a123c85c` / `12103300f93faf4454c0613cab8f3b96` |
| Order / 任务 | `fleet-bcf98991fc65253228120eeec4f9c6b5` / LAB-01：车1起点 → 刻印机取放位；B 待命 |

root 通过 Browser 明确准备 Worker API，此操作未自动发布世界或追加订单；随后生成、确认和明确发布新 release，核对实际 READY 后只下达 **1 笔**新任务。Run 创建于 `23:05:52.782324Z`，`23:06:43.157066Z` 的收尾物理反馈确认成功，复盘记录轴约 50.5 秒。FINISHED 与 `orderFinished/atDestination/noActiveOrder/stationary/confirmed/settled` 分别读回，持续停稳由 3 个递增源帧确认。最终 **21 Run / 29 command**；原 20/28 及旧 evidence、publication、scenario 表前缀逻辑 SHA 均保持，失败与原始记录不删除。

独立只读窗口 `23:06:17.629461—23:07:46.632143 UTC` 共 **90 帧 / 90 秒**，90/90 READY，0 HTTP 错误，Worker/双车 source ID 不变。该窗口第一帧已执行，直接 kernel 分配读回仅证明 `LAB-01 → 空`，第24帧 `23:06:40.631765Z` 已空；没有把窗口前缺失的起始空 owner 补造出来。另从原 Run 38 条账本证据正确投影得到 `空 → LAB-01 → 空`（网关记录时间约 23:05:52.859 / 23:05:55.021 / 23:06:41.120）。两种来源和时间语义分别保留；首次错误投影 v1 原样保留，结论使用 v2。B 在90帧中没有活动订单。终点 R2/P3/S1 位置分配保留，只确认共享交通块释放，不宣称所有资源归零。

### 实景、Browser 与省 CPU 收场

真实画面链路为 GUI-only Gazebo → Xvfb → 服务端强制只读 x11vnc → noVNC，经固定回环 `55236` 嵌入 `55231` 门户。renderer 共享当前 Worker 的网络 namespace，读取现有世界，不创建第二个物理世界。服务端拒绝键鼠、剪贴板和远程配置；网页不暴露 Gazebo 暂停、速度、终端或驾驶控制。GUI 实体树及实际双车、墙、障碍、全景相机已目视；本轮通过的是网页真实画面，旧 Windows 锁屏导致的 native GUI 失败保留为历史。

首开曾因 Docker running 先于 HTTP listener 就绪而显示空 iframe。修复后启动回执须等待固定 HTTP 200 与 WebSocket/RFB banner 读回（有界约6.75秒，小于普通15秒请求超时）；GET 状态使用短探测，未就绪不给 URL。只读取协议 banner，不发送 VNC 输入或认证协商。root 在无新业务任务时重启 Gateway，再明确开启 viewer，实际 iframe 显示成功。第二页对已有服务的“打开”只在本地显示现有只读 iframe，不再提交 startViewer。6条服务启停原请求最终均 COMPLETED；这些不是运输命令。

实际 Browser 包括：网页准备服务、r7 重新生成/冻结/审阅/明确发布、真实3D与同源二维观察、一次明确任务、刷新原任务恢复、第二标签页恢复与已有画面打开、375/320窄屏、只读复盘定位50.5秒收尾事件、返回当前运行标题恢复。两窄屏 document client/scrollWidth 分别 **360/360** 与 **305/305**，iframe宽304/249px，无横向溢出，viewport已恢复、额外标签已关闭。复盘中环境面板与实时操作都hidden，后端历史查询不发业务意图；回放不插值。

root 随后通过 Browser 明确关闭3D（断流清除画布并显示中断），在场景页审阅并确认停用发布，读回 RETIRED，再通过工作台关闭 Worker。最终只读快照 `23:11:35 UTC`：Worker exited0、renderer exited143（正常SIGTERM）、web viewer exited0，三者 restart=no、PIDs0/CPU0；Gateway 55231 与 openTCS/MQTT 保留。单次 docker CPU 采样 openTCS0.11%、MQTT0.02%，不是长期性能保证。全部旧 native/check 观察器也已停止，不常驻空跑。

### 分层验证与限制

- 前端最终全套 **208/208**；相关后端环境/API/发布/Run/pair **115项**；viewer纯离线保护 **4项**，分别报告。独立只读90帧、实际Browser、测试数量不相加。初次标题恢复失败、首次iframe失败与旧测试输出保留，最终源码回归通过。
- 真值与定位仍不等同：本轮独立最终 Gazebo约(5.725,6.908)、AMCL约(5.499,6.950)，目标(5.5,7)，真值残差约0.24m。静止后AMCL可能fresh=false，按源字段保存；这些不是同步样本，不能用成功回执证明精停车。没有对PID/定位参数临时调优，没有Tag、顶升、载荷或实车验收。
- 本轮没有重跑双车同时运动或取消/断连矩阵。生命周期UNKNOWN保留原ID并阻断，不自动重放，通用人工收尾入口仍缺。此网页控制只启用于本机固定隔离pair，不等于任意远端Worker管理或生产部署。

证据：[Browser记录与截图目录](../../agv-digital-twin/environments/p0-pair/artifacts/meeting-mvp-20261109/)、[真实Gazebo运行画面](../../agv-digital-twin/environments/p0-pair/artifacts/meeting-mvp-20261109/gazebo-running.png)、[独立90帧与账本/前缀保留](../../agv-digital-twin/environments/p0-pair/artifacts/mvp-audit-live-20261109T230617Z/)、[最终停机快照](../../agv-digital-twin/environments/p0-pair/artifacts/mvp-audit-final-state-20261109T231135Z/)、[最终测试索引](../../agv-digital-twin/environments/p0-pair/artifacts/mvp-audit-final-tests-20261109T231022Z.json)、[28资源最终打包/HTTP/hash](../../agv-digital-twin/environments/p0-pair/artifacts/meeting-mvp-package-final-20261109T231143Z.json)、[viewer底层只读与真实帧](../../agv-digital-twin/environments/p0-pair/artifacts/viewer-runtime-20261109/)。会议演示步骤集中于主方案第4节，环境操作细节沿用pair README。

## 场景库：查找、预览、继续编辑（2026-11-09 本地 / 2026-11-10 UTC）

本轮继续完善 NPI 起步入口，将“地图与发布”由单一编辑器链接升级为已保存场景库。新组件 `src/pages/maps/scene-library.js` 仅 GET 原目录/单场景接口，按部署身份与权限版本丢弃晚响应；列表搜索不发新请求，选择后读取最新原场景。主层显示人类名称、修订、更新时间、米制预览、尺寸和对象数量，没有 JSON/内部ID。预览使用原场景的墙、旋转障碍、自由路网与停车位，不伪造运行车或已校验状态。链接沿用独立编辑器，保存/生成/发布协议均未复制或改变。

实际内置Browser验证：

- 读取原3个场景，选中“Fab 场地搭建 · 首轮验收”r7，预览14×9m、1墙/3障碍、3路线/2工位，与原保存数据一致；搜索“冲突”可选原冲突副本r1，预览12×8m、没有路网，且打开地址随选择匹配。
- 初次搜索会保留被过滤掉场景的预览/打开按钮，实际发现后已修复；最终无匹配查询显示0个结果，继续编辑链接为0，不误开旧选择。刷新列表保留搜索和所选场景，页面重载重新读取目录；不宣称硬刷新保留搜索文本。
- 通过新入口实际打开原r7编辑器，原场地/墙/设备/防撞条和保存修订正确；“新建场景”实际进入空编辑器，0对象/尚未保存。本轮没有保存新测试场景或覆盖旧草稿。
- 退出权限清空目录和预览；第二标签页独立验证后读取同3场景与r7，第一页仍未授权且0行。额外标签已关闭。
- 375和320视口的document client/scrollWidth分别360/360与305/305；预览宽306/251px，上下排列，无横溢。最终viewport已恢复；桌面列表与预览并列。

单元验证：最终前端全套 **213/213**，其中新增5项覆盖只读意图、交错预览/跨部署晚响应、权限丢失、读取失败/身份不符/并发新修订和非法URL/非数值几何；相关后端Scene/API **41项**通过。最初从工作区根运行pytest因导入路径错误未收集成功，随后在Fleetserver正确目录运行通过；这不属于业务失败或真实SIM结果。无实际运动：本轮未启动Worker、Gazebo或viewer，不重跑不受影响的导航/异常矩阵，不扩大实车或精对接验收。

环境初始Docker/Gateway关闭，按原本机测试配置仅启动门户和pair MQTT/openTCS；草稿目录在内核尚未启动时已能读取，未放宽导航门槛。最终全部库表（Run、evidence、command/audit、release/publication、环境控制、栅格/草稿/场景/修订/生成）的行数与逻辑SHA均与本轮基线一致：**21 Run /29 command，3场景/9历史修订，7条既有环境控制**。基线已含7条控制，不把它们归成本轮新操作；与上轮6条历史快照分别保留。本轮未调查期间新增控制的来源。Worker和两viewer均未运行；当前Worker退出码255为只读观测，不归因于本轮停机，也不宣称本轮正常停机测试；viewer0、renderer143，门户/openTCS/MQTT运行。

静态分发已更新为29资源，源码→web_dist→实际HTTP200均SHA一致，SW v18；文件职责清单371个Git可见文件（包含既有改动与忽略外新增，不是本轮新增数）。APP/Fleetserver差异格式检查通过。

证据：[Browser最终桌面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/desktop-final.png)、[完整桌面](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/desktop-full.png)、[375](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/375.png)、[320](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/320.png)、[第二标签页](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/second-tab-dom.txt)、[全库基线](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/baseline.json)、[最终库/容器/29资源](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/final-state-and-package.json)、[前端213项](../../agv-digital-twin/environments/p0-pair/artifacts/scene-library-20261109/node-tests.log)。建筑图配准/导入、复杂工位、局部路权、精对接及完整NPI出口仍按主方案各自推进。

## 边界

最新已记录范围包括固定双车导航、共享资源、上述普通撤单与 Broker 断开/恢复、已停稳故障任务明确收尾、显式新 SIM 会话重新投入、有界场景的实际停止/重启审阅/明确继续，历史两档短路线与 Browser 复盘布局，以及上述自由直线路网/叶节点停车的单段真实运行和交通块持有/释放。旧断连回放及窄屏布局有各自历史证据；两档切片曾验证 LAB-01 新动态与 LAB-02 等待撤单，本次新路网没有重跑双车并发或取消/断连矩阵。完整 P0-3、通用场景编排、通用 UNKNOWN 自动恢复、其他运动中断连模式、跨 session 原地续跑、任意建筑图、REAL、实车、顶升、载荷、对接/交接及生产安全仍需各自证据。未修改 openTCS 内核。

## 逐页产品可用性复审（2026-11-09 23:26—23:35 本地 / 2026-11-10 UTC）

用户要求root作为高级评审员亲自以用户身份操作，重点核实左侧VEHICLES点击没有反馈。root在内置Browser审查当前本地门户 `http://127.0.0.1:55231/`，实际走访六个工作区、场景搭建器和旧地图编辑器；轻量agent只读定位源码原因。**本轮整体产品可用性未通过，不据既有单元或链路通过推定新用户能自助完成。** 未修改业务代码、部署、原场景或版本。临时绘制只在未保存的新场景中进行，随后通过明确的“放弃修改并继续”返回原r7。未点击保存、生成、发布、服务启停、执行、撤单、暂停或恢复；没有实际SIM运动/故障注入。本节是浏览器产品评审记录，不是新一轮运行验收。

### 实际Browser问题与优先级

P1表示应在扩展功能前修复的主流程/选择可靠性问题；P2表示信息架构和效率问题。下表不把源码推断记为实际复现。

| 编号 / 级别 | 操作与实际结果 | 用户影响与建议出口 |
|---|---|---|
| U01 / P1 | 在“地图与发布”点击侧栏LAB-01，侧栏高亮但页面仍为场景库，详情未出现；仿真页也不出现公共详情。车辆页表格选择LAB-02则能显示正确详情。 | 侧栏是全局入口却只有部分页面响应。每次选择须显示同一对象详情或明确进入相应页面；窄屏用可见详情页/抽屉。不能声称车辆页本身完全没有详情。 |
| U02 / P1 | 仿真页侧栏点LAB-02，`#runVehicle`仍为LAB-01；任务页打开“新导航任务”后点侧栏LAB-01，`#dispatchTab`变为未选中，表单被Details替代。 | 全局所选对象与操作目标分离且没有解释；用户容易以为正在操作另一辆车。明确区分查看对象/任务目标，或以显式规则联动；不得静默覆盖已配置任务。 |
| U03 / P1 | 门户已授权，从场景库进入指定r7链接，编辑器却显示“新场景、尚未保存、0对象、空画布”；独立重新连接后才出现原14×9m/r7。返回门户又须重新连接。 | 已有场景看似丢失；加载/权限待核实必须占据明确状态，不显示另一份可编辑新草稿。采用有界会话/统一壳等正式方式连续访问，不能把明文密钥放URL或长期存储作为快捷修复。 |
| U04 / P1 | 选r7场地，将宽度14输入为15，不点“应用修改”，切规划路线再返回重选场地，值回到14，无丢弃提示。顶部仍曾显示已保存r7。 | 输入未纳入dirty，用户可能误以为已修改。切对象/步骤/保存时统一提交、验证或提示待应用输入。已应用修改的离开保护另有实测通过。 |
| U05 / P2 | 在“3·生成与仿真”点新建场景，仍停在step3，显示“此旧版使用固定验证路线”及中心X/Y、禁用生成。 | 新用户无从开始。新建应进入搭建第一步；旧格式兼容入口应有明确场景条件。 |
| U06 / P1 | 仿真工作台明确显示“仿真服务已关闭，不占用仿真CPU”；全站仍持续显示发布阻断、两辆车离线需检查。首页又默认提升封存任务到主卡。 | 主动停用、意外中断和缺乏当前证据应分别说明。保留真实阻断，给出当前阶段下一步；历史保留于历史入口，不用大段封存证据占主操作区。当前Worker继承exit255，不能仅凭“服务关闭”文字将所有离线视为正常。 |
| U07 / P2 | 1280×720运行首页首屏被上下文、需处理和历史卡占满；运行地图在下方。常驻来源含profile/scene hash、秒数年龄和协议词。 | RTS的地图和当前作业未成为视觉中心。按主方案第13/14节固定地图、对象、任务和紧凑事项布局；把完整技术来源移入详情。 |
| U08 / P1 | 搬运任务显示内核订单0，但下方24张回执卡默认展开；页面高9217px。标题为请求ID，正文含JSON、ACCEPTED/FINISHED、底层404。事件页主要是相同回执加当前页Activity。 | 真实历史未丢，但没有按名称、车辆、日期、结果检索的统一用户任务记录。“当前订单0”和“历史任务”须分明；失败显示业务影响及下一步；原始证据按需展开。 |
| U09 / P2 | 在历史方案定位382.587秒断连，下一关键事件可进到383.084秒；刷新后落到普通仿真工作台并失去授权，具体回放和位置未恢复。URL仅`#/simulation`。 | 回放不能书签/分享/刷新继续。将历史对象与记录时间位置纳入只读深链并在授权后恢复；不得因恢复产生业务命令。 |
| U10 / P2 | 新场景库能列出3场景并打开原r7；地图导入却藏在“高级地图草稿、发布与历史→打开地图编辑器”，进入另一套英文界面。实际导入弹窗要求ROS map_saver YAML+PGM/PNG。发布历史和冻结版本主要以截短技术ID展示。 | 用户难区分场景草稿、SLAM图、调度模型和已发布版本。主入口需要“新建/打开/导入”，按支持类型说明；版本用场景名称、修订、时间和使用状态显示。不能把SLAM导入称为建筑图配准。 |
| U11 / P2 | 点PLANT MODEL的Points只回总览并提示数量，没有点位列表。源码确认Paths/Stations也共用回总览/fit逻辑；后两者未逐个重复点击。 | 看似目录的按钮缺少目录行为；应展开、过滤或聚焦对象，或改为不可点击统计。 |
| U12 / P2 | 375×850下门户/搭建器document均360/360无横溢；车表仍须内部横滚，选车后详情从视口y≈663起且操作更低。搭建器选设备后属性从y≈995起，屏高850，无自动呈现。 | 无横溢不等于好用。桌面保障主要工作画布；窄屏以列表→对象详情组织，避免编辑控件与选择对象分隔多屏。 |

语言与层级问题贯穿各页：中文导航与Vehicles/Details/Activity/Unknown交错；“返回当前方案”可在尚未选方案时出现；“当前方案运行”可以是旧场景已完成记录；超长秒数比本地时间/时分秒难读。以上应随页面骨架统一，不继续叠加免责声明修补语义。

### 实际可用的部分与未测范围

- 在未保存测试场景中，按尺寸建立12×8m→宽度15并应用→撤销回12→重做回15；实际拖出7.50m墙，厚度0.2m/高度3m应用；放设备箱体、朝向90°应用均可操作。撤销会清空选择，须重新选择属性对象。未保存草稿未提交服务器。
- 已应用修改后新建/打开会提示“当前修改尚未保存”；“返回编辑”保留90°；选择原r7后明确放弃临时修改，重新打开14×9m、1墙/3障碍。不能把U04扩大为“所有未保存保护缺失”。
- 回放正确显示历史只读并隐藏运行控制，断连事件定位、下一关键事件和跨工作区退出有效。历史缺记录有明确提示；没有为填空插值或发单。刷新恢复缺口如U09，和此前“刷新恢复原Run身份”是不同验收对象。
- 停机状态的Gazebo按钮有明确禁用说明；本轮没有打开Viewer，也未重测真实画面、当前READY、取消或车辆恢复。未重跑单元/后端测试，因为无业务代码修改；此前213/41不计作本轮产品通过。
- 额外审查标签已关闭，viewport已复位；原门户标签保留。临时工具选择器未命中/属性因撤销清选而消失的尝试原样保留，不将工具定位失败直接认定为网页故障。

### 仅源码发现，须补专项复验

1. **C01 / P1：历史READY可能显示为当前就绪。** `src/pages/maps/scene-builder/publication-ui.js:14`的ready条件核对当前准入，但`:17`标题fallback使用`:4`的`stages.READY='仿真已就绪'`。当同版本发布仍READY、当前admission为false时标题仍可能宣告就绪，而任务链接被隐藏。本轮环境已RETIRED，未人为创建该状态；现有该组件测试未覆盖此组合。修复须区分发布历史完成与当前可运行，再用针对性测试/实际状态复验。
2. **C02 / P1：全车暂停范围缺乏审阅。** `app.js:969`起的监听器直接调用`api.fleet`；`fleet-api.js:264`起遍历capabilities.robotIds。按钮只写“请求运营暂停”，非急停说明主要在英文title；未显示会影响哪些车。实际未点击。应清楚呈现全车范围、暂停真实语义及结果，不把它解释为所选车停车或安全急停。

源码因果：U01/U02主要位于`app.js:852`、`:883`和`styles.css:2238`（maps/simulation隐藏详情网格）、`:1513`（events隐藏详情）；仿真任务选择另由`simulation-run-ui.js:74/88/103/189`维护。U04在`workspace.js:24`仅表单submit记修改，`:13/18/53`切换重建属性。U05在`:43`fresh未复位mode，新模型`model.js:7`为1.0。U06的`portal-state.js:13`只看在线/新鲜度；`simulation-run-ui.js:64`无当前release时纳入历史，明确有历史标签但仍在主层。U09的`app.js:730`和`replay-ui.js:119/140`仅在内存保留回放目标。行号为本轮源码快照。

### 产品缺口与下一步顺序

先修上述主流程，再按既定主方案补能力：

1. PE起步：建筑平面图/PDF/图片的尺度配准、描边和尺寸待核实标注；SLAM导入保留独立类型。
2. 工位资产：设备、进/出料位、高桌载台、立牌/Tag/按钮及其关联、靠近方向、驻车/顶升包络和交互序列；当前停车位只有关联点和朝向/NOP，不能冒称搬运已支持。
3. 作业看板：统一当前/历史任务、异常队列、日期/车辆/结果筛选、任务→事件→回放的关联；读取记录不要求记忆技术ID。
4. 规划验证：双车同时运行/局部路权、工况与负载、节拍/等待/拥堵、对比和可分享验收报告；当前全网串行不作为吞吐结论。
5. 现场投产：车辆/工位身份、测量与标定、定位/精停车/顶升交接/载荷分阶段验收及受控返线；低速和安全硬件不能由本轮UI审查代替实测。

### 证据与最终状态

证据集中于原pair artifacts的 `product-ux-review-20261109/`：

- [侧栏点击无详情](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/01-sidebar-vehicle-no-detail.png)、[运行首页首屏](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/02-operations-top.png)、[任务回执默认呈现](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/03-missions-engineering.png)。
- [任务页完整DOM](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/03-missions-receipts-dom.txt)、[事件页DOM](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/04-events-dom.txt)、[仿真表单仍选LAB-01](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/05-simulation-different-vehicle.png)。
- [指定已有场景先显示空草稿](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/07-saved-scene-opens-empty-before-auth.png)、[属性输入丢失后DOM](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/08-property-input-lost-dom.txt)、[新建仍在生成步骤](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/09-new-scene-stays-generation-dom.txt)、[未保存绘制操作](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/10-unsaved-draw-workflow.png)。
- [回放断连定位](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/06-replay-disconnection.png)、[刷新前](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/14-replay-before-refresh.txt)、[刷新后](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/14-replay-after-refresh.txt)、[375车辆](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/11-fleet-375-after-select.png)、[375搭建器](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/12-builder-375.png)、[SLAM导入表单](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/13-slam-map-import.png)。

[最终只读状态](../../agv-digital-twin/environments/p0-pair/artifacts/product-ux-review-20261109/runtime-end.json)：21 Run /29 command /4198 evidence；3场景/9修订/6生成；13 release/13 publication；3方案/2 execution/27 scenario events；7环境控制记录。Worker exited255、viewer exited0、renderer exited143均为继承状态，本轮没有启停它们；pair openTCS/MQTT和门户保留。仅最终计数核对，未声称本轮做过全库前后SHA审计或正常停机测试。


## 评审整改：门户核心交互切片（2026-11-09 本地，2026-11-10 UTC）

按用户要求实施大幅交互整顿，root直接负责布局、文案、代码与Browser验收。本轮不扩展物理仿真和搬运合同，沿用既有页面/模块，无新增平行环境或进度文件。

- U01/U02：公共inspector迁至统一对象抽屉，任何页面侧栏选择都可查看；保留任务页下单页签。查看车与选择任务目标分离为明确“用所选车辆配置单次验证”。该动作等待背景读取后再选择/刷新，避免首轮发现的异步LAB-01覆盖LAB-02；选车同步选择该车观察，避免B的表单旁显示A的历史。工位/路线始终进入详情。
- U03/U04/U05：同源iframe编辑工作区保持门户内存权限，postMessage严格核对origin和当前frame/parent，子页独立核验。退出仍走原未保存保护；ESC请求子页检查后退出。未载入指定场景时隐藏空画布并提示连接。属性有效输入在切对象/步骤/保存前应用，HTML非法输入保留并阻断切换；新建回搭建首步。未存储明文key、未写入URL。
- U06/U07：发布明确RETIRED后，主层解释虚拟车不可接单及准备/发布入口，不重复堆离线告警；离线原状态和不确定结果仍保留。地图进入首屏主要区域，摘要与历史在下方，连接依据折叠；无当前版本或已封存观察默认折叠，不删除历史。
- U08/U09：本浏览器的命令记录按车辆/目的站/内核订单结果/本地时间生成摘要，自由搜索，原始身份、JSON、技术错误、按ID查回执均折叠保留。没有将FINISHED称为实际停稳，也没有声称是全站历史。回放对象/时间写入只读hash深链，刷新后再授权恢复；GET加载不执行命令。
- U10/U11/U12：地图主入口增加ROS导入及YAML+PGM/PNG支持说明；模型分类弹出真实对象目录并打开统一详情；375宽度的对象抽屉使用全屏布局。旧编辑器完整文案统一、复杂建图在手机上的多屏属性布局、版本名称/差异目录及服务端全站任务检索仍未完成，不把这些余项标记通过。
- C01/C02：历史READY标题改为“发布已完成，当前车辆尚未就绪”，实时准入链接仍受真实ready约束；有专门回归检查。全车运营控制显示两辆具体车及真实语义，页面内显式审阅；提交前比对最新能力列表与已审阅身份集合，变化则在任何命令前拒绝。没有改变openTCS内核或车端运动控制。

### 实际Browser与发现后修复

1. 地图页点击LAB-02打开抽屉。首次选车配置遇背景读取尚未结束，表单短暂为A；修正等待读取后选车，最终LAB-02、可见下拉解除忙状态。之后将观察也限定同车。没有执行任务。
2. 授权门户内打开原场景直接出现r7、14×9m、原对象，无二次输入key。输入场地宽15而不点应用，切路线再返回仍15，且离开提示未保存；明确丢弃后服务器原r7不变。
3. 旧地图导入首次遇初始读取busy导致自动连接被跳过，修复为有界等待；复验直接打开ROS YAML/图像导入表单，无重复输入key。未上传文件。
4. 在生成步点新建，实际回到“1·搭建场景”，空场地起步控件可见；返回门户保留会话。未保存新场景。
5. 原历史方案断连事件382.587秒定位后URL保存at=382.6；刷新、授权后slider读382.613秒（记录投影/浮点位置差），原scenario ID相同，仍历史只读。不是仿真运动或新运行。
6. 任务搜索LAB-02可过滤记录；搜索涵盖目的站等正文，因此也会包含“LAB-01→LAB-02-EXIT”，不能冒称严格车辆筛选。完整回执保留在details。
7. 模型Stations目录列出真实S-1/S-2并可打开对象。首次仍继承下单页签，已修为仅missions的车辆选择保留下单，其余对象打开详情；人类label优先显示。
8. 375×850主文档client/scroll=360/360，抽屉宽375，全屏详情实际可见；已复位viewport。最后原测试标签因原生确认框超时关闭，创建新测试标签完成验收并保留为交付页；控制台最后采样无error。

### 误提交与账本核对（必须保留）

在测试原生confirm审阅时，Browser click发生CDP超时，getJsDialog未取得可取消的确认框；后续账本核对发现该次实际产生两笔pause，不能称作“没有控制副作用”：

- LAB-01：`2e3b19bd51286d34496adff055d178ce`，2026-11-10T04:51:12.932Z，ACCEPTED，requestedPaused=true，pending vehicle feedback。
- LAB-02：`dacf7adfff5a80da54d8024ce4d57162`，04:51:13.308Z，ACCEPTED，requestedPaused=true，pending vehicle feedback。

root已向用户明确报告。Worker当时已关闭，不能从受理回执推定实车/虚拟车物理停车；没有自动发恢复来改写现场状态。原生confirm已移除，改为HTML页面内审阅。最终Browser实际读到“涉及车辆LAB-01、LAB-02”，点击“返回，不发送”，没有第三笔命令。未来重新投入仿真时应核对控制/暂停状态后再明确操作，保留这两笔历史。

最终只读表计数：21 Run/4198 evidence、31 command/62 audit，3场景/9修订/6生成、13 release/13 publication、7环境控制、3方案/2 execution。除上述+2 command/+4 audit，其余表行数与评审末基线一致；不声称做过全库逻辑SHA审计。Worker exited255、renderer exited143、viewer exited0均为继承停机状态，openTCS/MQTT和门户保留；未新增导航/取消/发布/启停或恢复。

### 分层检查及证据

- 全套前端218/218；相关后端scene/API 41/41；APP/Fleetserver差异格式检查通过，既有CRLF提示保留。测试包含查询筛选无新意图、无当前版本历史折叠、回放深链路由、READY但当前阻断不宣告就绪、全车范围变化在POST前拒绝。初期旧DOM harness缺少新浏览器API与历史主层预期失败均保留，更新harness后既有安全/恢复检查仍通过。
- 29静态资源源码→web_dist→HTTP SHA全部一致，SW v19为网络优先。没有运行实际SIM、REAL或本轮取消/断连运动矩阵；此前物理证据保持原范围。
- 证据位于原pair artifacts的 `ux-overhaul-20261109/`：[运行首页](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/operations-final.png)、[对象抽屉](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/object-drawer-final.png)、[375抽屉](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/drawer-375.png)、[任务筛选](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/tasks-filtered.png)、[回放恢复](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/replay-restored.png)、[218项输出](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/tests-final.log)、[最终表计数/容器/静态hash](../../agv-digital-twin/environments/p0-pair/artifacts/ux-overhaul-20261109/final-state.json)。早期失败测试位于前一评审artifact目录implementation-tests*.log，未删除覆盖。


## 服务端任务与事件历史、旧编辑器中文（2026-11-10 本地时间）

用户要求按整改顺序补全站历史、统一旧编辑器中文，由root管布局和产品验收，轻量模型实施组件。本轮三个Sol high agent分别负责Fleetserver只读history模块/API/测试、history-ui组件/测试和旧editor中文；root负责合同、共壳入口、页面层级/样式、整合缺陷、部署与实际Browser。未改openTCS/Bridge/物理参数或搭建新环境。

### 实现与合同

- 新GET `/api/v1/history/tasks`、`/history/events`沿用operator认证及同源检查，无POST入口。来源为现有命令/audit、Run/evidence、方案execution/events；已有连接或mode=ro读取现有文件，不初始化可恢复/迁移的业务store，不查询当前内核/Worker。缺来源作为coverage空窗，不制造记录。
- 任务目录保留Run和未被同Run归并的命令；实际31项=21 Run+10操作/旧命令，不能说新增31笔任务。Run SUCCEEDED须confirmed与settled同时为true，FINISHED但证据未核实保持未知；普通pause/cancel的ACCEPTED始终仅已受理。取消/故障收尾按原关联Run找车辆；历史站点名来自原routeContext，未用当前地图回填。
- 当前245条事件来自命令状态、Run语义状态/反馈变化及方案生命周期；普通传感器时间/采样更新不逐帧列出。同一订单状态下的UNKNOWN/明确TRUSTED、来源可用性/错误变化仍保留；只有原记录明确可信返回才称恢复，缺状态时保持可信性未确认。记录时间/源时间分别显示，缺源时间为空。原事件代码和版本等按需展开，details有大小限制及凭据键/内容脱敏。
- 支持关键词、精确robotId、任务结果/事件类别、带时区时间范围、limit与稳定游标分页。游标绑定筛选快照，TTL600s，最多16快照/总32MiB；过期/服务重启/筛选不匹配400，前端引导“查询记录”从第一页开始，无自动业务重试。快照存内存，查询不写业务库。
- 原共壳六页保留。“搬运任务 / 事件与对账”主层为服务端查询表单、业务摘要、结果和关联入口；本浏览器回执、当前内核订单/连接日志折叠保留。零当前内核订单不再在导航显示0冒充历史数量。前端筛选和页码按部署存在sessionStorage，不保存key/记录正文；授权/部署改变立刻清屏，晚响应丢弃；无轮询替换输入。root修复隐藏任务页接收关联条件时旧loaded状态阻碍新查询的缺陷，并增加回归。
- 原editor.html/js/css全部面向用户的静态与动态文案统一中文，已知后端校验/栅格错误在显示边界映射；技术词、协议键、导出格式/原始数据保留。root将校验技术码收入原始依据，文件选择改中文显示。初次窄屏标题末字独占一行，已缩成“导入ROS地图”。实际缺文件检查在任何上传前阻断。未上传任何文件。

### 部署与失败保留

首次重启前Get-NetTCPConnection未返回listener，因此PID保护中止，没有停止未知进程。另一次启动因旧Gateway仍占用端口报10048退出；随后核对旧launcher25004/child26096归属，停止该本机隔离Gateway并启动新版本。补反馈投影后重启时发现launcher另有conhost子进程，保护再次中止；最终只停止已核对归属的Python child36468及launcher10352，新launcher9208加载正式版本。上述错误在ignored runtime的history-gateway*.stderr.log保留；没有因此启动Worker/Viewer、发暂停/恢复或重放任务。重启前后账本SHA证明没有业务变化。

### 实际内置Browser

1. 正式IAB browser2使用现有portal标签5；ambient fleet URL定位没有匹配，盘点后恢复实际operations页，没有改浏览器访问权限。额外标签6测试后关闭，主标签保留交付。
2. 未授权进入任务页，查询按钮禁用、无服务端记录。用既有operator key授权后可见31条、首20条；下一页11条，刷新再授权仍第2页/原筛选，只读取原历史。没有从localStorage拼服务端目录。
3. 精确LAB-02+FAILED实际3条；加本地11月9日00:00—23:59实际2条。开始时间晚于结束时间显示中文错误且清空旧结果；不存在关键词得到“此条件下没有记录”。重置恢复全部31条。
4. 事件页先选run/LAB-02并查询；首次点击“查看关联任务”早于查询完成导致工具超时，待实际结果返回后成功。事件→关联任务→只读回放打开原Run `5c3c040ebf282649ebfe9cc80f729330`，原撤单18.6s与未成功但收尾21.4s均可见；没发撤单或运行。
5. 补反馈语义后，实际run/LAB-02/关键词“反馈”返回27项；包含历史“任务反馈不确定/恢复可信”，也包含缺可信状态时不宣称恢复的记录。不是本轮断连故障注入。
6. 第二标签独立授权可查31条。主标签结束权限后0条立即清屏，第二标签仍20条；额外页关闭，主页重新授权。跨标签读取独立于控制会话，不能把本次双标签页等同实测其他浏览器软件。
7. 六工作区逐页回归：总览地图存在，车辆表LAB-02详情正确；地图场景库/原嵌入编辑器可开；仿真明确服务已关闭、Gazebo不可开，未点服务按钮；事件与任务的上述主流程有效。
8. 旧编辑器通过门户内存会话直接连接。工具、草稿属性、检查错误/警告和ROS导入弹窗均中文；开始用错“关闭导入窗口”选择器，按实际“关闭地图导入对话框”继续。空草稿检查展示至少添加点位等中文；原NO_POINTS已移到可展开依据。无文件点导入得到“请选择YAML（最大64KiB）及其原始图片（最大5MiB）”，未到请求层。文件选择按钮/尚未选择状态中文，未触发文件选择或上传。
9. 375×850历史页document client/scroll=360/360；中文导入弹窗和错误实际可读。viewport复位，最终任务主页保留。最后采样无console error；未声称运行、所有弹窗分支、实车或完整生产准入通过。

### 分层检查、状态与证据

- 最终前端全套230/230；相关后端history/API/scene57/57（其中history+API25）。包含只读SQL追踪、不开库不迁移、时间/游标/精确车辆、去重、同状态反馈中断恢复、权限/部署/迟到响应、持久筛选分页及GET-only回调。旧editor几何2项包含在前端全套中，不重复相加。
- 30静态资源源码→web_dist→实际HTTP SHA全匹配；SW v20网络优先；职责清单375个Git可见文件。APP/Fleetserver diff --check通过，既有CRLF警告保留。
- 全部业务表行数和逻辑SHA与本轮baseline一致：31 command/62 audit，21 Run/4198 evidence/27 run-command；13 release/13 publication；3场景/9修订/6生成；7环境控制；3方案/2 execution/1781 replay projection/27 scenario events。旧两笔误暂停记录未删改，也没有本轮新增业务控制。Worker exited255、renderer exited143、viewer exited0保持继承停机；门户/openTCS/MQTT保留。本轮没有实际SIM/REAL运动，查询结果只说明历史。
- 证据：[最终任务页](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/tasks-final.png)、[日期/结果筛选](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/tasks-filtered.png)、[反馈事件](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/events-feedback.png)、[第二页签](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/second-tab.png)、[历史375](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/history-375.png)、[中文导入375](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/editor-import-375.png)、[最终230项](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/node-tests-final.log)、[基线](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/baseline.json)、[最终全库/查询/资源/容器](../../agv-digital-twin/environments/p0-pair/artifacts/server-history-20261110/final-state.json)。

全站定义仅限当前Gateway已保留来源；未保留的旧数据、其他部署、原始传感器或外部日志不自动纳入。大规模历史尚未做容量/查询时延压力验收；当前查询按需投影和有界内存快照，运行控制不依赖浏览器历史查询。后续继续按主方案推进版本关联目录、复杂窄屏规划、工位资产及NPI能力。


## 场景档案、历史修订差异和版本使用记录（2026-11-10 本地）

用户要求继续下一步implementation。root按主方案剩余整改选择地图版本关联切片：轻量Sol high分别实施只读API、档案组件和独立来源审计，root决定入口/版式、原场景库与任务页整合、发布、Browser和最终验收。沿用原目录，没有另开环境或平行进度文件。

### 已实现的产品路径与边界

- 地图库选择场景→“查看修订与使用记录”展开档案。默认“版本与运行”：确认版本、档位、历史发布与原Run在前，6条生成尝试折叠在后。切“修订与差异”才按需读取历史修订，保留真实2D几何/点路站和车辆起点朝向预览；两个修订并列并显示名称、位置、尺寸/墙高厚、朝向、连接、速度和起点变化。所有技术ID在原始依据中保留；历史状态不作当前就绪证明。
- 修订预览只读；“编辑最新草稿”明确读取服务器最新头，而不是把正在看的旧修订伪装成可编辑对象。头缺失时没有该入口；主标题取所选原修订名。比较按保存对象ID、spawn按vehicleName；仅列表顺序变化不报变化，同名但换关联点会说明对象更换。选择/比较数值存在按部署/场景隔离的sessionStorage，无密钥或原始场景正文。
- `GET /api/v1/map-workspace/scenes/{sceneId}/history`只SELECT/PRAGMA已有文件或连接，使用mode=ro，不构造业务store、不恢复/重放/迁移/写库、不询问上游。关联核对sceneSource.sceneId/revision/hash，生成请求绑定、版本部署/目标、Run publicationId/releaseId/releaseHash及部署/目标；矛盾排除并说明，缺来源不靠名称或哈希猜测。相同生成hash但不同ID仍是独立版本。认证、迟到响应、搜索过滤后清屏与缺来源coverage保留。
- 主场景`f2246d74fd8047b9b0fb7a05783bb2dc`：7修订/6生成/4确认版本/4发布/4Run。r5一个确认版本，r7三个；四个发布均RETIRED。两个其他场景各1修订、0生成/版本/Run。其余9个旧版本无明确场景来源，17个旧Run不能放到当前场景；不按重复名称“新场景”或相同hash关联。Run成功仍沿用confirmed+settled证据合同，不以ACCEPTED代替。
- “查看此版本关联任务”对服务端history使用原releaseId查询；root修复原关键词索引不含releaseId而会返回0的缺口，Run及明确关联操作保留原releaseId供检索并有回归。各Run亦可直接复盘。缺历史名称的旧Run保留原startPoint/command.destination代码，不误称目标未记录，也不借用最新场景名称。

### 独立审计与发现的修复

审计最初发现关联只核releaseId不核publication/scope/hash，已补严格矛盾检查；补历史标题原名、nullable目录头合同；发现版本任务链接查询不到releaseId，root已修。只读实库三场景投影吻合，38条跟踪均SELECT/PRAGMA。组件测试编写过程中一版测试进程挂起，审计只停止该测试并重跑通过；没有业务进程动作。规模限制保留：每个来源全局按ID扫描前5000行，再将投影各类限制200项；coverage会说明截断，并非生产级无限全历史目录。

### 实际Browser（IAB browser2，主标签5）

1. 原门户重载/授权，从主场景预览显式打开档案，默认版本与运行页。显示4个版本、各1发布/1Run，均“已停用（历史记录）”，技术ID折叠；生成记录6条默认折叠。
2. 修订差异默认r6→r7，场地/对象数量相同，实际显示1项：“点位取放停车点，位置Y 7.6→7”。历史预览有原地图，不画实时机器人。
3. 保存修订选择r2，主标题实际“新场景·修订2”，目录头仍说明当前Fab主场景r7；比较r3→r4显示宽12→14、进深8→9。比较r4→r4明确未发现变化。
4. 从r2查看点“编辑最新草稿”，嵌入搭建器实际“已保存r7”；返回没有保存或修改。场景版本→服务端任务目录实际1条，再进原Run `3bf4de2f36721778f8124891a123c85c`只读回放，显示原50.5s收尾记录。未运行或重发此任务。
5. 切另一“新场景”显示0确认版本/0生成；输入不存在场景关键词后档案清空为“选择场景”，没有留下主场景的4版本。恢复主场景后重新读取正确来源。
6. r2、比较r4/r4在整页刷新+重新授权+打开档案后仍恢复2/4/4。之后选择r6并比较6/7用于最终差异画面。页面刷新/第二标签仅GET，无新增业务意图。
7. 第二标签7独立授权读到4版本；主标签撤权后档案私有item=0，第二标签仍有4版本+6生成的10个item。关闭第二标签、主标签再授权，最终保留主档案交付。
8. 375×850历史比较document client/scroll=360/360，预览上下排列，viewport已复位。最后console error采样为空。此轮未进行实际SIM、取消/断连故障注入或实车验收。

root仅重启固定本机Gateway加载API，原launcher9208/child30212经父子身份核对停止，启动36060；修复旧Run原目标代码回退后核对child30512/parent36060再启动35964。凭据与stdout/stderr留ignored runtime，未碰Worker/Viewer或旧历史。没有因重启发恢复、暂停、发布或任务。

### 分层检查和最终状态

- 全套前端241/241（新档案11项、原组件测试仍通过）；相关后端scene-history/history/API/scene72/72，包含绑定矛盾、无源不关联、只读追踪、稳定对象差异、权限/晚响应、版本检索与旧名称代码回退。数量不相加为Browser用例。
- 31静态资源源码→web_dist→HTTP SHA完全一致，SW v21网络优先；职责清单379个Git可见文件。APP/Fleetserver diff --check通过，既有CRLF提示保留。
- 全业务表行数与逻辑SHA对本轮baseline全部相同。仍31 command/62 audit、21 Run/4198 evidence/27 run-command、13 release/13 publication、3场景/9修订/6生成、7环境控制、3方案/2execution/1781replay_projection/27scenario_events。Worker exited255、renderer exited143、viewer exited0为继承停机状态，Gateway/openTCS/MQTT保留。旧两笔误暂停与所有失败证据未改写。
- 证据：[版本运行页](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/versions-final.png)、[档案DOM](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/versions-dom.txt)、[r6/r7差异](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/difference-6-7.png)、[比较原DOM](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/comparison-dom.txt)、[375比较](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/comparison-375.png)、[241项输出](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/node-tests-final.log)、[全库基线](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/baseline.json)、[最终表/版本任务/静态资源/容器](../../agv-digital-twin/environments/p0-pair/artifacts/scene-history-20261110/final-state.json)。

未实现历史回退发布、旧release重发、建筑图配准、复杂工位/交互资产或生产安全验收；档案查看与差异不是净空/定位/精停车的实际验证。后续按主方案推进NPI与资产能力，不在本轮扩大物理结论。


<a id="floorplan-calibration-first"></a>

## 厂房底图导入、两点校准与保存重开（2026-11-10 本地）

- **产品入口。** 场景搭建和路线规划共用画布。“导入厂房底图”收起时保留校准状态。展开后选择 PNG/JPG，点 A、B 并输入实际距离。可填写像素坐标、A 点场地坐标和 A→B 朝向。默认 A 为原点、方向为场地 +X。应用后可调整可见性和不透明度、重新校准或移除。显示设置只影响当前页面。重新校准移动底图，已画的几何保留在原场地坐标。
- **修订与生成。** 两点变换保留在不可变修订中，底图独立存为受权限保护的规范化 PNG。文件与规范化图片各限 5 MiB，最多 800 万像素，单边至多 16384 px。相同文件名及规范化像素去重复用，保存/重开沿用场景 CAS。Worker 编译器验证参考字段并保留来源哈希，使用原有几何生成占据图与 Gazebo。
- **内置 Browser。** 文件选择器导入 1000×650 的 [合成厂房图](../../agv-digital-twin/environments/p0-pair/artifacts/floorplan-20261110/fab-floorplan-qa.png)，实际点击 A、B 标记并填 12 m。沿图纸描出约 13×8 m 场地、3.60 m 墙体及设备箱，切到路线页点选 3 个点、连 2 段路线并放置停车工位，编辑名称为“取放工位 A”，保存“验收 · 厂房底图规划”r1。刷新重新连接和从场景库打开均恢复图层、墙、路网与工位。重开后切换显示、重新进入校准，读回 12 m 和 A/B 标记，取消后仍为 r1。375×850 的内容宽 360/360，无横向溢出，视口已复位。最终控制台错误采样为空。
- **自动检查。** 前端 244 项、Fleet Gateway 相关 84 项、Twin 编译相关 63 项分别通过。两个编译档位以带偏移和旋转的同源参考图对照，保持原占据图、世界哈希、净空与车辆起点，生成来源保留参考图标定。34 项静态资源源码、包和 HTTP 一致，SW v22。图片匿名读取返回 401。
- **运行范围。** 仅重启固定本机 Gateway 加载接口。数据库新增 1 个图纸、1 个草稿、1 个场景修订，基线各业务表原有行的内容逐行一致。openTCS 和 MQTT 保持运行，Worker 与 Viewer 处于停机状态。本轮验证限于草稿和离线编译，实际 SIM 与实车未运行，PDF/CAD 导入与多点配准尚未实现。
- **证据。** [重开路线](../../agv-digital-twin/environments/p0-pair/artifacts/floorplan-20261110/reopened-route.png) · [重开校准](../../agv-digital-twin/environments/p0-pair/artifacts/floorplan-20261110/calibration-reopened.png) · [375px 画面](../../agv-digital-twin/environments/p0-pair/artifacts/floorplan-20261110/narrow-floorplan.png) · [数据库与 HTTP 核对](../../agv-digital-twin/environments/p0-pair/artifacts/floorplan-20261110/final-state.json)。


<a id="workcell-planning-first"></a>

## 工位布置、立牌定位与修订回读（2026-11-10 本地）

- 路线页选择停车工位，在现有右侧属性区编辑普通停车位、缓冲位或高桌载台。工位轮廓和立牌均支持画布定位与坐标输入。高桌保存桌底净高、桌面厚度、桌腿宽度；立牌独立记录位姿、安装高度和拟用 Tag／按钮编号。同场景校验 Tag 与按钮编号唯一。预填尺寸为布置参考。
- 显式应用后进入原场景撤销/重做和 CAS 保存流程。未应用表单阻止切换和保存，放弃会退出待定位状态。场景库与档案显示规划轮廓，比较识别模板、几何、桌腿和终端变化。旧普通停车对象省略新增字段，既有修订哈希保留。
- 用上一轮合成厂房图的验收草稿 r1 实测。给「取放工位 A」配置高桌，从图上分别定位桌中心 (11.4, 1.3) 和立牌 (11.7, 2.8)，录入净高 0.72 m、Tag 7、按钮 CALL-A。新增「待料工位 B」并定位缓冲位，尝试重复 Tag 7 得到明确拒绝后取消该立牌。单次保存为 r2，刷新重新连接后恢复两个规划对象、底图和高桌/立牌数据。375×850 实测内容宽 360/360，视口已恢复。
- 「生成与仿真」列出两个暂不能生成的工位，返回按钮定位首个工位。场景档案 r1→r2 实际显示「普通停车位 → 高桌载台」和新增待料工位。Gateway 拒绝此类修订时不分配生成意图、不访问 Worker，冻结亦核对原生成请求。原发布的停用按其请求处理，单测覆盖无选中生成版本时可审阅原发布。
- 全前端 249 项、Fleetserver 344 项通过。36 项资源源码、打包与 HTTP 一致。仅重启本机 Gateway，HTTP 日志本轮仅一个场景保存 POST；旧 r1 与原有账本逐行哈希保持，新增 r2 并更新验收草稿头。openTCS、MQTT 正常运行，Worker 与 Viewer 保持停机。此切片交付二维工位规划，尚未实现高桌碰撞、Tag 识别、按钮呼叫、顶升动作或实际 SIM 验收。
- 证据：[重开规划画面](../../agv-digital-twin/environments/p0-pair/artifacts/workcell-planning-20261110/workcells-reopened.png) · [生成阻断](../../agv-digital-twin/environments/p0-pair/artifacts/workcell-planning-20261110/generation-block.png) · [档案对照](../../agv-digital-twin/environments/p0-pair/artifacts/workcell-planning-20261110/revision-diff-dom.txt) · [运行与账本核对](../../agv-digital-twin/environments/p0-pair/artifacts/workcell-planning-20261110/final-state.json)。


<a id="workcell-geometry-first"></a>

## 高桌分体几何、净空与实际导航到站（2026-11-10—11 本地）

- **产品与合同。** 缓冲位生成无碰撞地面标记，高桌生成四腿与架高桌面。仅无 terminal 的模板开放生成，带立牌保留明确阻断。新配置参考尺寸 1.6×1.6 m、净高 0.8 m，已有配置不变，仍要求用户测量。工位 v1.2 从生成的双车 SDF 推导最大完整升降包络 0.6125 m，含碰撞体与 LiDAR，桌腿占据、低桌面占据与扫掠检查同源。普通无工位场景仍 v1.1，参考产物逐项哈希一致。这里的高桌为静态环境物体，未实现顶升带走。
- **发布边界修复。** 审计发现重签的错误世界哈希或同像素异编码 PNG 可迟至 Worker apply 才被拒绝。新增 v1.2 发布前纯重编译，以冻结 sceneSource、档位重建并核对完整产物、速度映射与模型；在首次 openTCS PUT 前失败即拒绝，不自动回滚或重试。Gateway 生成/冻结另独立复算像素和净空，拒绝透明/动画 PNG。模拟上游测试验证 world/profile 重签、PNG 重编码与 LIFT/蓝图修改均不触发内核写入；真实正常发布也走此路径。
- **Browser 实测。** 保留原厂房底图草稿，另建 `6e7468c618db47f0952c3e6b395e0bf5`「验收 · 高桌通行」12×8 m 场地，5 点、4 双向路线、3 停车工位与 2 车辆起点。高桌中心 (9,2)，1.6×1.6 m、桌腿 0.1 m、桌面 0.08 m。r1 净高 0.50 m 明确拒绝；r2 净高 0.80 m 生成成功，页面显示高度余量约 0.188 m、腿间净距 1.4×1.4 m。快速开发档冻结并发布，刷新恢复原生成/冻结/任务，第二标签页回读 r2 不新建意图。375 px 新标签页内容宽 360/360，控制台错误采样为空；临时响应式标签已关闭。修复了连接后仍显示“等待连接”的旧提示。初次两个窄屏截图实际仍为原宽度，保留作原始记录；有效窄屏证据为 second-tab-narrow.png。
- **真实 SIM。** release `43f623438683e379819b68f0df4b759c`，publication `026073c8f6d7aecfbf339fabf6164eab`，地图 `scene-244aec3f6f0fb2c4`。发布内核回读、双车版本与 READY 核实后，经 Browser 单次下达 LAB-01 → 高桌工位 S-3/P-4，run `7d3736c73da7c1d38941cb66032b5e9c`，command `af3138b57f35169e0349636d984b48d1`。120 帧独立只读采样无 HTTP 错误，确认 FINISHED、到站、持续停稳及 SCENE-TRAFFIC 释放；LAB-02 留在独立停车支路。只跑此次受几何影响的正常到站，没有复跑取消/断连矩阵。
- **物理证据。** 从实际 release 目录复制 SDF，确认高桌五个部件各有 collision+visual，缓冲位仅 visual。到站 Gazebo pose `(9.000862, 2.031896)` 距 (9,2) 约 0.031908 m；此时 3 个 contact 消息只含车轮/脚轮与地面，不能推导全程无接触或停车精度统计。Browser 中实际打开只读 Gazebo，画面可见高桌、地面缓冲标记和车辆；LAB-01 已进入桌下，桌面会遮挡其俯视轮廓。
- **收尾与证据保留。** Browser 关闭观察器、确认退役至 RETIRED，再关闭仿真服务。Worker exit0、viewer exit0、renderer exit143，openTCS/MQTT/Gateway 保留。重建 Worker 镜像并保留原运行卷；旧已停止 viewer sidecar 仅改名为 pretable-20261110 保留，再准备新侧车。旧失败记录、两笔历史误暂停、底图/场景与原有账本未清除。新增 1 场景/2 修订/2 生成、1 release/1 publication、1 Run/1 command 和 4 环境控制，最终 32 command、22 Run、14 release/publication；方案/事件/回放表数量不变。
- **分层自动检查。** root 重新执行前端 251 通过、Fleetserver 356 通过、Twin 252 通过/1 跳过。覆盖旋转高桌、等高接触/低桌/过窄拒绝、远离路线的低桌占据、buffer 无碰撞、第二辆车包络和旧场景哈希。三层结果不相加为实际仿真用例。36 资源源码/打包/HTTP 哈希一致，SW v24，职责清单 392 个 Git 可见文件。
- **证据。** [低净高拒绝](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/low-clearance-rejected.png) · [净空审阅](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/clearance-review.png) · [Gazebo 实景](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/gazebo-high-table.png) · [窄屏重开](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/second-tab-narrow.png) · [实际独立采样结论](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-independent-audit/actual-window-20261111T045814Z.final.json) · [物理到站采样](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/physical-arrival-summary.json) · [最终账本/状态/静态核对](../../agv-digital-twin/environments/p0-pair/artifacts/table-geometry-20261110/final-state.json)。

仍未验证 Tag/按钮、精对准、顶升和承载、任意车型/布局、实车停车精度及生产安全。后续按主方案接独立立牌观测与事件，不将本次固定 pair NOP 通行扩大为自动搬运交付。


<a id="terminal-reference-first"></a>

## 独立立牌实体、净空与同源发布（2026-11-11 本地）

- **产品范围。** 沿用工位属性区，立牌按真实比例显示底座、正面箭头与标识编号，编辑“标识中心高度”和“立牌正面朝向”。固定模板底座 0.36×0.42×0.04 m、立柱宽 0.06 m、面板 0.04×0.32×0.32 m、标识边长 0.20 m；正面为局部 +X，90° 朝场地 +Y。生成最低标识中心 0.21 m；旧草稿仍可读。页面明确“视觉识别未接入 · 按钮未接入”，不提供伪造的自动叫车或识别结果。
- **实现与发布。** Worker 为底座、立柱和面板生成静态 collision/visual，并以 36 个可视格形成 DICT_4X4_50 参考标识。旋转底座全占地进入同源导航栅格；Gateway 独立复算越界、实体相交/相切、路线和驻车扫掠净空。带立牌使用 scene-routes-pair-v1.3；旧 v1.1/v1.2 生成哈希保持。发布前复核固定 SIM/p0-pair/profile/frame 身份与来源，再纯重建完整产物，拒绝错误身份、伪造观测或共同篡改的底座占据，均在 Kernel 写入前失败。
- **Browser 实测。** 沿用“验收 · 高桌通行”场景 `6e7468c618db47f0952c3e6b395e0bf5`。保留 r1/r2，r3 将 Tag 7 / CALL-TABLE 立牌放在 (7,2) 路线上，明确拒绝并指向高桌工位；r4 移至 (9,4)、正面 -90°、中心高 1.10 m，生成成功。页面显示底座距路线/点位 1.820 m、扣除 0.511 m 扫掠半径后的余量 1.309 m。显式冻结并发布；刷新、第二标签页恢复 r4 和原生成，不重发业务。375 px 内容宽 360/360，无横向溢出。实际打开门户 Gazebo 观察器，可见独立立牌、高桌、缓冲标记及两辆车。
- **真实 SIM。** release `5567e36aa6f75f2e3e180983ea817f93`，publication `cf496f8e9b84f46561fd0d5b723088dd`，两车 READY 后，经 Browser 单次下达 LAB-01 → 高桌工位 S-3/P-4。run `46b24ada5a39d2936458c208447c6d96`，command `eb31fbbe467e268c07c1d35c725aa2d4`，openTCS order `fleet-b5c3d93f2f82df4a9a45724842f172eb`。120 帧独立只读采样确认终态、到站、无活动订单、原会话、持续停稳与 SCENE-TRAFFIC 无 owner；最长 44 个不同源帧、42.995 秒。末帧 AMCL 距目标约 0.0202 m，是估计值而非真值/停车精度统计。LAB-02 留在独立停车支路；只验受改动影响的正常导航，没有重跑取消/断连矩阵。
- **分层自动检查。** 前端 254 项、Fleetserver 373 项通过；Twin fleet_lab 范围 264 通过/1 跳过，加入既有临时离线验证依赖后全 tests + fleet_lab/tests 326 通过/1 跳过（ROS rclpy 不在 Windows 环境）。首次直接全量收集因 workspace .venv 缺 NumPy 失败，原日志保留；复验只使用临时 PYTHONPATH，没有修改运行依赖。独立 OpenCV 4.13.0 对全部 50 个合成正视 SDF 标记逐像素核对并解码，此项不是 Gazebo 相机或车载识别验收。独立审计另核对 10 个物理边界例和发布拒绝路径。上述层次不相加为实际 SIM 用例。
- **停机与保留。** Browser 关闭 3D、确认停用至 RETIRED、关闭仿真服务。Worker exit0，viewer exit0，renderer exit143；openTCS/MQTT/Gateway 保留。旧已停 viewer 侧车改名 preterminal-20261111 保留，未删除运行卷或历史。与本轮 composite baseline 比较，除该场景草稿头更新外，旧业务行全部逐行哈希一致；新增 2 修订/2 生成、1 release/publication、1 Run/command、4 环境控制。最终 33 commands、23 Run、15 release/publication。旧失败、误暂停和原始采样保留。独立采样脚本的 newRunIds/newCommandIds 使用较早脚本基线，不能当本轮增量；本轮增量以 final-state.json 为准。36 个静态资源源码/包/HTTP 一致，SW v25，职责清单 395 个 Git 可见文件。
- **证据。** [路线阻断](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/terminal-blocked.png) · [最终审阅](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/terminal-review-final.png) · [窄屏重开](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/terminal-narrow.png) · [Gazebo 实景](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/terminal-gazebo-desktop.png) · [独立采样](../../agv-digital-twin/environments/p0-pair/artifacts/scene-routes-independent-audit/actual-window-20261111T052951Z.final.json) · [实际世界 SDF](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/deployed-world.sdf) · [标识离线核验](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/marker-opencv-verification.json) · [最终账本/资源/容器](../../agv-digital-twin/environments/p0-pair/artifacts/terminal-reference-20261111/final-state.json)。

立牌为静态参考物；本轮不代表相机可见性、遮挡/光照鲁棒性、按钮 I/O、精停车、顶升承载、任意布局或实车生产安全通过。下一步按主方案接工位观测与呼叫事件合同，实际来源未接入时保持明确不可用。


<a id="server-example-first"></a>

## 小服务器示例工厂部署与 Browser 练习（2026-11-11 本地）

- 新增公开静态 `example.html` 和 `scene-builder/example.js` 模板，地图工作区增加“示例工厂 · 上手练习”。12×8 m、北侧隔墙、设备箱体、防撞挡块、5 点/4 双向路线/3 停车位、2 起点，含高桌和 Tag 7 立牌。打开是独立未保存副本，无自动保存、发布或运行；已有 sceneId 优先加载原修订，不用模板覆盖。
- 更新服务器 `pythonpy-SER /home/pythonpy/Fleetserver` 的 Gateway 与静态包，沿用原配置、密钥、命名卷。部署前代码归档和旧镜像保留于 `/home/pythonpy/agv-backups/example-20261111/`、镜像 `fleetserver-gateway:before-example-20261111`；SQLite 使用 backup API 保留于原 runtime 的 `backup-example-20261111/`。只重建 Gateway，未重启 openTCS/MQTT/Caddy，未启动远端仿真。
- Browser 实际打开 HTTPS 示例，设备宽度 2→2.4 m，保存“示例工厂 · 已保存练习”`4fe15f02a02e40778cd1f498c845b083` r1；选择高桌工位并核对净高、立牌朝向和 Tag。刷新重新授权恢复 r1 与 2.4 m，路线和工位保留。门户地图页可找到示例入口，示例页 375 px viewport/client/scroll 为 375/360/360，视口恢复；控制台 error 采样为空。
- 修正引导不再把已保存副本称作尚未保存。服务器未配置隔离 SIM 时，生成页明确提示并禁用生成按钮；保留本机仿真入口与手工步骤，说明不同机器不能使用开发机 loopback、两端草稿不自动同步。未宣称服务器已经接通远端 Worker/观察器。
- 前端全量 254 项通过，示例源通过前端模型校验；实际离线 v1.3 编译器生成成功并通过净空。首次离线结果提取误取不存在的 workcellClearance 顶层键，未影响编译或业务，修正提取后存 offline-compile.json。没有为示例额外启动实际 SIM 或实车测试；之前立牌真实到站结论不扩展为本示例实际运行。
- 部署后 38 项静态资源包/服务器 HTTP 哈希一致，Gateway healthy、openTCS API ready。服务器旧底图/草稿/修订全部逐行保持，commands/audit 仍 0；只新增示例场景及 r1。Windows 本机门户重新加载静态白名单，本机 example.html HTTP200，Worker/观察器保持停机，仅 pair openTCS/MQTT 运行。
- 证据：[服务器保存后的路线](../../agv-digital-twin/environments/p0-pair/artifacts/server-example-20261111/server-saved-routes.png) · [练习入口](../../agv-digital-twin/environments/p0-pair/artifacts/server-example-20261111/example-home.png) · [窄屏](../../agv-digital-twin/environments/p0-pair/artifacts/server-example-20261111/example-narrow.png) · [服务器只读核对](../../agv-digital-twin/environments/p0-pair/artifacts/server-example-20261111/server-audit.json) · [离线编译](../../agv-digital-twin/environments/p0-pair/artifacts/server-example-20261111/offline-compile.json)。

<a id="remote-host-20261111"></a>
## 2026-11-11：小服务器统一门户 → Windows Worker（部分通过，保留未结案）

- 服务器 `https://192.168.0.109` 成为唯一 Gateway 控制与新账本入口。专用 pair openTCS/MQTT 仍在 Windows，经 SSH 反向 loopback 55214/55234/55235/55236；服务器原 openTCS/MQTT 不变。没有内核迁移或本机旧历史合并。
- Windows `start_gateway.py` 在 remote-authority marker 存在时拒绝旧门户。私有 host agent 只接受固定部署、固定容器身份、独立密钥、时效意图与原操作幂等回执，不提供 shell RPC。服务器 Gateway 127.0.0.1:8000，Caddy HTTPS 同源 viewer 由短期 HttpOnly Secure cookie 授权，WebSocket 经 `/sim-viewer/`。
- 备份：服务器 `/home/pythonpy/agv-backups/remote-host-20261111/portal-before.tar.gz`、镜像 `fleetserver-gateway:before-remote-host-20261111`、Gateway runtime `backup-remote-host-20261111/`。原数据库/日志/失败与容器卷保留。凭据只在 ignored runtime。

### 实际 Browser / SIM

1. Browser 从服务器保存示例 `4fe15f02a02e40778cd1f498c845b083` r2，名称“示例工厂 · 统一仿真”。先生成工况方案供检查，再明确新建快速开发生成，冻结 release `c90ed481d5e68c07a28f5a66c4144b2d`，publication `3b672640024ebbbb2ec773872dcb3a85`。
2. 从服务器页面启动本机 Worker。首次发布因跨机器源时间领先约 0.6 秒而等候超时；保留原 UNKNOWN。Windows w32tm 无管理员权限不能同步，加入隔离 SIM 有界 UTC 预算：未来最多 1 秒、表观过去最多 2 秒，保留原时间与本机单调传感器年龄。部署后 Browser **重新核对原发布**，原 publication READY；没有重复 apply。
3. Browser 打开 Gazebo，实际 iframe 为服务器同源 `/sim-viewer/`。画面是真实 `gz sim -g` 渲染，显示墙、设备、高桌、立牌及双车；只读，无驾驶或世界控制。保存 `server-gazebo-running.png`。
4. Browser 唯一导航 run `a5e278d9c4df267308f52cec14550099`，order `fleet-5c93dc7af1b3bb386a90f4b08eca5556`，LAB-01 从待料起点到高桌工位。Gazebo 真值实际运动采样 x=3.4068、y=1.9936、vx=0.0611；随后到高桌附近 x=9.0104、y=1.9898。**没有成功终态**：Nav2 最终 `Failed to make progress`、Bridge `NAVIGATION_FAILED`，不能把附近位置视为到站。
5. Browser 正常撤单回执 `8679230f9d524227c397b60bd817c1ac` ACCEPTED。订单 WITHDRAWN，但 vehicle.transportOrder/allocatedResources 仍保留，completion.settled=false。现 authored-route 不支持既有 canonical MQTT 故障恢复；该审阅被拒绝，未发送恢复操作。正常停用被 Worker `SIM_WORKER_RESOURCE_HELD` 阻断。保留上述失败，不手工清资源、改 DB 或伪造 RETIRED。
6. 新增并经 Browser 明确审阅/确认“停止仿真计算（保留未结案）”：关闭固定 Worker/观察器，publication UNKNOWN、原 run 保留。4 条本轮生命周期回执均 COMPLETED（startWorker/startViewer/stopViewer/stopUnresolvedWorker）；本机 Host child intents 去重。最终 Worker exited **0**、viewer exited **0**、renderer exited **143**。仅 pair openTCS/MQTT 保持运行，连接程序低负载待命；服务器门户健康。
7. 刷新并重新验证密钥、第二标签页重新连接，均读取同一原 run/cancel receipt 和已停止环境，无新导航意图。场景编辑保存/生成/发布、服务器下单、真实画面、保留证据的停止计算通过；成功到站、资源释放、正常 RETIRED 和再次运行 **未通过**。

### 本轮修复与离线检查

- HTTPS 代理 Origin 明确配置且核对 Host，不放开任意 Origin/XFF；发布前 origin 拒绝未执行 Docker。
- 新发布尚无运行时 live overlay 过滤 null；实际 Browser 重验不再出现 releaseId 空值异常。
- 停用通知只在 RETIRED 时报告成功，UNKNOWN 不再显示已停用。
- 显式停止计算保持部署/固定容器鉴权，先存 durable intent、原发布 UNKNOWN，再停容器；不修改 Run/命令/内核资源，重复 request 只读原回执。仅隔离 SIM，不是安全停车能力。
- Gateway **393 passed**；Node **257 passed**。包含跨机器时钟边界、专用 agent 鉴权/身份/重复意图、同源 viewer cookie、origin、空任务叠层、停止计算需审阅且刷新无副作用等。测试数量不代替实际 SIM 或生产验收。
- 首次静态白名单回归因旧期望 36 而失败，当前 38，修正后全过。首次部署非秘密 gateway.yaml 权限 0600 导致容器读取失败，改为 0644、父目录 0700，秘密 connection.env 仍 0600。Caddy 配置语法首次验证失败，在部署前修正。原始输出保留。

证据均在 `agv-digital-twin/environments/p0-pair/artifacts/remote-host-20261111/`：`gateway-tests-final.log`、`node-tests-final.log`、`worker-moving.json`、`server-running.json`、`server-after-cancel.json`、`server-retirement.json`、`server-final.json`、`server-gazebo-running.png`、`server-stopped.png`。数据库捕获脚本仅 SQLite mode=ro，不调用观察/恢复/控制 API。当前 Windows connector 无开机自启，重启后按 pair README 启动；本机断电无法由门户唤醒。

**下一出口：** 定位高桌末段进展失败与未释放资源的原因，补齐 authored-route 的受控故障结案及正常重跑；当前不声称完整可反复运行 MVP 或实车搬运已验。


<a id="table-finish-20261111"></a>
## 2026-11-11 高桌收尾、返程与服务器实景查看复验

范围：服务器 HTTPS 门户、Windows 固定 pair Worker、真实 Gazebo；用户的「示例工厂 · 统一仿真」最新 r6 保留，未覆盖用户编辑。两个机器人已加载，但本轮运动是 LAB-01 的高桌往返，LAB-02 停在 P-5。不是双车同时运行、任意场景或实车搬运验收。

### 原因与实现

- 原高桌失败的采样显示目标附近只有角速度、没有直线修正，AMCL 估计约距目标 2.1 cm，略超 2 cm 到站检查。RPP 独立 stateful XY 锁定可能与定位修正后的目标检查不一致；authored-route 的 RPP 改为 `stateful=false`，到站检查仍为 0.02 m / 0.05 rad，Bridge 路线保护未放宽。实际生成的 nav2-current.yaml 已保留。源码依据：[Nav2 Jazzy RPP](https://raw.githubusercontent.com/ros-navigation/navigation2/jazzy/nav2_regulated_pure_pursuit_controller/src/regulated_pure_pursuit_controller.cpp)。
- `WITHDRAWN` 仍是撤回中，不当作任务终态。新增显式「结案已关闭的仿真会话」：核对固定执行容器已退出、原发布/运行/撤单身份、无其他活动意图，结束旧内核动作并禁用虚拟车，回读无资源占用。独立 sessionClosure 记录不把失败改成成功；停用、重新发布仍须另行确认。
- 用户本轮手动同时停了 Worker/openTCS/MQTT，服务器本身未死机。恢复调度后内核临时订单已消失：仅在已有 ACCEPTED 撤单、内核空订单且车辆无占用时允许明确结案；不把订单消失算作到站。
- 第一次返程又失败：中间点 P-3/P-2 的 VDA nodePosition **没有 theta**，Bridge 却给 Nav2 默认 0 rad，导致返程在中间点反复朝东转身。P-2 转向时 AMCL 从约 x=3.995 修正到 x=4.151，超出当前路段起点保护范围，requested wz 非零但 authorized wz 为零，随后进展超时。新增无朝向通行点沿入边航向导航；显式停车朝向保持不变。原执行 SQLite、速度链采样和日志保留。
- 原结案实现假定 openTCS properties 是字典，实际有序列表导致 preflight 异常；修正为使用既有 properties 归一化。该失败回执保留，读回只识别未到达任何内核写入边界，不重试；Browser 重新明确提交后结案成功。最终代码补充结束时容器身份和订单终态复核（离线回归通过）。
- 网页「继续场景」改为「编辑场景」，说明编辑不会启动机器人。嵌入编辑器的运行链接改为回到同一门户，保留连接，避免在 iframe 中再加载一套门户。重开已发布场景亦有「查看当前运行与实景」。
- 旧服务回执读取失败时仍独立读取当前环境；保留 pending，不自动重发，但可查看已运行观察器。观察器的已验证身份、监听与同源鉴权仍检查；导航未就绪不再隐藏故障画面，不授予导航准入。环境读取失效仍撤下画面，不伪造实时状态。

### 实际 SIM / Browser 结果

| 会话 / 运行 | 结果 |
|---|---|
| 原失败 a5e278d9c4df267308f52cec14550099 | 保留失败、撤单、源证据；明确 sessionClosure COMPLETED，未确认到站；原发布随后 RETIRED |
| release 2326cdcec9ad9f18c23d66e1e07794ef / ca38c176e3f3f090de71c450356dd3d1 | 首次修正后高桌 P-4 FINISHED、confirmed=true、settled=true、持续停稳与无活动订单成立 |
| 同版返程 df245c4fc905a6573007ba9ca8e55cd4 | P-2 附近 NAVIGATION_FAILED；撤单 e0e59c88917150ff91ae11b8989a5d81 ACCEPTED，失败证据保留；网页停止计算、明确结案、旧发布 RETIRED |
| 新 release 925ffa1e6d08b02cfc3bfc7d1f98c194 / publication 436e4d927e0c82b483b73e4e9c2d2597 | 新会话发布 READY；没有自动重放旧任务 |
| 去程 0529fcc4c878d28a695126c95afb291b | P-1 → 高桌 P-4，FINISHED / confirmed / settled / sustainedStationary / noActiveOrder 全部 true |
| 返程 26abc814678896e634c33c3cd52cff53 | 高桌 P-4 → 待料 P-1，同样核实 FINISHED、到站、持续停稳、无活动订单；通过上一轮 P-2 失败位置 |
| 最终正常停用与关闭 | Browser 明确停用当前仿真 → RETIRED → 关闭仿真服务完成；Worker、viewer、renderer 全部 exited 0。worker-shutdown 最后记录 graceful=true、escalatedToSigkill=false，关闭时已无所属执行进程 |

实际 Browser 另验：服务器编辑器加载用户 r6；同页 Gazebo 有真实两车/墙/高桌画面；第二标签页查看已有画面；车辆故障时画面仍可查看；从编辑器返回主工作台不产生嵌套门户且保留控制会话。旧 pending 读取失败的精确故障由单元夹具验证，没有往用户标签页注入存储伪造故障。

### 检查与限制

Gateway 全套 400 passed，最后结案收尾加强定向 7 passed；Node 全套 258 passed；正式 Bridge 的镜像内构建与 30 tests 全过。测试结果与实际 SIM/Browser 分列，未测实车。

第一次故障停止计算时 Worker exited 1（停机证据保留），不算正常退出成功；最终正常退役后 Worker/观察器均 exit 0。最终留下服务器门户、专用 openTCS/MQTT 与低负载连接程序，Gazebo/Worker/观察器均关闭。本轮没有长期空跑，也没有通过删除账本/日志消除失败。

证据目录：`agv-digital-twin/environments/p0-pair/artifacts/table-finish-20261111/`。关键文件：`return-evidence.json`、`return-blocked-worker.json`、`return-execution.sqlite`、`return-nav2-failed.log`、`final-ledgers-stopped.json`、`final-retired.json`、`worker-shutdown.jsonl`、`server-gazebo-robots.png`、`viewer-with-navigation-blocked.png`、`return-arrived.png`、`server-final-stopped.png`。此前 remote-host-20261111 失败证据保留。

当前出口：固定示例新会话高桌往返、正常停用和网页关闭已实际通过；不扩大为任意地图稳定性、所有断连恢复或生产安全认证。再次使用需准备服务、生成新的不可变版本并明确发布，不复用已退役 release。

<a id="implementation-audit-20261113"></a>

## 2026-11-13 全实现审核：实际 Browser 只读与未保存交互

本轮按用户要求实际逐页打开门户审核交互。入口为 `https://192.168.0.109/`，使用现有 operator 权限读取受保护的历史与场景；密钥未写入本记录。测试结束时刷新页面，控制会话已失效，页面返回地图与发布。源码发现与本地测试汇总见 [全实现审核](CURRENT_INTERACTION_AUDIT.zh-CN.md#implementation-review-20261113)。

本轮没有点击发布、开始、撤单、恢复、结案、准备仿真、停止仿真或退役；没有为了取得新证据清资源、重放或恢复任务。唯一对既有场景的编辑是当前标签页中改名并撤销，最后明确放弃本轮未保存修改；未点击保存。示例入口打开的是未保存练习副本。以下结果只代表实际 Browser 对当时页面及保留历史的观察，不是新的 SIM 运动验收。

### 当时环境与历史范围

- 门户可访问；主层显示 openTCS 反馈不可用/过期、模型读取失败，两车位置未报告，运行控制禁用。
- 虚拟实验诊断显示 Worker/Viewer 为 `state=unavailable, running=false, error=ENVIRONMENT_HOST_UNAVAILABLE`。例如页面原始依据的 `observedAt=2026-11-13T20:48:09Z`。该时间是本次接收/检查记录，不是车辆源观测时间。
- 场景库可读一个既有场景，当前修订 r6；档案可读 6 次修订、7 次生成、3 个运行版本及 5 次车辆运行，三个发布记录均为 RETIRED。
- 搬运任务检索展示 7 条记录（5 个运行与 2 个撤单记录）；事件查询可分页浏览 46 条。数量仅用于说明本次观察范围，不是发布前后数据库对账。

### 逐页操作与结果

| 证据编号 | 实际打开/点击的内容 | 观察结果 |
|---|---|---|
| B01 | 虚拟实验 → 环境摘要 → 环境与操作依据 → 原始诊断 | 同时出现“仿真服务已关闭，不占用仿真 CPU”和主机未连接；原始状态为 unavailable，不能据此确认停机。开始/停止等控制当时受阻断，没有执行 |
| B02 | 搬运任务 → 既有故障任务详情 → 回放 → 时间末尾；地图与发布 → 场景档案 → 版本运行；事件与对账搜索结案事件 | 同一已结案故障运行在任务列表、场景档案仍显示“进行中（历史记录）”。回放末尾有 SIM_SESSION_CLOSED 原始记录，却显示“原始事件”；事件中心查 `SIM_SESSION_CLOSED` 返回无记录 |
| B03 | 虚拟实验展开“环境与操作依据”和“运行历史与恢复”，继续阅读并等待正常刷新 | 随轮询这些展开项被收起，打断阅读。未注入脚本改变 UI 状态；属于实际交互复现 |
| B04 | 从场景库打开 r6 → 修改名称为临时审计名称 → 返回 → 取消离开 → 改回原名 → 撤销两次 | 未保存离开保护有效；两次撤销恢复原内容且无更多可撤销项，但仍显示“有未保存修改”，生成入口受影响。最后选择“放弃修改并继续”，回到主工作区，未保存服务器修订 |
| B05 | 场景档案展开修订、切换历史修订、选择比较版本；打开高级地图发布/历史 | 修订选择、对比与证据展开可操作；旧发布明确 RETIRED，不可作为当前就绪证明。没有点击发布查询对账以外的业务动作，也未生成新版本。部分版本对比无差异不能仅据此判错，源码已覆盖工位字段 |
| B06 | 运行总览选 LAB-01 → 对象详情 → 导航下单 → 用所选车辆配置单次验证；查看多车作业配置 | 车辆未知位置/速度等没有补假值；模型过期时下单禁用；选车能带入单次验证配置。普通撤单文案与实际停车分开；未执行导航或方案保存 |
| B07 | 总览车辆详情按 Esc；刷新主门户；第二标签页打开示例说明及练习副本 | Esc 关闭详情有效；刷新后显示“启用控制”，没有继承内存密钥。匿名页面的 RTS 空状态却显示“当前版本尚无任务运行记录”，应改成尚未读取/需授权，不能把未知投影为空。没有观察到新业务意图，未做服务器 SQL 差量证明 |
| B08 | 搬运任务搜索/详情；事件类别、分页下一页、搜索并重新查询 | 历史列表与分页能用；查询后回第一页，无结果有空态。B02 所述结案事件覆盖缺口单独保留，不把列表能查询算作语义完整 |
| B09 | 场景搭建三步骤、底图入口、路网对象、高桌工位、生成页；示例说明 → 打开我的练习副本 → 路线对象 → 高桌属性 | 可见高桌尺寸、桌底净高、立牌独立位置/朝向/ArUco 编号；页面清楚说明视觉识别、实体按钮和顶升未接入。没有上传底图、保存示例、生成或发布 |
| B10 | 示例场景编辑器在 375×812、320×812 视口观察，展开路线与工位属性 | 当次编辑器可用纵向布局，document 的 clientWidth/scrollWidth 分别同为 360/360、305/305（扣除滚动条），未见该页横向溢出。主门户视口覆盖未随该工具切换生效，因此不把主门户记为手机布局通过。结束时已 reset 临时视口 |
| B11 | 地图与发布 → 导入 ROS 地图 → 旧编辑器 → 检查草稿、导入 ROS 地图 → 关闭认证弹窗 → 返回 | 嵌入式旧编辑器正常进入与返回；未认证时检查/导入要求连接工作区，保存禁用。未提交文件、导出有效地图、保存或覆盖草稿；这些完整流程未测 |
| B12 | 车辆与连接、连接与版本依据、当前内核订单/日志、历史回放与返回当前页面 | 当前/历史边界有提示，回放没有控制入口，缺观测区间没有用连续动画假造实测；过期/未观测在主层可见。部分 Stale、Order、IDLE、Waiting for model 等仍是工程英文，影响中文操作层一致性 |

B02 的可追溯例子：运行 `df245c4fc905a6573007ba9ca8e55cd4`，创建时间 `2026-11-11T22:50:21Z`，原状态 `ACCEPTED`、订单 `WITHDRAWN`、物理完成未确认。回放约 604 秒处原始事件为 `SIM_SESSION_CLOSED`，结案观测时间 `2026-11-11T23:00:25.544328Z`。结案应结束该会话的活动统计，同时保留未成功到站；不能篡改历史运动结果。

### 验收边界

本轮 UI 检查结束后门户仍为反馈不可用/过期、控制禁用状态；没有为审核启动仿真或改变部署。读到了历史成功与正常退役记录，不等于本轮重新证明成功到站、停稳、资源释放或 Worker 关闭。

本轮未验证：在线健康时的全部可点击控制流程、保存并发冲突/上传下载闭环、断网升级缓存、完整触屏/键盘可访问性、任意地图、运行中的故障注入、ROS 镜像构建和实车。浏览器快照/截图用于现场审阅，未伪称已保存独立截图文件。终端到服务器的 SSH 在当前环境不可用，未进行远端文件 hash 比对或账本前后 SQL 核验。

结论：实际 Browser 发现 B01/B02 两项影响发布判断的状态缺陷，以及 B03/B04 的可重复交互问题。其他已操作部分按上表限定报告；本轮没有新增实际 SIM 或实车通过结论。


## 2026-11-15 审核整改：尚无新增实际 Browser/SIM 结果

本轮已实施上一轮审核的源码修复与离线回归，详见 [整改记录](CURRENT_INTERACTION_AUDIT.zh-CN.md#implementation-fixes-20261115)。终端 SSH 被拒绝、Docker 引擎不可用，当前会话也没有 Browser 控制入口，故本轮没有发布、开始、撤单、结案、恢复或退役操作，没有新增实际 SIM/实车通过结论。11 月 13 日 B01—B04 的实际复现记录继续保留，等待修复版本部署后正式复验。

<a id="workflow-audit-20261115"></a>

## 2026-11-15 操作流程审核、部署与实际复验（后续阶段）

本节是上述早期阻断解除后的追加结果，不覆盖前述事实。root 派发前端、后端和启动维护三个轻量子任务，负责源码冻结、部署与实际 Browser 验收。入口为服务器 HTTPS 门户，部署身份 `e24783744ea243c98997fa0d324e8ae9`；固定 Windows `p0-pair` 的专用 MQTT/openTCS/Worker 经既有私有连接服务，未改 openTCS 内核，未接实车。原用户场景「示例工厂 · 统一仿真」`4fe15f02a02e40778cd1f498c845b083` 的 r6 保留；本轮临时改名后撤销，没有新增场景修订。

### 部署来源与维护过程

- 冻结四仓当前源码（含已有未提交改动），排除 runtime、密钥、账本和 artifacts。服务器镜像从冻结源码构建；Windows Worker/观察器在已停止状态更新，旧容器仅归档重命名，卷、日志和 journal 保留。没有执行清库、删除旧容器或 `compose down`。
- 首次服务器镜像部署实际失败：维护目录 `umask 077` 与打包缺目录 mode 导致非 root 进程无权读取 `api.py`。已立即恢复旧 Gateway，失败镜像及 `server-build.log` 保留；补齐归档目录权限、仅应用代码/地图/静态资源的可读权限，以及 Dockerfile 非 root 读取检查后重新构建部署。runtime/凭据未递归放宽权限。
- v3 运行镜像 `fleetserver-gateway:workflow-20261115-v3`，image ID `sha256:564eac829dd9a7343021363e33adf8b22026fd2994df2a06d59b738d93289d46`。58 个容器内 Python 文件与冻结源码逐文件匹配；39 个门户资源的本地打包清单与实际 HTTP 内容 SHA256 全匹配。
- 初始部署前后所有业务表行数和逻辑 SHA256 一致；当时仍 5 Run / 7 command、1 场景 / 6 修订 / 7 生成、3 release / 3 publication。历史回放产生的派生投影另记，不冒称派生缓存始终不变。
- Windows 已安装当前用户登录任务 `AGV fixed pair connection`。只自动准备安装好的 Docker、核对身份的固定 MQTT/openTCS 与私有连接，不启动世界、Worker、观察器或任务。维护复验发现硬停止计划任务遗留 SSH，修正为 stdin 管道监督子进程；实际 Stop 后 SSH 与转发监听均消失，随后恢复该登录任务。整机断电/重新启动尚未实测。
- 源码快照工具的 `buildInputsVerified=false` 保留：Python/Caddy 基础镜像在服务器，ROS 镜像在 Windows，单机检查不能冒充全部构建输入已在本机验证。另存两端实际 image inspect、源清单、镜像和部署文件读回。初期路径/工作目录错误及测试失败日志均保留，后续有效重跑单独记录。

### 实际页面与正向运行

| 操作 | 实际结果与范围 |
|---|---|
| 主机连接不可用时打开工作台 | 主层显示服务状态未知、尚未确认停止，准备按钮禁用并提示开机登录、等待/刷新与维护人员；不要求操作者运行 shell，也不再把 `unavailable/running=false` 当成停止 |
| 展开依据、刷新和导航；r6 临时改名并撤销 | 依据展开保持；撤销回原内容后恢复干净状态且生成入口可用，未保存修订 |
| 未认证的新页、认证后读取 | 新页明确“尚未验证本页权限，未读取运行记录”；认证后读取当前运行，不把未读显示成零任务 |
| 已结案历史任务、事件搜索和回放 | 原两笔故障结案可按中文结果检索；“结案”事件可检索。v3 关键事件选择器可直接定位原 `df245c4fc905a6573007ba9ca8e55cd4` 的 604.034 秒结案；保留未成功到站和缺源/缺记录空窗，未补画运动；历史主层无实时故障横幅且无运行控制，退出恢复当前状态 |
| 网页准备服务 → 生成 → 确认版本 → 审阅发布 | Worker 仅准备服务不会重放旧世界。r6 选择快速开发档（0.15 m/s、0.75 rad/s、路段倍率 3），新 release `641fdcb75cea6b9139208a759c6030c3`、publication `4fedcf41984854c86b1ae1bf3fe3a8c6` 明确发布，双车准入 READY |
| 网页打开 Gazebo | 同页真实 Gazebo 显示场景与双车，只读画面；LAB-02 留在 P-5，未声称本轮双车并行运动 |
| LAB-01 去高桌 | Run `e5af91c98a0bd95a7a4f23e8d4af328b`，订单 `fleet-1435205d368ea8fb680c2a733a102dc4`，创建 18:44:52.027141Z，18:46:17.213144Z 封存。FINISHED、confirmed、sustainedStationary、noActiveOrder、settled 均 true，三帧停稳源采样跨约 2.17 秒 |
| 运行中刷新、第二标签页认证读取 | 恢复同一 Run 与订单；去程后的 GET 只有 6 Run，未复制发单。第二页只读取与复盘，没有提交新任务；刷新后内存权限须重新验证 |

去程封存时 `claimed=[]`、共享 `SCENE-TRAFFIC owners=[]`；末段 `R-3`、站 `S-3` 和停车点 `P-4` 的位置分配仍保留，这是编译器预期允许的终点保留。**到站成功不等于全部资源释放。** 完成后 Run 查询返回封存观察，不能用于断言之后的实时资源归属。

### 普通撤单的实际流程问题

root 在网页选择返程待料缓冲位并明确执行：Run `13f816f65432737d4dad0c88b5a4b47e`、订单 `fleet-b977654a54343ee0398a408d3be81b66`，创建 18:48:06.711570Z。随后审阅原任务并确认正常撤单，回执 `34da6b707b8c4d817722ca23458ab73e` 于 18:48:23.309341Z ACCEPTED。

- 初期内核 WITHDRAWN，但车辆继续执行已下发路段，`stationary=false / noActiveOrder=false / settled=false`。页面明确受理不等于停稳，没有当作急停。
- 后续内核 FAILED、车辆停在 P-2、速度为零且无活动内核订单；车端仍有 `released=false` 的 P-1 / R-1:reverse 后续路径。因此 `closurePhysicalEvidence=false`，不能积累严格收尾所需的持续停稳帧，`settled=false / confirmed=false`。共享区仍由 LAB-01 占用，不能说资源释放或返程成功。
- 实际点击“结束已停稳的故障任务”只进入读取检查，却得到英文 `Authored route SIM does not support stopped-fault recovery`。这是本轮新发现的界面死路：该按钮属于 canonical 恢复，不支持当前自定义路网。未生成恢复业务命令。子代理据此修正为基于原 Run profile 身份的中文会话收尾引导，保留 canonical 行为。
- 独立源码审计另发现先退役可能绕过未结案 Run，令后续会话结案前置条件无法满足；没有在实际环境故意造成此死路。后端补一致锁内未结案阻断，并保留原 RETIRED 请求的幂等读取。
- root 从网页审阅并确认“停止仿真计算（保留未结案）”；页面显示已完成，Worker/观察器停止，原任务与占用历史保留。没有用 shell 清订单、重置资源或重放任务。

本轮证据均在 `agv-digital-twin/environments/p0-pair/artifacts/workflow-audit-20261115/`，包括失败构建、冻结源、账本快照、HTTP 内容哈希、初始与最终运行观测和页面截图。后续修复部署与正式结案收尾追加如下。

### 最终 v4 部署与网页收尾

最终镜像 `fleetserver-gateway:workflow-20261115-v4`，运行 image ID `sha256:99c899bc232338e69c6826e652f31994dc7460faddeb8245740c0809c89d7154`，Gateway healthy。`release-source-v4/` 的源码清单已验证，实际容器 58 个 Python 文件与该快照逐文件一致；39 个本地打包/HTTP 资源一致，非 root uid 10001 实读通过。v4 构建本身成功，但上传 shell 脚本末尾 CRLF 空行导致外层退出 1；原日志保留，单独核实镜像输出与健康后部署，没有把外层错误隐藏成首次全成功。

实际页面升级通过关闭旧站点标签页并重开完成，没有清缓存或绕过 Service Worker。新页面在同一未结案 Run 上显示中文五步流程且不再提供不支持的恢复按钮。

| 正式 Browser 动作 | 实际收尾结果 |
|---|---|
| 审阅并确认“结案已关闭的仿真会话” | `c669dea27611524fa27da18277acf9c6`，18:54:31.186346Z COMPLETED；Run 保留 FAILED、`physicalArrivalConfirmed=false`。两车 `transportOrder=null / allocatedResources=[] / claimedResources=[] / integrationLevel=TO_BE_IGNORED`，`activeRunIds=[]` |
| 按新提示“准备仿真服务” | 只启动空闲 Worker API，不重放旧世界、任务或观察器；无新增 Run/command |
| “查看并停用当前发布” | 同一已认证门户直达原 r6 编辑器第三步；审阅并确认原 publication 后 RETIRED。编辑器的当前发布卡撤下；返回工作台可见“仿真版本已停用，虚拟车辆当前不可接单” |
| 审阅并确认“关闭仿真服务” | `14e452c7ddd0654aaae393b538eaf101` 于 18:55:27.174260Z COMPLETED。网页显示关闭已完成；Worker、viewer、renderer 均 exited，原发布 RETIRED，活动 Run 为零 |

最终空闲 Worker 退出 0，shutdown `graceful=true / ownedProcesses=[] / mutationDrained=true / escalatedToSigkill=false`。观察器未重新启动，viewer/renderer 保留先前退出 0/143；仍保留门户、专用 MQTT/openTCS、登录任务及一个持久 SSH 连接。

**必须保留的运行问题：**此前 18:50 的“停止计算”虽收尽所有进程且无 SIGKILL，但 Worker 退出 1、`graceful=false`。LAB-02 的 `rclpy executor.take_message` 抛出 pybind11 参数转换异常，pair 上报 runtime 非零退出。Docker 事件只有 signal 15；各层 journal 无强杀或剩余进程。仅凭日志不能认定是 SIGTERM 竞态或定位到 ROS 根因，本轮未修复该异常。最后一次空闲服务正常关闭不能替代“运行世界整体正常关闭”验收，原日志保留在 `stopped-runtime-before-closure*`；最终空闲停机另存 `final-runtime-v4*`。

### 最终对账、检查与边界

最终 7 Run / 10 command：相对原 5/7，恰新增去程、返程及一笔普通撤单，无刷新/第二页/部署重复业务。scene 仍 1、revision 仍 6，generation 7→8，release/publication 3→4；环境控制 14→20，依次为准备 Worker、启动观察器、停止未结案计算、结案、准备空闲服务、正常关闭。证据行 29566→29936，回放派生投影 626→1252，均保留原行。`historical-rows-comparison.json` 对部署前备份的所有表逐行比较，原行缺失 0、修改 0，包含原 29566 条运行证据、旧失败及历史发布；未删除或覆盖历史以获得通过结论。

各类检查独立报告，不相加，也不替代实际 SIM：

- 前端最终 Node **279 passed**（v3 276 为此前阶段，定向测试包含在完整运行内）。
- Gateway 最终 **467 passed / 1 skipped**；Windows 跳过 POSIX 权限 fixture，实际 Linux 镜像非 root 应用读取另行通过。包含 5 项新增未结案退役/锁序检查；未在实际 SIM 中故意造成“先退役后无法结案”的死路。
- fleet_lab 完整检查 **275 passed / 1 skipped**；后续启动配置/监督 **19 passed**、remote host HTTP **14 passed**、保留式容器替换 **6 passed**分别记录，不累计成 SIM 用例。
- 正式 Bridge 在已构建镜像内实际重跑 **30 tests，0 errors / 0 failures**，不是仅依据缓存构建层。
- Browser 实测范围为以上列出的固定 r6、快速开发档、LAB-01 单车运动、LAB-02 静止、真实 Gazebo 观察、刷新/双页读取、历史复盘、普通撤单和明确会话收尾。本轮未再做 375/320 全站布局检查，不沿用此前视口结果冒充本轮覆盖。

剩余产品限制：网页尚无新版本可用/一键更新提示，部署后旧页须关闭重开；自定义路线撤单的严格收尾仍需多步会话操作，已提供完整中文引导，尚非单键收尾；嵌入发布页停用后当前卡消失，明确停用结论须返回工作台查看，反馈仍可改善。登录任务已安装且进程退出/重启链实测，**整机重新启动未实测**。LAB-02 运行关闭异常未修复；任意地图、多车并行、所有网络/进程故障组合、实车及生产安全均未验收。

主要文件：`server-ledgers-before.json`、`server-ledgers-deployed.json`、`server-ledgers-before-v4.json`、`server-ledgers-final.json`、`historical-rows-comparison.json`、`outbound-finished.json`、`return-cancel-initial.json`、`return-cancel-settled.json`、`unsupported-recovery-ui.txt`、`authored-closure-guidance-v4.txt`、`session-closed-v4.json`、`retired-v4.json`、`final-stopped-v4.json`、`final-stopped-v4-ui.txt`、`final-stopped-v4.jpg`、`gazebo-outbound-live.jpg`、`replay-closed-event-v3.jpg`、`gateway-v4-full.log`、`frontend-v4-full-node.txt`。维护执行使用 shell；上述正式产品动作均经 Browser 完成，日常操作者不需要独立执行复杂命令。

<a id="shutdown-update-20261115"></a>
## 2026-11-15 后续：ROS 关闭异常修复与网页内更新

本节保留并承接上述 v4 失败，不改写旧结论。root 派发轻量代理实现 ROS、前端及独立只读审计，负责冻结、部署及正式 Browser 操作。所有本轮原始材料位于 `agv-digital-twin/environments/p0-pair/artifacts/shutdown-update-20261115/`；未提交源码、旧容器、原账本与 journal 均保留。

### ROS 根因、部署与两条实际关闭路径

在隔离网络、独立 ROS domain 197 的真实 rclpy 7.1.12 中，把 SIGTERM 精确注入 `take_message` 的消息转换期间：旧处理器抛出 KeyboardInterrupt，复现同型 pybind11 参数转换 RuntimeError、退出 1；候选处理器只置标志，回调完成后退出 0。普通转换异常，以及“已收到关闭信号同时发生普通转换异常”仍退出 1。修复在安全 Python 控制边界处理取消，关闭 rclpy 自带 signal handler；没有按错误字符串吞异常，也没有延长原清理超时。清理 journal 追加源异常、信号及线程退出依据。

Worker 从冻结 `release-source-ros/` 构建，镜像 `agv-p0-pair-worker:shutdown-update-20261115`，ID `sha256:595f85943b08cd5a1236a64b36ae615846401dd497d7499f6a3eceb377f7cf59`。16 个 p0 Python 文件与冻结源码一致。通过既有停机替换流程保留原容器和卷，日常连接任务恢复；专用 MQTT/openTCS 未替换。

| 正式 Browser 路径 | 实际结果 |
|---|---|
| 新生成/确认/发布 r6，release `8286cc07f210108888429fc6c154965e`、publication `4c82d142151852bfca85be64fdc01027`，双车 READY；选择 LAB-02 去高桌 | Run `d1ae6c1ed743d160dfff17bafccfe7c8`、订单 `fleet-3e99231eb97be668de94725c069f69d8`。真实 Gazebo 可见。Nav2 在 20:13:37.487Z 报 Failed to make progress，随后 NAVIGATION_FAILED；未到站，不能记导航成功 |
| 审阅并确认普通撤单，再“停止仿真计算（保留未结案）” | 撤单回执 `f93ea93991eec9246841404c4ac7e885` ACCEPTED、内核 WITHDRAWN。运行世界实际级联关闭：两车 runtime 0、pair 的 Gazebo 0/clock -15/LAB-01 0/LAB-02 0；源异常空，线程均退出，无强杀、残留。Worker 2.439 秒、退出 0、graceful=true |
| 明确结案、准备空闲服务、停用原发布 | control `489afab4bbd407c4040e21a71e4f0694` COMPLETED；Run 原 state=ACCEPTED 保留，sessionClosure=COMPLETED、未到站、activeRunIds=[]。原 publication 退役；准备只启空闲 API，未重放任务 |
| 再生成/确认/发布同 r6，release `dcd69e1ec28a140f16e018fb47433b57`、publication `583b086ad42f11a19c84e8617a18af60` | 两车 READY、stationary=true。本轮不发任务，专门核对运行世界的正常退役路径 |
| 审阅并确认正常停用，随后网页关闭仿真服务 | publication 20:21:20.639488Z RETIRED。运行清理约 3.336 秒、owned 36→0；两车 runtime 0、pair 子进程结果同上，sourceError=null、线程退出、graceful=true，无强杀/残留。两车订单/位置为空、allocated/claimed=[]、TO_BE_IGNORED。后续空闲 Worker 独立关闭，退出 0 |

导航失败发生在第一轮关停前约 79 秒，observer 当时仍在正常读取；没有证据将该导航故障归因于本次关闭补丁。根因仍需另查，未重试发单来掩盖失败。第二轮无任务受理、NAVIGATION_FAILED、abort 或 Traceback；仍保留 LAB-02 初始化时约 2ms 的未来 TF 警告，不宣称完全无 warning。viewer 退出 0、renderer 143 为 SIGTERM；最终三仿真容器均退出，基础 MQTT/openTCS 保持运行。

ROS 检查独立报告：fleet_lab **283 passed / 1 skipped**（Windows 缺 rclpy 的真实 ROS 测试跳过），关闭定向 34 为其子集；上述真实 rclpy 转换探针、两轮实际 SIM 和正式 Browser 关闭是不同证据，不相加，均不代表实车或任意场景安全。主要证据：`baseline-conversion-probe.json`、`candidate-conversion-probe.json`、`deployed-worker-source-verification.json`、`normal-attempt-fault*`、`signal-shutdown-1*`、`normal-retire-ready.json`、`normal-shutdown-2*`、`normal-retired-ui.txt`。

### 网页更新的实际失败与修复依据

已先构建部署 A/B 两份真实镜像并核对健康、非 root 读取和各 40 项 HTTP 资源。v4 首次迁移没有新更新入口，须关闭该来源所有旧页，等待新 Service Worker 激活后重开；实际第一次重开仍是 v4，第二次才进入 A，原过程保留，不称一次刷新即可完成。A 页面版本 `9483b375a5261b429fd356799d478eec89844a5b136790e3e484498aa32ad15c`。

B 部署后 A 编辑器实际显示下载/完整校验提示。临时未保存名称“示例工厂 · 升级保护临时草稿”阻止更新且保留原值。但干净第二页也被“有操作或原请求仍待处理”误阻断；进入地图并查询已停用原发布、进入仿真读取已结案运行后，又被连续 GET 读取误当在途提交阻断。**A→B 此次未通过**，未清理浏览器存储或绕过保护；`dirty-update-blocked*`、`settled-history-update-blocked-ui.txt` 保留失败。

轻量代理据此修复：恢复索引按原身份与真实终态判定，COMPLETED 会话结案与原 Run 的 ACCEPTED 字段分别处理；只有真实业务提交/未决原命令和未保存修改阻断更新，只读轮询不再当作提交。后续部署与 Browser 复验追加如下。

C 已部署后，原请求/GET 误阻断消除，但 C→D 正式点击又发现第二个初始化问题：从未编辑过作业方案的干净页面仍提示“作业方案有未保存修改”。原 `formDirty=true` 表示默认方案尚未保存、不能冻结，错误地被复用为“用户修改需要保护”。因此 **C→D 也未通过**；没有为解除阻断而保存默认方案。`c-default-scenario-update-blocked-ui.txt` 与 `c-dirty-update-blocked-ui.txt` 保留原结果。后续拆分冻结资格与真实编辑保护，并补网页内明确放弃未保存修改的操作。

A/B/C/D 阶段全部部署日志和冻结来源保留。源码校验脚本初版还遇到两个非应用故障：构建依赖锁仅 root 可读，以及 Windows 打包清单 CRLF 与 Linux LF 的原始哈希不同。后续明确保持业务/地图/40 静态资源逐字节比较，清单另比较规范化 JSON 并同时保留两个 raw SHA，构建锁单独只读 uid 0 核对；没有为使检查通过更改生产权限或忽略实际资源差异。C 修正证据脚本及 D 检查均通过，原失败输出仍保留。

E 部署后的实际 Browser 准备检查已通过：不要求有可安装新版，手动“检查更新”即可显示需核对的原发布和“前往核对原发布”，实际点击跨工作区展开原发布区域，未授权时明确要求先验证。验证后读取已停用发布与已结案运行，不再被默认方案或 GET 轮询阻挡。实际修改默认方案名称得到未保存保护和“前往核对原作业方案”，改回原名称后解除保护；没有保存方案。证据为 `e-default-ready-ui.txt`、`e-real-edit-blocked-ui.txt`、`e-reverted-ready-ui.txt`、`e-clean-ready-ui.txt`，E 网页版本 `8726fde981049837be8090481ee2ef94b021f152fdcbf394dfe1b7fe8ca1ec4c`。

F 从冻结 `release-source-f/` 构建并健康部署，镜像 `sha256:a75525ebc42a4105843fc2eb8abe334f955601123a54ef1457551d6c149c8404`。实际容器的 106 个源码/地图/网页文件逐字节一致，清单规范化内容及构建锁一致，40 项 HTTP 资源一致。但 **E→F 双页更新仍未通过**：带临时场景名称的编辑器正确阻止更新，另一干净“运行总览”页却被 LEGACY_PAGE 阻断；当时浏览器仅这两个 E 页面，iframe 的地址也固定 E。保留 `e-dirty-update-blocked-ui.txt`、`e-f-multitab-update-blocked-ui.txt`、`e-f-multitab-update-blocked.jpg`，没有清理缓存或关闭有修改的页面来算作通过。

独立审计发现握手错误比较了 `WindowClient.url` 的创建地址与当前文档版本。新页面最初从不带版本的入口进入，脚本通过 `history.replaceState` 固定版本后，地址栏虽已带版本，Service Worker 取得的创建地址仍可能不带版本。后续修复须验证来自同源已加载更新协议的实际文档答复及该版本完整缓存，并继续拒绝旧协议或无法响应的页面；实际复验接续记录如下。

### G 最终部署、双页升级与网页内放弃修改验收

G 从冻结 `release-source-g/` 构建，源码清单 SHA-256 `301ec903aaa92908b47f23fdfb959b9eef83b16cef7ac5031bf415020aba80b9`；实际 Gateway 镜像 `fleetserver-gateway:shutdown-update-20261115-g`，ID `sha256:f446c834eb32ad84fabe6ddea8183b8b1754096ddfac211d44a2e955a21736a7`。健康检查通过，uid 10001 可读 58 个 Python 文件及全部 40 个网页资源。实际容器 106 个应用/地图/网页文件与冻结来源逐字节一致，清单规范化内容与依赖锁一致；40 个 HTTP 资源哈希一致。部署 ID 和业务配置未切换，ROS Worker 仍为本节前述关闭修复镜像。

G 不再用创建地址上的旧 query 证明当前文档版本。各同源白名单页面通过独立通道证明协议与当前完整版本，仍核对缓存和二次页面集合；未知、无响应、版本不匹配、缺资源各有失败原因。缓存恢复须为顶层恢复页面，安装前后重新核对身份；iframe 只能返回所属页面更新。修复前的真实 updater 联合回归失败日志 `frontend-update-G-creation-url-before.txt` 保留。完整 Node **339 passed**，SW/update/app 定向 **56 passed** 为其子集；独立审计早期 SW/update **39 passed** 也是子集，不累计。打包检查沿用本轮未再修改的 packager **2 passed / 31 deselected**。

正式 Browser 在原 E 双页继续完成以下操作，未清缓存、未关闭带草稿的页面来绕过保护，未从 shell 发业务请求：

| 实际操作 | 核实结果 |
|---|---|
| 原 E 编辑器保留临时名称“示例工厂 · 双页更新保留验收”，检查并点击更新 | 完整下载/校验后可见更新按钮；点击仍明确提示未保存修改，页面保留 E |
| 另一干净 E“运行总览”点击“一键更新此页” | 成功进入 G，网页版本 `b4df3cd1330ce1b095193cbf7209ca6e0cd36e7495bdbe0e74b2f089ce1643b0`；路由仍 `#/operations`。显示“网页已更新完成，原页面位置已保留”，焦点位于版本摘要；旧控制会话清除，显示“启用控制” |
| 返回仍打开的原编辑器页 | 顶层与编辑器仍 E，临时名称未变，撤销可用；实际点击撤销恢复“示例工厂 · 统一仿真”，没有保存新修订 |
| 经“返回地图与发布”关闭已恢复的编辑器，再更新该页 | 成功进入同一 G，保留 `#/simulation`，控制权限同样须重新验证；没有原发布或 Run 重发 |
| G 验证权限、读取原发布及原运行，打开默认作业方案 | 默认“固定双车导航场景”与默认两行任务不再误当用户编辑；未保存默认方案，冻结按钮仍禁用 |
| 修改方案名，手动检查更新并进入“前往核对原作业方案” | 显示真实未保存修改保护；网页入口直接展开原方案，只读核对，没有自动保存 |
| “放弃未保存修改”审阅后取消 | 临时输入“仅本地 · 放弃修改验收”完整保留 |
| 再审阅，然后继续输入“仅本地 · 审阅后又修改” | 输入仍聚焦时，原确认即失效并显示重新审阅提示；修改没有被清除 |
| 重新审阅并明确“确认放弃并恢复原内容” | 恢复默认原名与原两行配置，提示仅放弃本页输入；冻结仍禁用。再次检查更新显示无新版且不再有草稿阻断 |

主要 Browser 证据：`e-g-dirty-blocked-ui.txt`、`e-g-clean-updated-ui.txt`、`e-g-updated.jpg`、`e-g-browser-identity.json`、`e-g-other-tab-retained-ui.txt`、`e-g-second-updated-ui.txt`、`g-discard-cancelled-ui.txt`、`g-discard-stale-review-ui.txt`、`g-discard-confirmed-ui.txt`、`final-g-stopped-ui.txt`、`final-g-stopped.jpg`。最终保留已更新的运行总览页；验收临时修改已撤销或明确放弃，没有遗留未保存草稿。

### 最终账本、运行状态与边界

`server-ledgers-pre-upgrade.json`（ROS 两轮验收之后、网页 A 部署之前）与 `server-ledgers-final.json` 的 **6 个数据库、19 张表集合、行数及逻辑 SHA-256 全部一致**，见 `web-upgrade-ledger-comparison.json`。仍为 **8 个 Run、12 个 command、1 个场景/6 个修订/10 次生成、6 个版本/6 个发布、26 个环境控制记录**；作业方案及执行仍为 0。网页检查、双页切代、权限重验与本地放弃修改未增加任何业务意图。与本轮开始前备份逐行比较，所有原行缺失/改写均为 0，见 `historical-rows-comparison.json`；本轮新增的真实 ROS 验收记录保留。

21:15:29Z 的最终只读状态：原发布 `583b086ad42f11a19c84e8617a18af60` 仍 RETIRED，活动 Run 为零，Worker/viewer/renderer 均 exited、容器身份与关闭证据一致。独立 `final-host-state.json` 核实连接任务 Running、MQTT/openTCS 运行，五个容器的启动/停止时间未变化。网页中 LAB-02 原高桌任务仍显示“仿真故障会话已结案 · 未成功到站”，没有把撤单受理或关闭成功写成到站。

本轮 **ROS 关闭异常和 E→G 网页内更新的限定验收通过**。LAB-02 此次独立导航 `Failed to make progress` 根因尚未解决；整机重启未测，缓存丢失/网络下载失败等更新分支只有离线测试，未人为清缓存作 Browser 验收。没有重复完整多车并行、全站窄屏、任意场景或实车验收。没有更新协议的旧 v4 页面首次迁移仍需保存并关闭该来源旧页后重开；本次迁移过程及失败已保留，不能宣称旧版自身也能一键更新。后续已带更新协议的页面使用网页提示、核对入口与明确更新按钮，日常操作者无需执行 shell；构建与服务器部署仍属维护工作。

<a id="lab02-navigation-20261115"></a>
## 2026-11-15 后续：LAB-02 导航不再前进的定向修复

本轮范围仅为 r6 原场景、快速开发档、LAB-02 从第二车起点到高桌的导航阻断。最短路径先核对旧失败记录，必要时同路线补采一次，再集中修复、统一部署 Worker 并由 root 在 Browser 验收到站、停稳及停用收尾；不重复网页升级、全站检查或全量账本比对。复杂代码由轻量代理实施，root 负责实际操作和部署。新证据统一保存在 `agv-digital-twin/environments/p0-pair/artifacts/lab02-navigation-20261115/`。

### 旧证据与唯一一次基线补采

旧 Run `d1ae6c1ed743d160dfff17bafccfe7c8` 的首段是 R-4：P-5 `(4,5)` → P-2 `(4,2)`。Nav2 请求纯转向，但 Bridge 授权为零；新鲜定位约 `(4.232,5.052)`，真值仍 `(4,5)`。纯旋转时 Bridge 的制动投影位置等于当前估计位置，必然落在原 0.15 m 路线胶囊之外；旧末端速度样本已过期，未拿它证明同刻实际速度。

为核对时序，root 经网页准备服务、生成并确认同 r6/快速档，发布 `e0e566f653544d22311a89259cc897d9`、release `e58ac6e5493da9dca48e7e510c150765`，READY 后仅发一条 LAB-02→高桌任务，Run `61f7d6a764a89ca3210fb7e6b5ebecb8`。只读 ROS 采样器运行 60 秒，逐 topic 保留接收年龄；首次脚本 TF API 与 Jazzy 不兼容，在发单前修正并完成 1 秒探针，没有带着失效采样发单。

`baseline-chain-sample.jsonl` 显示：发单前 TF 与真值相差约 2.1 cm；采样 elapsed 17.0 s 时到原路线距离约 0.126 m，转向获授权。17.5 s 时距离约 0.195 m，Nav2 仍请求 −0.75 rad/s，但 Bridge 已输出零，末端平滑速度依次降至约 −0.45、−0.075，随后停零。真值 XY 仍在起点，最后朝向约 −1.357 rad；定位约 `(4.163,5.071)`，没有碰撞锁存，安全传感器健康。Nav2 于 `23:06:48.654Z` 报进度失败，距 goal 约 32.4 秒，见 `baseline-nav.log`。由此确认定位越界使授权链阻断，不能靠延长进度超时或放宽路线边界解决。

原 `initPosition` 把已知 SIM 起点按 XY 方差 `0.25 m²`（标准差 0.5 m）、yaw 方差 `0.0685 rad²` 发送给 AMCL；实际旋转中的宽定位分布与随后偏移均保留。候选修复仅使该初始化方差可配置、保持通用默认，并为固定 SIM 精确起点设置窄先验；不替换 AMCL 为真值，不修改运动噪声模型、15 cm 边界或 30 秒进度检查。

补采后经网页正常撤单，回执 `d95fb1135e4009102fc4a1a03537bbbe` ACCEPTED；再停止仿真计算、结案、准备空闲接口、停用原发布并关闭服务。`baseline-closed.json` 确认原发布 RETIRED、活动 Run 为零、Worker exited，失败历史和未到站结论保留。后续部署及验收接续如下。

### 集中修复与一次 Worker 部署

Bridge 的 `initPosition` 新增 XY/yaw 初始化方差参数与正有限值校验，通用默认仍为 `0.25 m² / 0.0685 rad²`；固定 SIM 采用 `0.0016 m² / 0.0025 rad²`（XY 标准差 4 cm、yaw 标准差 0.05 rad）。pair 资产同时写入原始 `bridge.yaml` 与 rooted 配置，使场景生成和 Worker materialize 不丢失参数，并保留各自 MQTT 配置。root 在部署前发现生成链需要读原始配置，集中补齐后才冻结。没有修改 AMCL 运动噪声、15 cm 路线边界、30 秒进度检查、openTCS 内核或门户。

针对 pair 资产、场景编译和 Worker materialize 的 **3 项 pytest 通过**；镜像内实际 Bridge 编译及 **30 项包检查通过，0 失败/错误/跳过**，分别记录于 `targeted-pytest.log`、`worker-build.log`，不与实际 Browser/SIM 相加。冻结源码只构建、部署一次：`agv-p0-pair-worker:lab02-navigation-20261115`（同指向 local），镜像 `sha256:a79f6a902fb6e4593cef2a1bfb58935d1d83edd4409e807753bf9fb0917a0c35`。4 个改动运行文件与冻结源码哈希全部一致，见 `changed-source-verification.json`。原容器及卷保留；门户 G 版本未重新部署，也未重复全量回归或账本比对。

### 修复后的实际 Browser/SIM 结果

root 经网页准备服务，对同 r6/快速档重新生成、确认并发布：release `f5bc3163c76c8ec12c30ce72563c442c`，publication `93de9d93c02fa64b1d92b963d9857c5b`。READY 后实际启动文件中的两车方差均为上述 SIM 值、路线边界仍为 0.15 m，见 `candidate-loaded-config.json`。网页只提交一条 LAB-02→高桌任务：Run `7c52611a4360586d96d70b898e5752cd`，发单回执 `63203bb6f1454907bab8efdec78bc869` ACCEPTED，内核订单 `fleet-4a8218debac16755745a2c7e1f9655b6`。

该任务于 `23:19:21.164Z` 创建，按 R-4→R-2→R-3 完成，到达 S-3/P-4；内核 `23:20:48.038Z` FINISHED。网页实际显示“到站与持续停稳已核实”“已到站并停稳”。封存观察确认 `orderFinished/atDestination/noActiveOrder/stationary/confirmed/settled` 均为 true；`23:20:48.738Z` 至 `23:20:50.897Z` 有 **3 次连续停稳观测**，odom vx/wz 均为零。同期新鲜 Gazebo 真值 `(8.98558, 1.98936)`、yaw `0.00222`，目标 `(9,2)`，平面误差约 **1.79 cm**；AMCL/Bridge 估计约 `(8.98403,1.99465)`，二者分别保留，未混用。见 `candidate-finished.json`、`candidate-arrived-ui.txt`、`candidate-arrived-clear.jpg`。

资源读回单独记录：收尾瞬间分配为 `P-4/R-3/S-3`，claimed 为空，共享块 `SCENE-TRAFFIC` owners 为空；没有把空 owner 扩大为全程无冲突证明，也没有把到站冒称全部资源已释放。此次只验证单条 LAB-02 路线，没有重复多车并行验收。

`candidate-chain-sample.jsonl` 的 240 个样本另由轻量代理只读分析，结果见 `candidate-diagnosis.json`：起始旋转 2.75 秒内，11 个非零角速度样本均获 Bridge 授权，真值朝向由约 0 转至 −1.558 rad，XY 只变化约 1.8 mm；随后授权直行 vx=0.15 m/s。R-4 真值沿 Y 前进约 2.95 m，TF 横向偏差最大约 2.18 cm，未再出现原先定位跨出 15 cm 边界而截断转向的现象。R-4 统计在真值首次到达 y≤2.05 m 时结束，后续东向路段不按 R-4 边界评分；AMCL 与真值最大平面偏差约 12.27 cm，主要沿路线方向，未把定位描述为全程精确。

root 随后从网页“查看并停用当前发布”审阅并确认停用，再“关闭仿真服务”审阅并确认关闭。页面显示“当前版本已停用”和“仿真服务已关闭，不占用仿真 CPU”；`candidate-closed.json` 确认 publication RETIRED、活动 Run 为零、成功 Run 仍 FINISHED，Worker exited、观察器未运行。独立容器证据 `final-host-state.json` / `final-render-state.json` 确认 Worker 于 `23:22:57.102Z` 退出，viewer/renderer 本轮未启动（created）；连接任务仍 Running。首次只读容器盘点误用 renderer 简称，另按已部署容器 ID 补存正确状态，未因此重启服务或覆盖原证据。

本轮 **一次基线复现、一次集中修复部署、一次同路线成功验收**；所有发布、发单、退役和关闭均由 root 在网页完成，操作者无需 shell。结论仅覆盖固定 r6 快速开发档的此条 LAB-02 导航；未验证重复随机定位、其他路线、多车并行、实车或生产安全，旧失败记录保留。

<a id="web-video-20261118"></a>
## 2026-11-18 工作台实景视频

最短路径为“准备服务 → 发布 r6 → 从工作台打开实景 → 看见画面且持续解码 → 关闭画面 → 停用发布并关闭服务”。沿用上一轮已验的导航结果，本轮全程观察同一个世界。证据在 `agv-digital-twin/environments/p0-pair/artifacts/web-video-20261118/`。

root 从已关闭环境进入旧门户 G，经正常授权、生成和确认，发布 `cb825a6d8795d6efc22e5f29e83234ac`（release `f126cc51c26d59b8cc5bce30ae7b182d`）。可用版本明确 READY，活动 Run 为空。旧按钮能打开画面，但手机宽度附近的工作台在画面外提示去“右侧”调度，视野内有只读的 Gazebo 菜单和模型树。READY 后唯一返回工作台的链接只说下达任务。截图 `old-screen.jpg` 与 `old-viewer.json` 保留。root 经网页明确关闭旧观察器，保留同一发布供替换后对比。

该运行世界的 Gazebo topic 提供场景信息，当时未发现全景相机 image topic。此处选用固定相机在仿真主机按需渲染、FFmpeg 编码 H.264，同时通过现有鉴权 HTTPS 入口分发 HLS。网页只接收媒体，调度生命周期仍走原网关。浏览器端需要自由视角或三维对象选择时可采用 Gazebo 的 WebGL 方案。此处的操作需求是观察固定全景，且已有认证、代理和 HTTP 连接。协议与播放依据见 [Apple HLS](https://developer.apple.com/streaming/)、[hls.js 项目](https://github.com/video-dev/hls.js) 和 [Gazebo Web Visualization](https://gazebosim.org/docs/latest/web_visualization/)。

**部署。** 用户端浏览器支持时使用原生 HLS，其余支持 MSE 的浏览器使用镜像内固定的 hls.js。新 renderer 只读订阅现有世界，使用私有 Xvfb，等待两个模型和画面细节，再启动单个 FFmpeg 编码器。分片保存在有大小上限的 tmpfs，Web 容器只读挂载，通过 Uvicorn/Starlette 分发。世界心跳与完整分片均新鲜时 `/healthz` 才返回 200。浏览器每次读取播放列表或分片均经同源代理鉴权。服务状态与实际显示首帧各有反馈。用户主动开启时定位到画面，浏览器阻止自动播放时可在播放器内点击播放。

前端与网关、侧车配置分别有 50、90、4 项定向检查通过。另在隔离容器实际编码并用 FFprobe 核对 H.264，检查只读 HTTP 路由、世界心跳丢失、编码暂停后拒绝旧分片。原容器与历史保留，冻结后统一切换一次 Gateway 和两个观察侧车；沿用正在运行的同一 Worker。Gateway 镜像 `sha256:aeb07a9ae93f0790eb82e3469f1f19ed198c9c3032033423afa40cef27bf1101`，观察器镜像 `sha256:a787d2488865c9105f65d648da8498b910fb860b41aa1d8709c7ba297f707e30`。详见 `sidecars-install.jsonl` 与 `gateway-install.log`。

**实际 Browser。** 原网页 G 点击检查及“一键更新此页”，新页面版本为 `125d509b`，重新验证操作员权限。从工作台点击一次“打开 Gazebo 实景”，先显示“正在启动视频，等待首帧”，随后进入原页只读直播。同一发布内，播放器读取到直接 HTTPS 媒体源、960 × 800、readyState=4、paused=false。跨 18.258 秒的两次观测中，媒体时间从 11.1634 秒前进到 29.251 秒。两次观测不用于推算端到端延迟。匿名读取 HLS 列表为 403，经门户授权的列表与 TS 分片均为 200；抽样分片 83,284 字节。见 `browser-playback.json`、`media-delivery.json` 和 `live-player.jpg`。本次录得原生播放路径；hls.js 的 MSE 分支和禁止自动播放的策略分支未在另一种实际浏览器上验收。

**实际收场。** 经网页确认“关闭 3D 画面”后，播放器已卸载，原场景仍就绪。经“查看并停用当前发布”退役，再确认关闭服务。最终原发布 RETIRED，活动 Run 为零，Worker、renderer、视频服务均 exited；openTCS、MQTT 仍运行。见 `closed-ui.txt`、`closed.json`、`closed-host.txt`。本轮未发导航任务。新截图中模型树已消失，顶部仍留一条 Gazebo 标题色带，记录为视觉瑕疵。验收范围为固定隔离场景的单客户端观察流程。

<a id="overview-modes-20261118"></a>
### 2026-11-18 运行总览的二维动态、并排直播与地面叠图

旧页从仿真工作台切到运行总览时会卸载播放器。新页从“运行地图”即可选择三种模式并明确打开、关闭直播。固定 r6 快速档发布 `3b33c0169817ab8a31ad32f41461c946`，release `b2f3c7e637737caa68dbdd83fab831ea`。旧页经“一键更新此页”升级到 `669c3d72` 并重新验证权限。一次部署更新网关和两个观察侧车，复用已准备的 Worker 和同一世界。网关镜像 `sha256:f69d878f1bdb69247009fc7d5730672f9fd8820a4ae88c3ad0d4e9140a40e9b5`，观察侧车镜像 `sha256:d86ba66879575671b3801da9fb5555df4c6962e1902843091c2f52d6fb95c9ba`。

**定向检查。** 门户的模式与环境控制组 43 项、位姿与运行界面组 59 项通过，两组有重叠。网关发布组 63 项、视频配准组 7 项通过。在隔离服务上核对会话不匹配、心跳失效与过期媒体的处理。部署后匿名读取配准资料返回 403，当前操作员读取返回 200。

**实际 SIM。** 从实际 Gazebo 相机取得俯视画面和投影，输出 960 × 800 的 H.264/HLS。用已知场景地标独立核验编码画面中的两个地板角、一个边界交点和两个待料垫角。地面坐标最大偏差 0.0089 米，约一个取样像素。该值描述本次场景地面投影；离地物体存在视差，视频有缓冲，与最新车辆定位存在时间差。

**实际 Browser。** 总览初始二维就能看到两车。从“地图旁直播”打开一次直播，桌面地图与视频分别在相邻列播放。切到“地图配准叠图”，放大并恢复地图，待料垫中心与 P-1 在两档缩放下分别相差 0.13、0.17 个 CSS 像素。操作员仅下达一趟 LAB-02 从 P-5 到高桌的任务 `52a2461b46293e3fb1949539b2767998`。同一运行中依次从二维、并排和叠图读到标记坐标 (3.98, 3.62)、(4.00, 3.49)、(4.01, 2.21) 米，叠图继续前进至 (6.47, 2.01)，最终回到二维读到 (8.98, 2.00)。主标记来源为 Fleet Bridge 地图定位估计；当前场景未对齐坐标系的独立真值标记有隐藏提示。订单和运行均 FINISHED，确认到站，连续停稳 3 个源采样。

**收场。** 在总览确认关闭直播后，仍可见 LAB-02，按钮恢复为“打开直播”。经网页停用发布并关闭仿真服务。发布 RETIRED、活动任务 0，Worker、渲染器及视频服务均退出，网关健康，openTCS 与 MQTT 在线。退役后的叠图模式提示“请先准备仿真服务”，提供工作台入口。桌面截图中网页升级提示曾再次展开，覆盖了地图右下角的一小部分，可手动收起。范围为固定隔离仿真单浏览器，本轮未做实车或多客户端验收。

证据目录为 `agv-digital-twin/environments/p0-pair/artifacts/overview-modes-20261118/`。坐标和投影见 `probe-landmarks.json`、`browser-ground-check.json`、`browser-lab02-motion.json` 与 `deployed-observation.json`。截图见 `overview-side-desktop.png`、`overview-overlay-run.png` 和 `overview-map-moving.png`。任务和服务状态见 `run-final.json`、`closed.json` 和 `closed-host.txt`。

<a id="portal-access-20261118"></a>
### 2026-11-18 隔离仿真访客直播与浏览器操作员登录

旧页 `669c3d72` 的已验证标签正在播放，同一浏览器新开的标签仍提示“启用控制后可读取当前环境和直播状态”，并隐藏车位。用户确定访客可看实时位置与已开启的直播，并授权结案原有故障会话后重开一次直播验收。

**原现场。** 两条未决任务为 LAB-01 `f0eade5413ae544615fad1210122a3f8` 和 LAB-02 `e5c34ba6592aff6ed518507d0c15f095`。经网页审阅停止旧仿真计算，首次结案返回 `SIM_CLOSURE_CANCEL_REQUIRED`。从运行历史选中 LAB-02 原订单，提交正常撤单并取得 ACCEPTED 回执。再次审阅结案成功，两条失败记录保留。准备空闲服务后退役原发布 `34fbc60d63dbe52414923fc60e4b66e5`。原场景最新 r9 在墙体净空校验处未通过，验收改用网页创建的独立示例副本“访客直播验收 · 2026-11-18”，保留 r9 和已经冻结的 r8 版本。

**实际 Browser 与 SIM。** 副本 r1 发布 `be4de1afe7601b841d124efa493df11e` 就绪后，访客看到了两车的 Fleet Bridge 定位。直播尚未开启时，访客页提示“当前没有可播放的直播”。由操作员打开直播后，访客并排画面实际播放 960 × 800 视频，媒体 readyState 4、paused=false。切换配准叠图后，网页确认当前画面已按地面对齐。独立无 Cookie、无密钥的客户端读取车位、配准资料、播放列表和一个 81,404 字节的媒体分片均获 200，受保护的完整环境和发布状态接口返回 401。整个副本验收无新导航任务。

**操作员会话。** 在 `ce526f19` 输入一次密钥，刷新、新标签页、打开内嵌场景编辑器均恢复操作员身份。首次上线后实测访客仍收到“需处理”的未登录告警，旧共享发布记录也会卡住访客更新。修复提示与更新阻断规则后只替换门户网关；从页面一键升级至最终版本 `618023f3`，网关重启前的登录继续有效。点击退出后，两个已打开的门户均恢复访客身份，仍能看已开启的直播。最终网关镜像 `sha256:5fb4e7c513a4e7ce161de2e0f1d0eec9066e2c036e5207ad83c8ad671b4ae17d`。

**定向检查与收场。** 网关会话相关 28 项、访客与相关服务 86 项、访客前端 50 项，以及访客提示与更新相关 141 项检查通过，各组有重叠。8 小时绝对过期、密钥失效和只读访客的更新规则由自动化检查覆盖。实际网页关闭直播后访客播放器退出，车位继续更新；停用发布并关闭仿真服务后，活动任务为零，Worker 和两个观察器均已退出。本次范围为固定远端隔离仿真。证据目录为 `agv-digital-twin/environments/p0-pair/artifacts/portal-access-20261118/`，含 `guest-live.json`、`guest-live-final.png`、`restored-editor.txt`、`upgrade-session.txt`、`closure-attempt.json`、`final.json` 与 `closed-host.txt`。


<a id="r9-controls-20261118"></a>

## 2026-11-18 原场景 r9 墙体净空与运行中任务恢复

固定隔离双车仿真。场景编辑、发布、任务控制、复位、重新发布、访客播放及收场均通过已部署门户操作。原场景“示例工厂 · 统一仿真”的 ID 为 `4fe15f02a02e40778cd1f498c845b083`。以下两次发布均来自该场景的 r10。

| 网页操作 | 实际结果 |
| --- | --- |
| 在 r9 画布检查净空，选择冲突的路线和点 | P-6 及接入它的 R-5、R-6 在同一位置靠近南侧横墙。墙中心线 y=0.400 m、厚 0.150 m，内边缘 y=0.475 m。旧点 (5.7, 0.8) 距墙面 0.325 m，所需净空须大于 0.511085 m。画布高亮所选几何、墙体与最近点。 |
| 在画布选中 P-6，校正位置，应用、重检、保存 | P-6 改为 (5.7, 1.1)，净空增至 0.625 m，三项冲突同时消失。比对 r9、r10，场景内容只改了 P-6.y。正式生成并发布 `1c224d4bb681318ec048c8cac991d324` 就绪。 |
| LAB-01 选 LAB-02 所在的第二车停车位 | 页面说明 LAB-02 正占用或预留目的站，禁用执行。随后改选空闲的高桌工位，运行 `e48670736f1c0a8ed05d2cbd1d14be85` 开始移动。 |
| 运行中暂停，再继续原任务 | 原订单仍为执行中；车端确认暂停、速度归零，观察到 15 个不同源采样。继续后同一订单实际恢复运动。 |
| 运行中即时撤单并停车 | 原订单进入 FAILED，车端 cancelOrder 完成，车端路线已清空，17 个不同源采样确认停稳。车停在节点之间，调度路权仍占用。网页分别呈现这些结果并提供强制复位。单任务即时撤单要求另一车空闲、无其他未结订单。 |
| 审阅并确认强制复位，再准备服务、生成并发布同一 r10 | 复位回执 `1c6912a317c0915310b645599b2ead9b` 达到 VERIFIED_IDLE。两车分配与申请资源均为零，前次发布已停用，失败运行记录保留。再次发布 `6d3d1ce75a8c812f69d1567798c287c1` 就绪。 |
| 开启直播，以访客进入运行总览 | 原场景的地图显示两台车的 Fleet Bridge 定位。并排模式播放 960 × 800 实时视频，配准叠图模式显示地面对齐。独立无 Cookie、无密钥读取返回两个车位和 83,284 字节的 HLS 媒体分片。 |
| 在重新部署的原场景执行新任务，完成后收场 | LAB-01 从待料起点到高桌工位，运行 `68f6b682c47ac9cab45a1aa74b7d5064` 和内核订单均为 FINISHED。车辆到达 P-4，源速度为零，6 个采样确认持续停稳，无活动订单。随后在网页关闭直播、停用当前发布并关闭仿真服务。活动任务为零，Worker 和两个观察器容器均已退出。 |

**部署与范围。** 几何诊断、运行控制和复位集中部署；实操发现成功撤单后仍显示过时的手动收尾提示，随后定向修正文案并更新门户。最终门户版本 `16f73da3`，网关镜像 `sha256:aec96aedf05ab3dcfcef7398509bbece90d0d6282313f3997370b40cc45b993e`。前后端定向检查通过。上述实操覆盖固定双车隔离仿真和默认工况验收速度档，实车未测。

**原始证据。** [本轮验收目录](../../agv-digital-twin/environments/p0-pair/artifacts/r9-controls-20261118/) 包含 `prior-rejection.json`、`original-r9.json`、`original-r10.json`、`r9-route-wall.png`、`pause-first.json`、`resumed.json`、`cancel-check.json`、`reset-complete.json`、`redeployed.json`、`visitor-overlay.png`、`final-guest.json`、`after-reset-arrived.json`、`closed.json` 和 `closed-host.txt`。

<a id="r13-generator-20261118"></a>

## 2026-11-18 原场景 r13 生成服务关闭时的误报与恢复

原场景 r13 的 6 个点、6 段路线对墙体和障碍的净空检查均通过。12:07 至 12:09（纽约时间）r10、r11、r12、r13 四次生成均记录为 UNKNOWN。Worker 容器自 03:08 后处于退出状态，远程网关通过原连接读取 Worker 也收到对端断开的错误。旧版编辑器把未知结果中的一般错误显示为“路网未通过生成检查”，操作员由此误以为需要改图。

部署门户 `b6ca39be` 后，在原 r13、工况验收档、服务关闭条件下点击“生成地图与仿真”，界面报告生成服务暂不可用。点击“前往仿真工作台”并准备服务，返回同一场景后点击“重试原生成”。网页生成请求 `e3b111ab00db9d0094ba4fd5eafd2989` 由 UNAVAILABLE 转为 READY 并显示地图预览。另用用户原请求 `9a97201167c835e6024c0330dacb8f5b` 的原参数重试，该记录也转为 READY。两次均使用相同修订、场景摘要和档位。通过网页关闭临时服务后，重开编辑器仍能读取已生成的预览。期间没有修改场景、发布版本或派车。

前端生成面板 20 项、网关生成及主机代理相关 42 项定向检查通过。最终网关镜像 `sha256:e0d84165d1c285966fc0acee996139a7b65ff88795a661871442356659457b32`。取证目录含失败原记录、净空结果、恢复前后截图、原请求结果和三个容器的收场状态。[r13 生成恢复证据](../../agv-digital-twin/environments/p0-pair/artifacts/current-r13-road-check/)
