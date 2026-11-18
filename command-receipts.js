(function (root) {
  function mount(container, api) {
    if (!container) throw Error("Receipt container required");
    const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    const commands={create_order:"创建导航任务",pause:"暂停",resume:"恢复",cancel_order:"撤回订单",finish_stopped_run:"结束已停稳的故障任务",server_lookup:"服务端查询"};
    const statuses={PREPARED:"已保存，发送结果待核对",DISPATCHING:"处理中",UNKNOWN:"结果不确定",ACCEPTED:"请求已受理",REJECTED:"请求已拒绝"};
    let message = "", working = false, queryText = "", filterText = "";
    async function query(id) {
      working = true; message = "正在查询原始回执（仅 GET，不重新提交）"; render();
      try { await api.queryReceipt(id); message = "回执已刷新。受理或内核订单完成不等于物理停稳。"; }
      catch (error) { message = `${error.code || "ERROR"}: ${error.message}${error.requestId ? "；请求 ID=" + error.requestId : ""}`; }
      finally { working = false; render(); }
    }
    function render() {
      const focused = document.activeElement?.name === "requestId" && container.contains?.(document.activeElement);
      const state = api.receiptSnapshot(); container.replaceChildren();
      container.append(el("h2", "任务与操作记录"), el("p", "本浏览器与当前 API 目标的请求索引，不是全站审计。恢复或查询不会重新提交命令。"));
      if (state.storageError) container.append(el("p", state.storageError));
      if (state.writeBlockedReason) container.append(el("p", state.writeBlockedReason));
      if (!state.authorized) container.append(el("p", "操作员登录后可查询回执。发单还需满足车队与连接条件。"));
      if (state.queryPersistence === false) container.append(el("p", "当前来源仅能只读查询；查询结果只保留在本页内存，不写共享存储。请用受支持的 HTTPS 或 localhost 来源保证恢复。"));
      const form = el("form"), label = el("label", "原始请求 ID"), input = el("input"), button = el("button", "查询服务端回执");
      input.name = "requestId"; input.value = queryText; input.oninput = () => { queryText = input.value; };
      input.required = true; input.maxLength = 128; input.setAttribute("aria-label", "原始请求 ID");
      button.type = "submit"; button.disabled = working || !state.authorized;
      label.append(input); form.append(label, button);
      form.onsubmit = event => { event.preventDefault(); return query(input.value.trim()); };
      const lookup=el('details');lookup.append(el('summary','按原始请求查询（高级）'),el('p','API 目标：'+state.scope),form);container.append(lookup); if (focused){lookup.open=true;input.focus?.();}
      const search=el('input');search.type='search';search.value=filterText;search.setAttribute('aria-label','搜索任务记录');search.placeholder='搜索车辆、目的站或处理结果';search.oninput=()=>{filterText=search.value;render();const next=container.querySelector?.('[aria-label="搜索任务记录"]');next?.focus();};container.append(search);
      if (!state.records.length) container.append(el("p", "当前 API 目标没有本地请求记录。其他浏览器或 API 目标的索引相互独立。"));
      if(state.legacyRecords?.length) {
        const history=el("details");history.append(el("summary",`历史连接请求（${state.legacyRecords.length}）· 只读`));
        history.append(el("p","这些请求属于旧的未声明连接或其他部署。保留历史，不迁移、不重新提交，也不向当前部署查询；不会阻断当前部署的新意图。"));
        for(const record of state.legacyRecords)history.append(el("p",`${record.envelope.requestId} / ${record.status} / ${record.scope}`));
        container.append(history);
      }
      for (const record of state.records.filter(record=>!filterText||JSON.stringify(record).toLowerCase().includes(filterText.toLowerCase()))) {
        const article = el("article"), receipt = record.receipt, command=record.envelope.command;
        const outcome=record.order?.state==='FINISHED'?'导航订单已完成':record.order?.state==='FAILED'?'导航订单未成功':statuses[record.status]||record.status;
        article.append(el('h3',[command.robotId||commands[command.type]||'操作',command.destination?'前往 '+command.destination:'',outcome].filter(Boolean).join(' · ')),el('p',record.envelope.issuedAt?new Date(record.envelope.issuedAt).toLocaleString():'服务端查询记录'));
        if(!['ACCEPTED','REJECTED'].includes(record.status))article.append(el('p','此操作结果待核对。请查询原回执后再决定下一步。'));
        const evidence=el('details');evidence.append(el('summary','回执、来源与完整依据'));article.append(evidence);container.append(article);
        const detail=article;
        evidence.append(el("h3", record.envelope.requestId), el("p", `${commands[record.envelope.command.type] || record.envelope.command.type} / ${statuses[record.status] || record.status} (${record.status})`));
        evidence.append(el("p", "发出时间：" + (record.envelope.issuedAt || "服务端查询") + "；请求期限：" + (record.envelope.expiresAt || "未知") + "。过期不证明服务端从未收到。"));
        evidence.append(el("p", JSON.stringify(record.envelope.command)));
        if (receipt?.resource?.id) evidence.append(el("p", "关联资源：" + receipt.resource.type + " / " + receipt.resource.id));
        evidence.append(el("p", "回执观察时间：" + (record.receiptObservedAt || "尚未查询 / 本地提交记录")));
        if (record.status === "ACCEPTED") evidence.append(el("p", "管理 API 已受理；执行完成与物理停稳须分别确认。"));
        if (record.order) evidence.append(el("p", "内核订单状态：" + (record.order.state || "未知") + "；观察时间：" + record.orderObservedAt + "；不代表物理停稳。"));
        if(receipt?.confirmation) evidence.append(el("p","服务端确认范围："+receipt.confirmation));
        for (const [label,error] of [["服务端回执原因",receipt?.error],["回执查询错误",record.queryError],["订单查询错误",record.orderError],["提交时错误（历史）",record.lastError]])
          if(error) evidence.append(el("p",`${label}：${error.code || "ERROR"} / ${error.message}`));
        const refresh = el("button", "查询原始回执"); refresh.type = "button"; refresh.disabled = working || !state.authorized;
        refresh.onclick = () => query(record.envelope.requestId); article.append(refresh);
      }
      const status = el("p", message); status.setAttribute("role", "status"); container.append(status);
    }
    render(); return { render, destroy() { container.replaceChildren(); } };
  }
  root.CommandReceipts = { mount };
})(globalThis);
