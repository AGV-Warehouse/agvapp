# AGV APP

独立前端仓库，只负责状态展示和用户交互。所有状态来自 Fleetserver，所有管理意图通过 `/api/v1/commands`；没有 MQTT、ROS、路径调度、LLM 调用或服务器策略代码。

- `app.js`：页面状态和用户交互。
- `fleet-api.js`：有版本号、requestId、期限的管理消息；保留不确定请求，避免重复意图。
- `sw.js`：仅缓存静态资源，不缓存 API/SSE。
- [接口合同](docs/ros-bridge-contract.md)。

发布时可以由同源入口部署静态 APP 与 Server，也可以把本仓库的 7 个静态文件打包进 Host：在独立 `Fleetserver` 仓库运行 `python tools/package_web.py ../agvapp`。这不合并源码或 Git 仓库。APP 不能通过直接打开本地 index.html 使用。

界面输入控制密钥，密钥仅保存在内存。暂停/取消的 HTTP 接受不是车辆停止确认；UNKNOWN 结果需要查询并对账。网页手动驾驶保持禁用。

```bash
node --test tests/fleet-api.test.cjs
```
