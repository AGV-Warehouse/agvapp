(function (root) {
  'use strict';
  const OUTCOMES = {SUCCEEDED:'已完成',ACTIVE:'进行中',FAILED:'失败',CLOSED:'已结束，未到站',REJECTED:'被拒绝',ACCEPTED:'已受理',UNKNOWN:'结果未知'};
  const EVENT_KINDS = {run:'车辆任务',scenario:'作业方案',command:'操作'};
  const EVENT_STATUS = {...OUTCOMES,SIM_SESSION_CLOSED:'已结束，未到站',DISPATCHING:'派发中',EXECUTING:'执行中',FINISHED:'已结束',WITHDRAWN:'已取消',UNROUTABLE:'无法规划路线',RUN_CREATED:'任务已创建',CANCEL_REQUESTED:'请求取消',STOPPED_RECOVERY_REQUESTED:'请求收尾',START_INTENT_RECORDED:'请求开始方案',START_REJECTED:'方案未能开始',EXECUTION_STARTED:'方案已开始',UNSUBMITTED_STEPS_STOPPED:'已暂停后续派发',EXPLICITLY_CONTINUED:'方案已继续',EXECUTION_COMPLETED:'方案已完成',PAUSED_REVIEW:'方案已暂停',STEP_OBSERVATION_UNCERTAIN:'步骤状态不确定',STEP_PREPARED:'步骤准备中',STEP_SUCCEEDED:'步骤已完成',STEP_FAILED:'步骤失败',STEP_SUBMITTED:'步骤已提交',STEP_UNKNOWN:'步骤结果未知'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults = () => ({q:'',robotId:'',outcome:'',kind:'',since:'',until:'',limit:20});
  function normalizeFilters(input = {}, kind = 'tasks') {
    const value = defaults();
    for (const field of ['q','robotId']) value[field] = String(input[field] || '').trim().slice(0,200);
    if (kind === 'tasks' && Object.hasOwn(OUTCOMES, input.outcome)) value.outcome = input.outcome;
    if (kind === 'events' && Object.hasOwn(EVENT_KINDS, input.kind)) value.kind = input.kind;
    for (const field of ['since','until']) {
      if (!input[field]) continue;
      if (typeof input[field] !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input[field]) || !Number.isFinite(Date.parse(input[field]))) throw Error('时间范围无效，请重新选择本地日期和时间。');
      value[field] = new Date(input[field]).toISOString();
    }
    if (value.since && value.until && value.since > value.until) throw Error('开始时间不能晚于结束时间。');
    const limit = Number(input.limit ?? 20);
    value.limit = Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 20;
    return value;
  }
  function localToISO(value) {
    if (!value) return '';
    const text = String(value).trim().replace(/\s+/, 'T');
    if (!/^\d{4}-\d{2}-\d{2}(T\d{1,2}:\d{2})?$/.test(text)) throw Error('时间格式应为 2026-11-20 08:00。');
    const date = new Date(text.includes('T') ? text : text + 'T00:00');
    if (!Number.isFinite(date.getTime())) throw Error('时间范围无效，请重新选择本地日期和时间。');
    return date.toISOString();
  }
  function isoToLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const part = n => String(n).padStart(2,'0');
    return `${date.getFullYear()}-${part(date.getMonth()+1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
  }
  const time = value => value && Number.isFinite(Date.parse(value)) ? isoToLocal(value) : '—';
  function safeTarget(value) {
    try { const url = new URL(value, root.location?.origin || 'http://localhost'); url.username='';url.password='';url.search='';url.hash='';return url.href; }
    catch (_) { return 'unknown-target'; }
  }
  function storageScope(api) {
    let deployment = api.deploymentId || '';
    if (!deployment && api.scope) {
      try { deployment = new URL(api.scope).hash.match(/(?:#|&)deployment=([^&]+)/)?.[1] || ''; }
      catch (_) { deployment = String(api.scope).slice(0,200); }
    }
    return safeTarget(api.apiBase || api.scope || '/api/v1/') + '|deployment=' + deployment;
  }
  const identity = api => [api.apiBase,api.scope,api.deploymentId,api.keyRevision,api.authorized,api.deploymentConfirmed];
  const sameIdentity = (a,b) => !!a && a.length === b.length && a.every((v,i) => v === b[i]);
  const authorized = api => !!(api.authorized && api.deploymentConfirmed !== false);

  class Controller {
    constructor(api, options = {}) {
      this.api=api;this.kind=options.kind==='events'?'events':'tasks';this.onChange=options.onChange || (()=>{});
      try {this.storage=options.storage === undefined ? root.sessionStorage : options.storage;} catch (_) {this.storage=null;}
      this.visible=options.visible === true;this.destroyed=false;this.revision=0;this.context=null;this.scope=null;
      this.state={filters:defaults(),cursors:[null],page:0,items:[],nextCursor:null,total:null,observedAt:null,coverage:[],loading:false,error:null,loaded:false,authorized:false};
      this.authorizationChanged(false);
    }
    storageKey() { return 'fleet-server-history.v1:' + this.kind + ':' + encodeURIComponent(this.scope); }
    restore() {
      this.state.filters=defaults();this.state.cursors=[null];this.state.page=0;
      try {
        const data=JSON.parse(this.storage?.getItem(this.storageKey()) || 'null');
        if (!data || data.version!==1 || !Array.isArray(data.cursors) || data.cursors.length>100 || data.cursors[0]!==null || data.cursors.some((v,i)=>i>0 && (typeof v!=='string' || !v || v.length>8192)) || !Number.isInteger(data.page) || data.page<0 || data.page>=data.cursors.length) return;
        this.state.filters=normalizeFilters(data.filters,this.kind);this.state.cursors=data.cursors;this.state.page=data.page;
      } catch (_) { /* Unavailable or old context must not block a read-only query. */ }
    }
    persist() {
      try { this.storage?.setItem(this.storageKey(),JSON.stringify({version:1,filters:this.state.filters,cursors:this.state.cursors.slice(0,100),page:this.state.page})); }
      catch (_) { /* Results and credentials are never persisted. */ }
    }
    clear() { Object.assign(this.state,{items:[],nextCursor:null,total:null,observedAt:null,coverage:[],loading:false,error:null,loaded:false}); }
    emit() { if (!this.destroyed) this.onChange(this.state); }
    authorizationChanged(load = true) {
      if (this.destroyed) return false;
      const current=identity(this.api);
      if (sameIdentity(this.context,current)) return false;
      this.context=current;this.revision++;this.clear();
      const scope=storageScope(this.api);
      if (scope!==this.scope) { this.scope=scope;this.restore(); }
      this.state.authorized=authorized(this.api);this.emit();
      if (load && this.visible && this.state.authorized) void this.query();
      return true;
    }
    async query() {
      this.authorizationChanged(false);
      if (this.destroyed || !this.visible || !this.state.authorized) return;
      const revision=++this.revision, context=identity(this.api), params=new URLSearchParams();
      for (const [key,value] of Object.entries(this.state.filters)) if (value!=='' && (key!=='kind' || this.kind==='events') && (key!=='outcome' || this.kind==='tasks')) params.set(key,String(value));
      const cursor=this.state.cursors[this.state.page];if(cursor)params.set('cursor',cursor);
      this.clear();this.state.loading=true;this.emit();
      try {
        const result=await this.api.request(`history/${this.kind}?${params}`);
        if (!sameIdentity(context,identity(this.api))) { this.authorizationChanged(false);return; }
        if (this.destroyed || revision!==this.revision || !this.visible) return;
        if (!result || result.scope!=='deployment' || !Array.isArray(result.items) || !Array.isArray(result.coverage) || result.coverage.some(v=>typeof v!=='string') || (result.nextCursor!=null && typeof result.nextCursor!=='string') || !Number.isInteger(result.total) || result.total<0) throw Error('历史记录响应无效，请重新查询。');
        Object.assign(this.state,{items:result.items,nextCursor:result.nextCursor || null,total:result.total,observedAt:result.observedAt || null,coverage:result.coverage,loaded:true,error:null});
      } catch (error) {
        if (!sameIdentity(context,identity(this.api))) { this.authorizationChanged(false);return; }
        if (this.destroyed || revision!==this.revision || !this.visible) return;
        this.state.error=[401,403].includes(error.status)?'查询权限已失效，请重新验证访问密钥。':`无法读取历史记录：${error.message || '连接失败'}。请点击“查询记录”重新查询第一页。`;
        if ([401,403].includes(error.status)) { this.state.authorized=false;this.state.items=[]; }
      } finally {
        if (!this.destroyed && revision===this.revision) {this.state.loading=false;this.emit();}
      }
    }
    submit(filters = {}) {
      this.authorizationChanged(false);
      try { this.state.filters=normalizeFilters(filters,this.kind); }
      catch (error) { this.revision++;this.clear();this.state.error=error.message;this.emit();return Promise.resolve(); }
      this.clear();this.state.cursors=[null];this.state.page=0;this.persist();this.emit();return this.query();
    }
    reset() { return this.submit(); }
    next() {
      this.authorizationChanged(false);
      if (this.state.loading || !this.state.authorized || !this.state.nextCursor || this.state.page>=99) return Promise.resolve();
      this.state.cursors=this.state.cursors.slice(0,this.state.page+1).concat(this.state.nextCursor);this.state.page++;this.persist();return this.query();
    }
    previous() {
      this.authorizationChanged(false);
      if (this.state.loading || !this.state.authorized || !this.state.page) return Promise.resolve();
      this.state.page--;this.persist();return this.query();
    }
    setVisible(value) {
      const previous=this.visible;this.visible=!!value;this.authorizationChanged(false);
      if (!this.visible) {this.revision++;this.state.loading=false;return;}
      if (!previous && this.state.authorized && !this.state.loaded) void this.query();
    }
    destroy() {this.destroyed=true;this.revision++;this.clear();}
  }

  function evidence(item) {
    return `<details class="history-evidence eng-only"><summary>详情</summary><pre>${esc(JSON.stringify(item,null,2))}</pre></details>`;
  }
  function itemHTML(item,index,kind,options) {
    const isEvent=kind==='events', label=item.label || (isEvent?'历史事件':'历史任务');
    const status=isEvent?(EVENT_STATUS[item.status] || '已记录'):(OUTCOMES[item.outcome] || '结果未知');
    const tone=/SUCCEEDED|COMPLETED/.test(item.outcome||item.status||'')?'done':/FAIL|REJECT|UNROUTABLE|CLOSED/.test(item.outcome||item.status||'')?'alert':'';
    const stamps=isEvent?(item.sourceTime?esc(time(item.sourceTime)):`记录时间 ${esc(time(item.recordedAt))}（无来源时间）`):`${esc(time(item.createdAt))}${item.updatedAt && item.updatedAt!==item.createdAt?' – '+esc(time(item.updatedAt)):''}`;
    const replay=item.runId && options.onReplay?`<button type="button" class="button" data-history-replay="${index}">复盘此任务</button>`:'';
    const related=isEvent && (item.runId || item.requestId || item.orderId) && options.onTask?`<button type="button" class="button" data-history-task="${index}">查看关联任务</button>`:'';
    return `<li class="history-item"><div class="history-item-heading"><h3>${esc(label)}</h3><span class="history-outcome ${tone}">${esc(status)}</span></div><p class="history-context">${esc(item.vehicleName || item.robotId || '车辆未记录')}${item.destinationLabel || item.destination?' → '+esc(item.destinationLabel || item.destination):''}</p>${item.summary?`<p class="history-summary">${esc(item.summary)}</p>`:''}<p class="history-time">${stamps}</p><div class="history-actions">${replay}${related}</div>${evidence(item)}</li>`;
  }
  function mount(container,api,options={}) {
    let controller, destroyed=false, renderedFilters=null;
    container.innerHTML=`<section class="server-history history-${options.kind==='events'?'events':'tasks'}"><p class="history-scope eng-only">服务端当前部署的记录，包含其他浏览器提交的记录。范围仅限当前部署。</p><form class="history-filters" data-history-form><label>搜索记录<input type="search" data-history-field="q" maxlength="200" placeholder="任务、站点或关联记录"></label><label>车辆<select data-history-field="robotId"><option value="">全部车辆</option>${(options.vehicles?.()||[]).map(id=>`<option value="${esc(id)}">${esc(id)}</option>`).join('')}</select></label>${options.kind==='events'?`<label>事件类别<select data-history-field="kind"><option value="">全部类别</option>${Object.entries(EVENT_KINDS).map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label>`:`<label>任务结果<select data-history-field="outcome"><option value="">全部结果</option>${Object.entries(OUTCOMES).map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label>`}<label>从<input type="text" inputmode="numeric" data-history-field="since" placeholder="2026-11-20 08:00" autocomplete="off"></label><label>到<input type="text" inputmode="numeric" data-history-field="until" placeholder="2026-11-20 18:00" autocomplete="off"></label><label>每页记录<select data-history-field="limit"><option value="20">20 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label><div class="history-filter-actions"><button type="submit" class="button button-primary" data-history-query>查询</button><button type="button" class="button" data-history-reset>清除条件</button></div></form><p class="history-feedback" data-history-feedback role="status" aria-live="polite"></p><div class="history-coverage" data-history-coverage></div><ol class="history-list" data-history-list></ol><nav class="history-pagination" aria-label="历史记录分页"><button type="button" class="button" data-history-previous>上一页</button><span data-history-page></span><button type="button" class="button" data-history-next>下一页</button></nav></section>`;
    const node = selector => container.querySelector(selector);
    const fields=Object.fromEntries(['q','robotId','outcome','kind','since','until','limit'].map(k=>[k,node(`[data-history-field="${k}"]`)]));
    function render(state) {
      if (destroyed) return;
      const filterKey=JSON.stringify(state.filters);
      if (renderedFilters!==filterKey) { for (const [field,input] of Object.entries(fields)) if(input)input.value=['since','until'].includes(field)?isoToLocal(state.filters[field]):String(state.filters[field]);renderedFilters=filterKey; }
      const vehicleSelect=fields.robotId;
      if (vehicleSelect?.tagName==='SELECT') {
        const current=state.filters.robotId||'', ids=[...new Set([...(options.vehicles?.()||[]),...(current?[current]:[])])], key=ids.join('|');
        if (vehicleSelect.dataset.ids!==key) {vehicleSelect.innerHTML='<option value="">全部车辆</option>'+ids.map(id=>`<option value="${esc(id)}">${esc(id)}</option>`).join('');vehicleSelect.dataset.ids=key;vehicleSelect.value=current;}
      }
      const feedback=node('[data-history-feedback]');
      feedback.textContent=!state.authorized?'登录后可查看历史记录。':state.error || (state.loading?'正在查询记录…':state.loaded?(state.total===0?'此条件下没有记录。':`共 ${state.total} 条`):'');
      feedback.setAttribute?.('role',state.error?'alert':'status');
      node('[data-history-coverage]').innerHTML=state.coverage.length?`<details class="eng-only"><summary>记录范围说明</summary><ul>${state.coverage.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:'';
      node('[data-history-list]').innerHTML=state.items.map((item,index)=>itemHTML(item,index,controller.kind,options)).join('');
      node('[data-history-page]').textContent=`第 ${state.page+1} 页`;
      node('[data-history-query]').disabled=!state.authorized;
      node('[data-history-previous]').disabled=!state.authorized || state.loading || state.page===0;
      node('[data-history-next]').disabled=!state.authorized || state.loading || !state.nextCursor || state.page>=99;
    }
    controller=new Controller(api,{...options,onChange:state=>{if(controller)render(state);}});
    function submit(event) {
      event?.preventDefault();const filters={};
      try { for(const [key,input] of Object.entries(fields))if(input)filters[key]=['since','until'].includes(key)?localToISO(input.value):input.value;void controller.submit(filters); }
      catch (error) {controller.revision++;controller.clear();controller.state.error=error.message;controller.emit();}
    }
    const list=node('[data-history-list]');
    const onListClick=event=>{
      controller.authorizationChanged(false);
      if(!controller.state.authorized || !controller.visible)return;
      const button=event.target.closest?.('[data-history-replay],[data-history-task]');if(!button || !list.contains?.(button))return;
      const replay=button.dataset.historyReplay,index=Number(replay ?? button.dataset.historyTask),item=controller.state.items[index];if(!item)return;
      if(replay!==undefined && item.runId)options.onReplay?.({kind:'run',id:item.runId});
      else if(replay===undefined)options.onTask?.({q:item.runId || item.requestId || item.orderId,runId:item.runId,requestId:item.requestId,orderId:item.orderId});
    };
    node('[data-history-form]').addEventListener('submit',submit);
    node('[data-history-reset]').addEventListener('click',()=>{void controller.reset();});
    node('[data-history-previous]').addEventListener('click',()=>{void controller.previous();});
    node('[data-history-next]').addEventListener('click',()=>{void controller.next();});
    list.addEventListener('click',onListClick);
    container.hidden=!controller.visible;render(controller.state);if(controller.visible && controller.state.authorized)void controller.query();
    return {controller,setVisible(value){container.hidden=!value;controller.setVisible(value);},authorizationChanged(){controller.authorizationChanged();},destroy(){destroyed=true;controller.destroy();container.replaceChildren();}};
  }
  const exports={Controller,mount,normalizeFilters,localToISO,isoToLocal,itemHTML,storageScope};
  root.ServerHistoryUI=exports;if(typeof module!=='undefined' && module.exports)module.exports=exports;
})(typeof window!=='undefined'?window:globalThis);
