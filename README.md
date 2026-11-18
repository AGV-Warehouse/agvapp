# AGV APP

独立前端仓库，只负责状态展示和用户交互。所有状态来自 Fleetserver，车辆管理命令通过 `/api/v1/commands`，地图草稿与隔离发布使用各自的受控接口；没有 MQTT、ROS、路径调度、LLM 调用或服务器策略代码。

- `app.js`：页面状态和用户交互。
- `fleet-api.js`：有版本号、requestId、期限的管理消息；保留不确定请求，避免重复意图。
- `portal-state.js`：六工作区导航、来源/就绪原因的纯状态映射。
- `command-receipts.js`：本浏览器请求索引、服务端回执及关联订单的只读查询界面。
- `map-release-ui.js`：现地图编辑器上的隔离 SIM 草稿选择、NPI 资料、冻结、发布回读及停用界面；状态来自专用后端，不承担调度或车端就绪判定。
- `simulation-run-ui.js`：固定单车/固定双车正式 SIM 运行、原身份恢复、正常撤单与 RTS 只读资源/运动投影；使用既有命令信封和回执账本，运行事实来自后端。
- `sw.js`：仅缓存静态资源，不缓存 API/SSE。
- 界面采用地图工作台、车辆列表/属性、订单表与会话活动记录；手机和平板自动调整布局。
- `/api/v1/model` 提供真实 openTCS 路网（米）；空内核显示空模型，不渲染示意仓库。
- 地图支持平移/缩放/图层开关、点/路径/站点/车辆选择。显示路网不会自动授权路线。
- [接口合同](docs/ros-bridge-contract.md)。

发布时可以由同源入口部署静态 APP 与 Server，也可以把本仓库声明的静态文件打包进 Host：在独立 `Fleetserver` 仓库运行 `python tools/package_web.py ../agvapp`。这不合并源码或 Git 仓库。APP 不能通过直接打开本地 index.html 使用。

通过 Control access 输入控制密钥，使用只读回执查询验证身份；密钥仅保存在内存。
只可向同时存在于允许目的站配置和实际模型的站点发单。暂停/取消的 HTTP 接受不是
车辆停止确认；UNKNOWN 结果保留原 requestId，需要查询并对账。未实现的手动驾驶
入口已移除。静态资源采用网络优先缓存，断网后状态会失效，不能离线下发命令。

P0-1 已增加同一 shell 的六个 hash 入口：`#/operations`、`#/missions`、`#/maps`、`#/fleet`、`#/simulation`、`#/events`。地图编辑器和 `/twin/` 仍为独立真实入口。P0-2 发布界面只支持服务端显式配置的隔离 SIM；P0-3 已接首个固定单车正式运行、恢复、正常撤单及 RTS 投影，实际范围见 [P0-3 验收记录](docs/P0-3_ACCEPTANCE.zh-CN.md)。固定 pair 的共享区等待/交接、TF/READY、普通撤单与同进程 MQTT 观察恢复、operator-only 已停稳故障任务收尾及显式新 SIM 会话导航已完成限定 Browser/ROS 复验，见 [pair 验收记录](docs/P0-3_PAIR_ACCEPTANCE.zh-CN.md)；通用多车场景、回放和高级搬运仍未完成。正常撤单已下发动作可能继续，任务回执、实际停稳及成功到站分别核对。

地图发布接口为 `/api/v1/sim-publishing`，独立于常规四类管理命令；固定 pair SIM 额外的 `finish_stopped_run` 仅限操作员明确审阅后结束已停稳故障任务，沿用命令账本和服务端门控，不清故障或自动重放。界面在发布副作用前保存 requestId，刷新只查询原请求；UNKNOWN/部分失败不自动重放或回退。实时 `currentAdmission` 与历史发布 READY 分开显示。停用/换版由用户明确操作，后端核对停稳与订单。协议、唯一环境和范围见 [SIM 发布协议](../Fleetserver/docs/SIM_PUBLICATION.zh-CN.md) 与 [P0 SIM 环境](../agv-digital-twin/environments/p0-sim/README.md)。代码/Node 测试不代替真实浏览器与 ROS 执行验收。

固定隔离 SIM 的访客可在“运行总览”查看实时车位及已开启的直播。开启或关闭直播、下发任务等操作需要操作员登录。正式同源 HTTPS 门户一次登录有效 8 小时，刷新、更新、同浏览器新标签页及嵌入编辑器均可恢复有效会话。退出会撤销该浏览器的操作员会话。原始密钥不写入浏览器存储。

命令提交支持可信 HTTPS 或 localhost 来源，并要求 Web Locks 与可用浏览器存储。原始请求信封在副作用前保存为当前 API 目标的本地索引，刷新后只查询原回执和关联订单。旧版网关和本机 HTTP 开发连接沿用当前页内存密钥。缺 Web Locks 的来源只允许认证后的 GET 查询，结果仅在本页内存，不写共享索引且不提交命令。普通 HTTP LAN 地址不属于写入支持范围。

实现与验证范围见 [P0-1 验收记录](docs/P0-1_ACCEPTANCE.zh-CN.md)。本轮代码/离线测试、夹具与静态打包检查不等于真实浏览器验收或生产部署。

```bash
node --test tests/*.test.cjs
```

`editor.html` 提供独立的草稿地图工作区：原始 ROS YAML + PGM/PNG 导入、正确的 origin/yaw 米制叠图、点/直线路径/NOP 站点/交通块编辑、撤销/重做、版本保存、结构校验和便携 bundle / openTCS REST JSON 导出。工作区 API 为 `/api/v1/map-workspace`，要求 operator key，保存不会发布到在线内核。导出的 JSON 是新拓扑，不包含车辆、包络和驱动属性，不能直接覆盖运行模型。通用地图分发与 REAL 发布仍不支持；当前隔离 SIM 切片的范围见上述发布协议。

Host 默认随附的 ROS 栅格底图通过只读 `/api/v1/map-background` 免登录显示在首页及 Map editor；实时调度路网仍来自 openTCS。连接 operator 后自动恢复该地图已保存的默认草稿。其他上传地图/保存草稿保持受保护。
