# AGV APP

独立前端仓库，只负责状态展示和用户交互。所有状态来自 Fleetserver，所有管理意图通过 `/api/v1/commands`；没有 MQTT、ROS、路径调度、LLM 调用或服务器策略代码。

- `app.js`：页面状态和用户交互。
- `fleet-api.js`：有版本号、requestId、期限的管理消息；保留不确定请求，避免重复意图。
- `sw.js`：仅缓存静态资源，不缓存 API/SSE。
- 界面采用地图工作台、车辆列表/属性、订单表与会话活动记录；手机和平板自动调整布局。
- `/api/v1/model` 提供真实 openTCS 路网（米）；空内核显示空模型，不渲染示意仓库。
- 地图支持平移/缩放/图层开关、点/路径/站点/车辆选择。显示路网不会自动授权路线。
- [接口合同](docs/ros-bridge-contract.md)。

发布时可以由同源入口部署静态 APP 与 Server，也可以把本仓库的 7 个静态文件打包进 Host：在独立 `Fleetserver` 仓库运行 `python tools/package_web.py ../agvapp`。这不合并源码或 Git 仓库。APP 不能通过直接打开本地 index.html 使用。

通过 Control access 输入控制密钥，使用只读回执查询验证身份；密钥仅保存在内存。
只可向同时存在于允许目的站配置和实际模型的站点发单。暂停/取消的 HTTP 接受不是
车辆停止确认；UNKNOWN 结果保留原 requestId，需要查询并对账。未实现的手动驾驶
入口已移除。静态资源采用网络优先缓存，断网后状态会失效，不能离线下发命令。

```bash
node --test tests/fleet-api.test.cjs
```
