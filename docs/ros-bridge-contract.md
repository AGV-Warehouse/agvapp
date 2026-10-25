# APP 消费的 Fleetserver 合同

尽管沿用了历史文件名，APP 不直接连接 ROS。固定使用同源 `/api/v1`。

- GET layout / robots / capabilities：显示配置与真实状态。
- GET events：SSE 命名事件 `fleet`，完整快照；错误或超过 10 秒没有有效事件则禁用依赖新鲜状态的操作。
- POST commands：唯一写入口。
- GET commands/{requestId}：凭据认证后的持久化回执查询。
- GET orders/{orderId}：实际 openTCS 运输单状态。

命令模板：

```json
{
  "protocolVersion":"1.0",
  "requestId":"unique-intent-id",
  "issuedAt":"2026-10-25T12:00:00Z",
  "expiresAt":"2026-10-25T12:01:00Z",
  "command":{"type":"create_order","robotId":"AGV-01","destination":"B"}
}
```

其余 command 类型为 pause / resume（robotId）、cancel_order（orderId）。新意图使用当前时间；重试复用整个原 JSON。Key 只放 X-Fleet-Key header，不放 URL；跨域写操作拒绝。批量暂停由客户端逐车调用，每台保留独立回执，不承诺原子批量操作。

回执必须读取 status：ACCEPTED 是上游接受请求；REJECTED 是确定拒绝；DISPATCHING/UNKNOWN 需查询和对账。不能因 HTTP 200/202 就认为车辆已经到站或停止。用户改变目的地时若仍存在不确定意图，界面阻止自动生成替代请求。

battery / velocity 可以为 null。online 取决于 openTCS driver 的报告，并非 APP 自行探测；snapshot age 也不是机器人健康证明。坐标单位 m，页面只换算显示百分比。

协议权威来源在独立 Fleetserver 仓库：`contracts/management-command.v1.schema.json`、`contracts/management-receipt.v1.schema.json`、`docs/PROTOCOL.zh-CN.md`。运行时可查询 `/api/v1/schema` 和 `/openapi.json`；不从 Server 仓库 import Python 代码。
