(function (root) {
  "use strict";
  const PREFIX = "sim-publishing/";
  const terminal = value => ["READY", "REJECTED", "RETIRED"].includes(value?.status);
  const publicationOf = value => value?.publication || value;
  const releaseOf = value => value?.release || value;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const stageLabels = {PREFLIGHT:"发布预检",PUBLISHING:"正在发布内核",KERNEL_VERIFIED:"内核回读通过",WORKER_APPLYING:"等待执行环境加载",READY:"发布核对完成",UNKNOWN:"结果待核对",REJECTED:"已拒绝",RETIRED:"已停用",RETIRING:"正在停用"};
  const blockerText=value=>({SIM_PUBLISH_DISABLED:"隔离仿真发布尚未配置",SIM_NOT_ADMITTED:"尚无当前已核验的运行版本",SIM_KERNEL_DRIFT:"目标内核版本已变化",SIM_READINESS_EXPIRED:"执行环境版本或新鲜状态未通过核验",SIM_SESSION_CHANGED:"执行环境会话已改变，需显式重核",SIM_ACTIVE_ORDER:"仍有活动任务，不能停用或换版",SIM_RETIRE_BLOCKED:"当前状态不允许停用，请核对真实停稳与版本",SIM_UPSTREAM_UNCERTAIN:"无法取得执行环境/内核的可信回读，请检查连接后重新核对",SIM_WORKER_PROCESSES_REMAIN:"隔离仿真进程仍未完全退出，停用尚未确认",SIM_WORKER_STATIONARY_UNCONFIRMED:"尚无可信的新鲜停稳证据，不能确认停用",SIM_WORKER_RESOURCE_HELD:"任务或资源仍需核对，不能确认停用",SIM_WORKER_OWNERSHIP_UNCONFIRMED:"执行控制归属不匹配，不能确认停用",SIM_WORKER_RELEASE_MISMATCH:"当前执行版本不匹配，不能确认停用",SIM_WORKER_STOP_UNCONFIRMED:"无法证明全部隔离仿真进程已停止，停用尚未确认"})[value] || value;
  function kernelEvidence(value = {}) {
    value=value || {};
    return {configurationHash:value.configurationHash || null,fullObservationHash:value.hash || null,verified:value.verified===true,observedAt:value.observedAt || null};
  }
  function releaseAlreadyUsed(state, releaseId) {
    if(!releaseId) return false;
    return [...(state.status?.publications || []),state.activePublication,state.publication].some(p=>p?.releaseId===releaseId && p.status!=="REJECTED");
  }
  class Controller {
    constructor(api, options = {}) {
      this.api = api; this.storage = options.storage;
      if (!this.storage) { try { this.storage=root.localStorage; } catch (_) { /* Read below reports the capability failure. */ } }
      this.lock = options.lock || (callback => root.navigator?.locks?.request ? root.navigator.locks.request("sim-publication:" + this.scope, callback) : Promise.reject(Error("当前来源不支持跨页面请求锁，仅可查询。")));
      this.scope = api.receiptSnapshot().scope;
      this.storeKey = "fleet-sim-publication.v1:" + this.scope;
      this.onChange = options.onChange || (() => {});
      this.beforePublish = options.beforePublish || null;
      this.state = {status:null,statusFresh:false,drafts:[],draft:null,raster:null,release:null,publication:null,activePublication:null,pending:null,pendingResolved:false,busy:false,error:"",notice:"",storageError:""};
      this.context = {siteName:"",sourceNotes:"",coordinateEvidence:"",backgroundVersion:"",assumptions:[]};
      try { this.state.pending = this.readPending(); } catch (e) { this.state.storageError=e.message; }
    }
    readPending() {
      if (!this.storage) throw Error("浏览器存储不可用，不能保证发布请求恢复。");
      const value = JSON.parse(this.storage.getItem(this.storeKey) || "null");
      if (value && (value.scope !== this.scope || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.requestId) || !["p0-sim","p0-pair"].includes(value.targetId) || typeof value.releaseId !== "string" || typeof value.expectedKernelHash !== "string")) throw Error("本地发布请求索引无效；保留原记录并停止新发布。");
      return value;
    }
    savePending(value) {
      try { this.storage.setItem(this.storeKey, JSON.stringify(value)); this.state.pending=value; }
      catch (_) { this.state.storageError="发布请求无法保存，未提交新发布。"; throw Error(this.state.storageError); }
    }
    emit() { this.onChange(this.state); }
    updateBlocker({includeStored=true}={}) {
      const s=this.state;
      if(s.busy&&s.operationKind!=='read')return '地图发布操作正在处理，请在“地图与发布”核对本次操作后再更新。';
      const original=[s.publication,s.activePublication].find(p=>p?.requestId===s.pending?.requestId);
      if(includeStored&&s.pending&&(!s.pendingResolved||original&&!terminal(original)))return '原发布结果待核对，请到“地图与发布 → 查询原发布请求”读取原记录，再更新。';
      return '';
    }
    publicationNotice(value) {
      if(this.state.release && value.releaseId && this.state.release.releaseId!==value.releaseId) return;
      this.state.notice=({READY:"该次发布的回读已记录完成；当前能否运行仍以实时准入为准。",REJECTED:"发布请求已拒绝，请查看失败阶段与记录。",UNKNOWN:"发布结果尚待核对，请查询或显式重核原请求，不能重复发布。",RETIRED:"该版本已停用；换版须重新校验并明确发布。"})[value.status] || "发布请求正在处理，尚未确认当前运行准入。";
    }
    requireRead() { if (!this.api.authorized) throw Error("请先登录操作员会话。"); }
    requireWrite() { this.requireRead(); const state=this.api.receiptSnapshot(); if (!state.canWrite) throw Error(state.writeBlockedReason || "当前仅可查询。"); }
    async run(action,kind='mutation') {
      if (this.state.busy) return;
      this.state.busy=true; this.state.operationKind=kind; this.state.error=""; this.emit();
      try { return await action(); }
      catch (e) { this.state.error=e.message; throw e; }
      finally { this.state.busy=false; this.state.operationKind=null; this.emit(); }
    }
    async refresh(keepSelection = false) {
      this.requireRead();
      try {
        const value=await this.api.request(PREFIX+"status");
        if (typeof value.enabled !== "boolean" || !Array.isArray(value.targets)) throw Error("发布配置响应无效。");
        this.state.status=value; this.state.statusFresh=true;
        this.state.activePublication=value.activePublication || null;
        if (value.activePublication && !keepSelection) this.state.publication=publicationOf(value.activePublication);
        if (this.state.pending) await this.refreshPublication(this.state.pending.requestId,!keepSelection);
        this.emit(); return value;
      } catch (e) { this.state.statusFresh=false; this.emit(); throw e; }
    }
    async catalog() { this.requireRead(); const value=await this.api.request("map-workspace/catalog"); this.state.drafts=value.drafts || []; this.emit(); return value; }
    async selectDraft(id, revision) {
      this.requireRead();
      const value=await this.api.request("map-workspace/drafts/"+encodeURIComponent(id)+(revision?"/revisions/"+encodeURIComponent(revision):""));
      this.state.draft=value; this.state.release=null; this.state.raster=null;
      if(value.draft?.rasterId) this.state.raster=await this.api.request("map-workspace/rasters/"+encodeURIComponent(value.draft.rasterId));
      this.emit(); return value;
    }
    async importCurrent() {
      this.requireWrite(); this.requireTarget();
      const value=await this.api.request(PREFIX+"import-current",{});
      await this.catalog();
      await this.selectDraft(value.draftId || value.id,value.revision);
      this.state.notice="已从隔离仿真导入草稿；运行内核没有因此改变。"; this.emit(); return value;
    }
    requireTarget() {
      const state=this.state;
      if (!state.statusFresh || !state.status?.enabled) throw Error(state.status?.writeBlockedReason || "隔离仿真发布尚未配置，请先读取发布配置。");
      const target=state.status.targets.find(t=>["p0-sim","p0-pair"].includes(t.id) && t.environment==="SIM" && t.isolation);
      if (!target) throw Error("服务端没有提供可用的隔离仿真目标。");
      return target;
    }
    async freeze(context, motionPresetId) {
      this.requireWrite(); this.requireTarget();
      if (!this.state.draft?.id || !this.state.draft.revision) throw Error("请先选择已保存的草稿修订。");
      if (!context.siteName.trim() || !context.sourceNotes.trim() || !context.coordinateEvidence.trim() || !context.backgroundVersion.trim()) throw Error("请填写场地、资料来源、坐标依据和背景版本。");
      if (context.assumptions.some(a=>a.blocking && a.status!=="known")) throw Error("仍有阻断性假设未确认；请在确认依据后更新，不能直接冻结。");
      this.context=context;
      const value=releaseOf(await this.api.request(PREFIX+"releases",{draftId:this.state.draft.id,revision:this.state.draft.revision,expectedKernelHash:this.state.status.kernelHash,context,...(motionPresetId?{motionPresetId}:{})}));
      if (!value.releaseId || !value.releaseHash) throw Error("冻结结果缺少版本身份，请重新查询后核对。");
      this.state.release=value; this.state.notice="已冻结不可变版本。尚未发布，也未授予车辆运行资格。"; this.emit(); return value;
    }
    async chooseRelease(id) { this.requireRead(); this.state.release=releaseOf(await this.api.request(PREFIX+"releases/"+encodeURIComponent(id))); this.emit(); }
    async refreshPublication(id, select = true) {
      this.requireRead();
      const value=publicationOf(await this.api.request(PREFIX+"publications/"+encodeURIComponent(id)));
      if (value.requestId!==id) throw Error("发布记录身份不匹配；保持原请求待核对。");
      if (this.state.pending?.requestId===id) this.state.pendingResolved=terminal(value);
      if (this.state.activePublication?.requestId===id) this.state.activePublication=value;
      if (select || this.state.publication?.requestId===id) this.state.publication=value;
      this.publicationNotice(value);
      this.emit(); return value;
    }
    async publish(targetId) {
      this.requireWrite(); const target=this.requireTarget();
      if (targetId!==target.id) throw Error("请选择服务端明确提供的隔离仿真目标。");
      if (!this.state.release?.releaseId) throw Error("请先冻结或选择一个已有版本。");
      return this.lock(async()=>{
        this.requireWrite();
        const pending=this.readPending();
        if (pending) {
          const prior=await this.refreshPublication(pending.requestId);
          if (!terminal(prior)) throw Error("已有发布请求尚未核实，请查询或重核原请求，不能重复发布。");
        }
        if (this.state.activePublication && !terminal(this.state.activePublication)) throw Error("服务端已有未结束发布，先核对原记录。");
        if (releaseAlreadyUsed(this.state,this.state.release.releaseId)) throw Error("该执行版本已使用；重新冻结草稿生成新版本。");
        if (this.state.activePublication?.status === "READY") throw Error("换版前请先审阅并停用当前隔离仿真版本。");
        const release=this.state.release;
        if (release.baselineKernelHash!==this.state.status.kernelHash) throw Error("目标内核已变化，请刷新并重新校验冻结。");
        this.beforePublish?.(release);
        const request={scope:this.scope,requestId:this.api.id(),releaseId:release.releaseId,targetId,expectedKernelHash:this.state.status.kernelHash};
        this.savePending(request); // Persist the identity before the one explicit publication POST.
        this.state.pendingResolved=false;
        this.state.notice="发布请求已保存，正在提交到所选隔离目标；尚未确认运行准入。";
        this.state.publication={requestId:request.requestId,releaseId:release.releaseId,targetId,status:"UNKNOWN",stage:"PREFLIGHT"}; this.emit();
        this.state.activePublication=this.state.publication;
        try {
          const {scope,...body}=request;
          const value=publicationOf(await this.api.request(PREFIX+"publications",body));
          if (value.requestId!==request.requestId) throw Error("发布响应身份不匹配；请查询原请求。");
          this.state.publication=value; this.state.activePublication=value; this.state.pendingResolved=terminal(value); this.publicationNotice(value); this.emit(); return value;
        } catch(e) { this.state.notice="发布结果尚待核对。请求 ID 已保留；刷新只查询，不重新提交。"; this.emit(); throw e; }
      });
    }
    async verify() {
      this.requireWrite(); const id=this.state.publication?.requestId || this.state.pending?.requestId;
      if (!id) throw Error("没有可重核的发布请求。");
      const value=publicationOf(await this.api.request(PREFIX+"publications/"+encodeURIComponent(id)+"/verify",{}));
      if (value.requestId!==id) throw Error("重核记录身份不匹配。");
      if (this.state.activePublication?.requestId===id) this.state.activePublication=value;
      if (this.state.pending?.requestId===id) this.state.pendingResolved=terminal(value);
      this.state.publication=value; this.publicationNotice(value); this.emit(); return value;
    }
    async retire(expectedRequestId) {
      this.requireWrite(); const p=this.state.activePublication;
      if(expectedRequestId!==undefined&&p?.requestId!==expectedRequestId)throw Error("当前发布已变化，请重新审阅要停用的原发布。");
      if(!p || !["READY","UNKNOWN"].includes(p.status)) throw Error("只有服务端当前已完成或待核对的发布记录可申请停用；请先读取最新状态。");
      let value;
      try { value=publicationOf(await this.api.request(PREFIX+"publications/"+encodeURIComponent(p.requestId)+"/retire",{})); }
      catch(error) { this.state.activePublication={...p,status:"UNKNOWN",stage:"RETIRING"};this.state.publication=this.state.activePublication;this.emit();throw error; }
      if(value.requestId!==p.requestId) throw Error("停用响应身份不匹配，请查询原发布请求。");
      this.state.publication=value; this.state.activePublication=value; this.publicationNotice(value); this.emit();
      await this.refresh();
      return value;
    }
  }
  function readinessDiagnosticsHTML(admission={}) {
    const missing="未提供", field=(value,key)=>value?.[key] ?? missing;
    const source=value=>({observedAt:field(value,"observedAt"),sourceAgeSeconds:field(value,"sourceAgeSeconds"),ready:field(value,"ready"),blockers:field(value,"blockers")});
    const worker=admission.worker || {}, robots=worker.robots;
    const detail=value=>({...source(value),navigation:value?.navigation ? {...value.navigation,tf:field(value.navigation,"tf"),tfComponents:field(value.navigation,"tfComponents")} : missing});
    const evidence={admission:source(admission),worker:detail(worker),robots:robots && typeof robots==="object" ? Object.fromEntries(Object.entries(robots).map(([id,value])=>[id,detail(value)])) : missing};
    return `<details data-readiness-diagnostics><summary>就绪源诊断</summary><p>以下为后端原始观察；源报告新鲜不代表 TF 新鲜，缺失字段为未提供。当前准入仍以后端判定为准。</p><pre>${escape(JSON.stringify(evidence,null,2))}</pre></details>`;
  }
  function mount(container, api, options={}) {
    if (!container) return null;
    const field=(name,label,value,type="text")=>`<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" required></label>`;
    let formContext={siteName:"",sourceNotes:"",coordinateEvidence:"",backgroundVersion:"",assumptions:[]}, selectedTarget="", selectedMotionPreset="acceptance-v1", selectedRevision="", lastAuthorized=false, retireReview=false;
    const short=value=>{const s=String(value || "未提供");return s.length>22?s.slice(0,10)+"…"+s.slice(-6):s;};
    const identity=value=>`<details class="release-identity" data-release-key="${escape(value)}"><summary>${escape(short(value))}</summary><code>${escape(value || "未提供")}</code></details>`;
    const opened=node=>new Set(Array.from(node.querySelectorAll('details[open]')).map(d=>d.dataset.releaseKey || d.querySelector('summary')?.textContent));
    const restoreOpened=(node,keys)=>node.querySelectorAll('details').forEach(d=>{d.open=keys.has(d.dataset.releaseKey || d.querySelector('summary')?.textContent);});
    const controller=new Controller(api,{...options,onChange:()=>render()});
    const act=(callback,kind='mutation')=>controller.run(callback,kind).catch(()=>{});
    function admissionHTML() {
      const s=controller.state,a=s.status?.currentAdmission;
      if(!s.statusFresh || !a) return '<p class="release-notice">当前准入未核实。历史发布完成不代表执行环境此刻可用。</p>';
      return `${root.MotionPresetUI?.recordedHTML(a.motionPreset)||""}<p><strong>当前准入：${a.ready===true?"后端允许":"未就绪 / 已阻断"}</strong></p><p>核对时间：${escape(a.observedAt || "未提供")}；来源：${escape(short(a.sourceId))}</p>${(a.blockers || []).map(b=>`<p class="release-error">${escape(blockerText(b))}</p>`).join("")}${typeof a.detail==="string"?`<p class="release-error">${escape(a.detail)}</p>`:""}<p>${a.ready===true?"当前准入版本":"关联发布版本（未准入）"} ${identity(a.releaseId)}。准入随真实连接、版本和车辆状态变化，不以历史 READY 代替。</p>${readinessDiagnosticsHTML(a)}`;
    }
    function publicationHTML(p) {
      if (!p) return '<p>尚无发布记录。冻结不会改变运行模型。</p>';
      const worker=p.worker || {}, kernel=kernelEvidence(p.kernel);
      return `<h3>发布记录</h3>${identity(p.requestId)}<p><strong>${escape(stageLabels[p.status] || p.status || "未知")}</strong> · 当前阶段：${escape(stageLabels[p.stage] || p.stage || "未知")}</p><dl class="release-facts"><dt>版本 / 目标</dt><dd>${identity(p.releaseId)} / ${escape(p.targetId)}</dd><dt>配置版本核验</dt><dd>${kernel.verified===true?"服务端已核验":"未确认"} · ${identity(kernel.configurationHash)}</dd><dt>完整观测摘要（含运行反馈）</dt><dd>${identity(kernel.fullObservationHash)}</dd><dt>内核核对时间</dt><dd>${escape(kernel.observedAt || "尚未记录")}</dd><dt>执行环境 / 车辆</dt><dd>${worker.ready===true?"后端记录就绪":"未就绪 / 未确认"} · ${identity(worker.releaseHash)}</dd><dt>执行环境观察时间</dt><dd>${escape(worker.observedAt || "尚无证据")}</dd></dl>${(worker.blockers || []).map(b=>`<p class="release-error">${escape(typeof b==="string"?blockerText(b):b.message || b.code || "待核对")}</p>`).join("")}${p.error?`<p class="release-error">${escape(typeof p.error==="string"?p.error:(blockerText(p.error.code)!==p.error.code?blockerText(p.error.code)+(p.error.message?"；服务端说明："+p.error.message:""):p.error.message || p.error.code || "发布失败，请核对记录"))}</p>`:""}${p.phaseHistory?.length?`<ol class="release-phase-list">${p.phaseHistory.map(step=>`<li>${escape(stageLabels[step.status] || step.status)} · ${escape(step.at || "")}${step.error?`<p class="release-error">${escape(blockerText(step.error.code) || "历史错误")}：${escape(step.error.message || "服务端未提供详细说明")}</p>`:""}</li>`).join("")}</ol>`:""}${p.failedStage?`<p class="release-error">历史失败阶段：${escape(stageLabels[p.failedStage] || p.failedStage)}；最后确认阶段：${escape(stageLabels[p.lastConfirmedStage] || p.lastConfirmedStage || "尚未确认")}</p>`:""}<p>发布受理、内核切换、地图加载和车辆准入分别核对。结果未知时保留已发生变化，不自动回退。</p>`;
    }
    function render() {
      const openDetails=opened(container);
      const focused=root.document?.activeElement;
      const focus=focused && container.contains(focused) ? {name:focused.name,field:focused.dataset?.releaseField,action:focused.dataset?.releaseAction,index:focused.dataset?.assumptionIndex,key:focused.dataset?.assumptionKey,start:focused.selectionStart,end:focused.selectionEnd} : null;
      const s=controller.state, auth=api.authorized, writable=api.receiptSnapshot().canWrite===true, target=s.status?.targets?.find(t=>["p0-sim","p0-pair"].includes(t.id)), enabled=s.statusFresh && s.status?.enabled && target?.environment==="SIM" && target?.isolation, d=s.draft, release=s.release, usedRelease=releaseAlreadyUsed(s,release?.releaseId);
      if(retireReview&&(retireReview.requestId!==s.activePublication?.requestId||retireReview.scope!==api.scope||retireReview.keyRevision!==api.keyRevision||!auth||!["READY","UNKNOWN"].includes(s.activePublication?.status)))retireReview=false;
      container.innerHTML=`<div class="release-heading"><h2>地图与隔离仿真发布</h2><button type="button" data-release-action="refresh" ${!auth||s.busy?"disabled":""}>读取配置与草稿</button></div><p>保存草稿 → 登记资料 → 校验冻结 → 核对目标 → 发布回读 → 版本与准入确认。仅支持当前已验证的固定单车或双车隔离仿真布局；不向真实车发布。</p>${!auth?'<p class="release-notice">请使用顶部“操作员登录”后读取发布配置。</p>':""}${!s.statusFresh?'<p class="release-notice">发布服务尚未读取或不可用；原有地图编辑器仍可独立使用。</p>':!s.status.enabled?`<p class="release-notice">隔离仿真发布尚未配置：${escape(s.status.writeBlockedReason || "服务端未启用")}</p>`:""}${s.storageError?`<p class="release-error">${escape(s.storageError)}</p>`:""}${s.error?`<p class="release-error" role="alert">${escape(s.error)}</p>`:""}${s.notice?`<p role="status">${escape(s.notice)}</p>`:""}<div class="release-columns"><section><h3>1 · 选择已保存草稿</h3><label>草稿<select data-release-field="draft" ${s.busy?"disabled":""}><option value="">请选择</option>${s.drafts.map(v=>`<option value="${escape(v.id)}" ${v.id===d?.id?"selected":""}>${escape(v.name)} · r${escape(v.revision)}</option>`).join("")}</select></label>${d?`<label>修订<input data-release-field="revision" ${s.busy?"disabled":""} type="number" min="1" step="1" value="${escape(d.revision)}"></label><button type="button" data-release-action="revision" ${s.busy?"disabled":""}>读取该修订</button><p>${escape(d.draft?.name || d.id)} · r${escape(d.revision)} · 草稿，未发布</p><a class="button" href="editor.html?draftId=${encodeURIComponent(d.id)}">编辑此草稿</a>`:'<p>没有选定草稿；可从已核验的隔离仿真布局导入，或打开编辑器。</p>'}<div class="release-actions"><button type="button" data-release-action="import" ${!writable||!enabled||s.busy?"disabled":""}>从隔离仿真导入当前图</button><a class="button" href="editor.html">打开地图编辑器</a></div><h3>2 · 资料与三层依据</h3><form data-release-form="context">${field("siteName","场地名称",formContext.siteName)}${field("sourceNotes","资料来源 / 日期",formContext.sourceNotes)}${field("coordinateEvidence","坐标配准与资料依据（仅登记来源，不修改坐标）",formContext.coordinateEvidence)}${field("backgroundVersion","背景资料版本",formContext.backgroundVersion)}<div class="release-known"><strong>已保存的地图依据</strong><p>地图标识：${escape(d?.draft?.mapId || "未选择")}；图像栅格：${s.raster?escape(s.raster.resolution)+" 米/格；原点 "+escape(s.raster.origin?.join(", ")):"尚未取得"}。坐标系名称：${escape(s.raster?.frame || s.status?.canonicalCoordinates?.frame || "服务端未提供")}。</p></div><h4>假设与待测项</h4>${formContext.assumptions.map((a,i)=>`<fieldset class="release-assumption"><legend>假设 ${i+1}</legend><label>状态<select data-assumption-index="${i}" data-assumption-key="status"><option value="known" ${a.status==="known"?"selected":""}>已知</option><option value="estimated" ${a.status==="estimated"?"selected":""}>估计</option><option value="unverified" ${a.status==="unverified"?"selected":""}>待测</option></select></label><label>负责人<input data-assumption-index="${i}" data-assumption-key="owner" value="${escape(a.owner)}" required></label><label>描述与依据<textarea data-assumption-index="${i}" data-assumption-key="text" rows="2" required>${escape(a.text)}</textarea></label><label class="release-check"><input type="checkbox" data-assumption-index="${i}" data-assumption-key="blocking" ${a.blocking?"checked":""}>未确认时阻断冻结</label><button type="button" data-assumption-remove="${i}">删除此假设</button></fieldset>`).join("")}<button type="button" data-assumption-add>添加假设 / 待测项</button><p class="fine-print">仅记录有依据的已知信息；估计与待测保持可见。占据图与路网修订由后端冻结，未确认的阻断项不能冻结。</p>${root.MotionPresetUI?.cards(s.status?.motionPresets,selectedMotionPreset,s.busy||!writable)||""}<button type="submit" ${!writable||!enabled||!d||s.busy?"disabled":""}>校验并冻结选定修订</button></form></section><section><h3>3 · 冻结版本与发布审阅</h3>${release?`${root.MotionPresetUI?.recordedHTML(release.motionPreset)||""}<dl class="release-facts"><dt>冻结版本</dt><dd>${identity(release.releaseId)}</dd><dt>版本摘要</dt><dd>${identity(release.releaseHash)}</dd><dt>草稿 / 修订</dt><dd>${escape(release.draftId)} / ${escape(release.revision)}</dd><dt>占据图摘要</dt><dd>${identity(release.rasterHash)}</dd><dt>冻结完整模型摘要（modelHash）</dt><dd>${identity(release.modelHash)}<small>此不可变摘要不随执行环境的运行反馈更新。</small></dd><dt>发布配置摘要（configurationHash）</dt><dd>${identity(release.configurationHash)}</dd><dt>冻结时目标配置基线</dt><dd>${identity(release.baselineKernelHash)}</dd><dt>冻结时完整观测基线</dt><dd>${identity(release.baselineObservedHash)}</dd></dl>${release.context?`<details><summary>冻结资料与假设</summary><pre>${escape(JSON.stringify(release.context,null,2))}</pre></details>`:""}${release.validation?`<details><summary>校验范围与结果</summary><pre>${escape(JSON.stringify(release.validation,null,2))}</pre></details>`:""}`:'<p>尚未选择冻结版本。结构校验不等于碰撞、定位或现场安全验收。</p>'}<label>已有冻结版本<select data-release-field="release" ${s.busy?"disabled":""}><option value="">请选择</option>${(s.status?.releases || []).map(v=>`<option value="${escape(v.releaseId)}" ${v.releaseId===release?.releaseId?"selected":""} ${releaseAlreadyUsed(s,v.releaseId)?"disabled":""}>${escape(short(v.releaseId))}${releaseAlreadyUsed(s,v.releaseId)?"（已使用；仅历史查看）":""} · ${escape(v.createdAt || "")}</option>`).join("")}</select></label><label>明确的隔离仿真目标<select data-release-field="target" ${!enabled||s.busy?"disabled":""}><option value="">请选择</option>${s.status?.targets?.filter(t=>["p0-sim","p0-pair"].includes(t.id)&&t.environment==="SIM").map(t=>`<option value="${escape(t.id)}" ${selectedTarget===t.id?"selected":""}>${escape(t.label)} · SIM · ${escape(t.id)}</option>`).join("") || ""}</select></label><div><p>目标当前配置摘要：</p>${identity(s.status?.kernelHash)}<details><summary>目标当前完整观测摘要（含运行反馈）</summary>${identity(s.status?.kernelObservedHash)}</details><p class="fine-print">配置摘要用于后端核验；完整观测还包含适配器运行反馈，两者不要求相同。缺少字段时显示未提供，不推算替代值。</p><p>仅支持后端列出的受限导航布局，不支持任意建筑图、顶升或交接。</p></div>${usedRelease?'<p class="release-notice">该执行版本已使用；重新冻结草稿生成新版本。仍可从下方发布记录查询回执并查看历史版本资料。</p>':""}<button type="button" data-release-action="publish" ${!writable||!enabled||!release||!selectedTarget||usedRelease||s.busy||s.storageError||(s.pending&&!s.pendingResolved)||(s.activePublication&&(!terminal(s.activePublication)||s.activePublication.status==="READY"))?"disabled":""}>将此冻结版本发布到所选隔离仿真</button><h3>4 · 发布回读与当前准入</h3>${admissionHTML()}${publicationHTML(s.publication)}<div class="release-actions"><button type="button" data-release-action="query" ${!auth||s.busy||!(s.publication?.requestId||s.pending?.requestId)?"disabled":""}>查询原发布请求</button><button type="button" data-release-action="verify" ${!writable||s.busy||!(s.publication?.requestId||s.pending?.requestId)?"disabled":""}>重新核对内核与执行环境</button></div><p class="fine-print">重新核对不会重发发布。刷新页面只查询原请求；不会自动发布或启动任务。</p><h3>停用与换版</h3><p>换版前先停用当前隔离仿真版本。后端必须确认车辆停稳、无订单，保留执行账本；不会清空日志或自动恢复旧任务。</p><button type="button" data-retire-review ${!writable||s.busy||!["READY","UNKNOWN"].includes(s.activePublication?.status)?"disabled":""}>审阅停用当前版本</button>${retireReview?`<div class="release-notice"><strong>停用隔离目标 ${escape(s.activePublication?.targetId || target?.id || "未提供")}</strong><p>当前版本：${escape(short(s.activePublication?.releaseId))}。停用后不再允许该版本接收任务，需重新校验冻结并发布才能换版。车辆仍在运动或有订单时由后端拒绝。</p><button type="button" data-retire-confirm ${!writable||s.busy?"disabled":""}>确认停用此隔离版本</button> <button type="button" data-retire-cancel>返回</button></div>`:""}<h3>发布记录</h3>${(s.status?.publications || []).map(p=>`<button type="button" data-release-query="${escape(p.requestId)}">${escape(short(p.requestId))} · ${escape(stageLabels[p.status] || p.status)}</button>`).join("") || '<p>当前没有服务端历史记录。</p>'}</section></div>`;
      container.querySelector('[data-release-field="draft"]').onchange=e=>{if(e.target.value)act(async()=>{await controller.selectDraft(e.target.value);selectedRevision=String(controller.state.draft.revision);},'read');};
      container.querySelector('[data-release-field="release"]').onchange=e=>{if(e.target.value)act(()=>controller.chooseRelease(e.target.value),'read');};
      container.querySelector('[data-release-field="target"]').onchange=e=>{selectedTarget=e.target.value;render();};
      container.querySelector('[data-retire-review]').onclick=()=>{retireReview={requestId:controller.state.activePublication?.requestId,scope:api.scope,keyRevision:api.keyRevision};render();};
      const retireConfirm=container.querySelector('[data-retire-confirm]');if(retireConfirm)retireConfirm.onclick=()=>{const reviewed=retireReview;if(!reviewed)return;retireReview=false;act(async()=>{if(reviewed.scope!==api.scope||reviewed.keyRevision!==api.keyRevision)throw Error('控制连接已变化，请重新审阅原发布。');await controller.retire(reviewed.requestId);});};
      const retireCancel=container.querySelector('[data-retire-cancel]');if(retireCancel)retireCancel.onclick=()=>{retireReview=false;render();};
      const revisionInput=container.querySelector('[data-release-field="revision"]');
      if(revisionInput) {if(selectedRevision)revisionInput.value=selectedRevision;revisionInput.oninput=e=>{selectedRevision=e.target.value;};}
      const form=container.querySelector('[data-release-form]');
      form.oninput=()=>{const f=new FormData(form);for(const k of ["siteName","sourceNotes","coordinateEvidence","backgroundVersion"])formContext[k]=String(f.get(k)||"");};
      container.querySelectorAll('[data-assumption-index]').forEach(input=>{input.oninput=()=>{const a=formContext.assumptions[Number(input.dataset.assumptionIndex)];a[input.dataset.assumptionKey]=input.type==="checkbox"?input.checked:input.value;};});
      container.querySelector('[data-assumption-add]').onclick=()=>{formContext.assumptions.push({text:"",status:"unverified",owner:"",blocking:true});render();};
      container.querySelectorAll('[data-assumption-remove]').forEach(button=>button.onclick=()=>{formContext.assumptions.splice(Number(button.dataset.assumptionRemove),1);render();});
      container.querySelectorAll('[name="motion-preset"]').forEach(input=>{input.onchange=e=>{selectedMotionPreset=e.target.value;};});
      form.onsubmit=e=>{e.preventDefault();act(async()=>{if(formContext.assumptions.some(a=>!a.owner.trim()||!a.text.trim()))throw Error("请填写每条假设的负责人和描述。");await controller.freeze({...formContext,assumptions:formContext.assumptions.map(a=>({...a,owner:a.owner.trim(),text:a.text.trim()}))},s.status?.motionPresets?.length?selectedMotionPreset:undefined);});};
      container.querySelectorAll('[data-release-action]').forEach(b=>b.onclick=()=>act(async()=>{switch(b.dataset.releaseAction){case "refresh":await controller.refresh();await controller.catalog();break;case "import":await controller.importCurrent();selectedRevision=String(controller.state.draft.revision);break;case "revision":await controller.selectDraft(d.id,selectedRevision||d.revision);break;case "publish":await controller.publish(selectedTarget);break;case "query":await controller.refreshPublication(s.publication?.requestId||s.pending?.requestId);break;case "verify":await controller.verify();break;}},["refresh","revision","query"].includes(b.dataset.releaseAction)?"read":"mutation"));
      container.querySelectorAll('[data-release-query]').forEach(b=>b.onclick=()=>act(async()=>{const p=await controller.refreshPublication(b.dataset.releaseQuery);if(p.releaseId)await controller.chooseRelease(p.releaseId);},"read"));
      restoreOpened(container,openDetails);
      for(const summary of options.summaries || []) if(summary) { const openSummary=opened(summary);summary.innerHTML=`<h3>隔离仿真版本与准入</h3>${admissionHTML()}<details><summary>最近发布记录</summary>${publicationHTML(s.activePublication)}</details><a class="button" href="#/maps">查看地图发布流程</a>`;restoreOpened(summary,openSummary); }
      if(focus) {
        const restored=focus.name?container.querySelector(`[name="${focus.name}"]`):focus.field?container.querySelector(`[data-release-field="${focus.field}"]`):focus.action?container.querySelector(`[data-release-action="${focus.action}"]`):focus.index!=null?container.querySelector(`[data-assumption-index="${focus.index}"][data-assumption-key="${focus.key}"]`):null;
        if(restored&&!restored.disabled) {restored.focus({preventScroll:true});if(typeof restored.setSelectionRange==="function"&&focus.start!=null)try{restored.setSelectionRange(focus.start,focus.end);}catch(_){} }
      }
      options.onState?.(s);
    }
    render();
    const timer=root.setInterval?.(()=>{const s=controller.state;if(api.authorized&&!s.busy&&s.statusFresh&&s.status?.enabled)act(()=>controller.refresh(true),'read');},5000);
    return {controller,render,authorizationChanged(){const authorized=!!(api.authorized);if(authorized!==lastAuthorized){lastAuthorized=authorized;render();if(authorized&&api.receiptSnapshot().deploymentConfirmed===true)return act(()=>controller.refresh(),'read');} },destroy(){if(timer)root.clearInterval(timer);container.replaceChildren();}};
  }
  root.MapReleaseUI={Controller,mount,stageLabels,kernelEvidence,releaseAlreadyUsed};
  if(typeof module!=="undefined"&&module.exports)module.exports={Controller,mount,stageLabels,kernelEvidence,releaseAlreadyUsed};
})(globalThis);
