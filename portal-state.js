(function (root) {
  const routes = ["operations", "missions", "maps", "fleet", "simulation", "events"];
  function route(hash) {
    const value = String(hash || "").split("?")[0].replace(/^#\/?/, "").replace(/\/$/, "");
    return routes.includes(value) ? value : "operations";
  }
  function unresolved(snapshot) {
    return (snapshot?.records || []).filter((record) =>
      ["create_order", "create_transport_order"].includes(record.envelope?.command?.type) &&
      !["ACCEPTED", "REJECTED"].includes(record.status),
    );
  }
  function attention(state) {
    const items = [];
    if (state.bootError) items.push({ kind: "error", text: "服务加载失败：" + state.bootError, route: "events" });
    if (!state.received) items.push({ text: "尚未收到车队状态；不能判断车辆是否可用。", route: "fleet" });
    else if (!state.connected) items.push({ kind: "error", text: "车队反馈中断或上游过期，显示的是最后报告状态。", route: "fleet" });
    if (!state.modelFresh) items.push({ text: state.modelError ? "模型读取失败：" + state.modelError : "模型尚未取得新鲜读回，发单受阻。", route: "maps" });
    if (state.modelFresh && !state.stationCount) items.push({ text: "运行模型无站点；草稿保存不等于发布，当前没有可调度目的站。", route: "maps" });
    for (const record of unresolved(state.snapshot)) items.push({ kind: "error", text: "未决导航请求 " + record.envelope.requestId + "；先查询原回执，禁止新建重复意图。", route: "events" });
    if (state.snapshot?.storageError) items.push({ kind: "error", text: "请求账本不可用：" + state.snapshot.storageError, route: "events" });
    for (const robot of state.robots || []) if (!robot.online || robot.stale) items.push({ text: "车辆 " + robot.id + " 离线或反馈过期；不是可接单证明。", route: "fleet" });
    return items;
  }
  function publicationBlock(state) {
    if (state.pending && !state.pendingResolved) return "有待恢复的隔离仿真发布请求；请先查询原发布记录。";
    const publication=state.activePublication;
    if(publication && !["REJECTED","READY"].includes(publication.status)) return "隔离仿真发布尚未确认就绪，导航请求受阻。请到地图与发布核对。";
    if(state.status?.enabled && !state.statusFresh) return "隔离仿真发布状态已不可用，请重新读取版本与准入。";
    if(state.status?.enabled && state.status.currentAdmission?.ready!==true) return "隔离仿真当前准入未通过。请到地图与发布查看实时阻断原因。";
    return "";
  }
  const api = { routes, route, unresolved, attention, publicationBlock };
  root.PortalState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
