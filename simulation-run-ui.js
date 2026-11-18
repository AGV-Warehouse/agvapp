(function(root){
  'use strict';
  const terminal=run=>run?.sessionClosure?.status==='COMPLETED'||run?.state==='REJECTED'||run?.completion?.settled===true;
  const runIdentity=run=>run?JSON.stringify([run.runId,run.orderId,run.robotId||run.command?.command?.robotId,run.releaseId,run.sourceId]):null;
  const authoredRoute=(run,status)=>run?.profileId==='scene-routes-pair-v1'||!!run?.releaseId&&(status?.releases||[]).some(release=>release.releaseId===run.releaseId&&release.profileId==='scene-routes-pair-v1');
  const authoredRecoveryNote='任务未结案时，可在上方选择“强制复位仿真”，审阅涉及的车辆和任务后确认。复位会停止整个隔离仿真并释放车辆资源。任务与失败记录会保留。完成后可重新准备服务并发布原场景。';
  function authoredRecoveryHTML(run,status){
    return authoredRoute(run,status)&&!run.activeCancellation&&!terminal(run)&&(run.cancellation||['FAILED','WITHDRAWN','CANCELLED'].includes(run.state)||['FAILED','WITHDRAWN','CANCELLED'].includes(run.order?.state))?'<p class="release-notice">'+authoredRecoveryNote+'</p>':'';
  }
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const labels={DISPATCHING:'正在提交',UNKNOWN:'结果待核对',REJECTED:'请求已拒绝',ACCEPTED:'请求已受理',EXECUTING:'任务执行中',FINISHED:'内核报告完成',FAILED:'任务失败',WITHDRAWN:'撤回处理中',UNROUTABLE:'无可用路线'};
  const routeLabel=(run,key,fallback)=>{const label=run.routeContext?.[key];return typeof label==='string'&&label.trim()?label:fallback;};
  const age=value=>{const n=Date.parse(value);return Number.isFinite(n)?Math.max(0,(Date.now()-n)/1000).toFixed(1)+' 秒前':'观察时间未提供';};
  const robotOf=run=>run?.robotId||run?.command?.command?.robotId;
  const vehicleOf=run=>run?.vehicleName||robotOf(run)||'车辆未知';
  function currentRuns(state){
    const releaseId=state.status?.activePublication?.status==='READY'&&state.status.activePublication.releaseId;
    if(!(state.capabilities||[]).includes('concurrent_vehicles')||!releaseId)return [];
    const byId=new Map([...state.runs,...state.observedRuns,...[state.run].filter(Boolean)].map(run=>[run.runId,run]));
    return [...byId.values()].filter(run=>run.releaseId===releaseId&&run.orderId&&!terminal(run));
  }
  function activeControlHTML(state, authorized, canWrite, review){
    const current=currentRuns(state);
    const run=state.run, isCurrent=current.some(r=>r.runId===run?.runId);
    const header=current.length?'<div class="release-actions" aria-label="当前任务">'+current.map(r=>
      `<button type="button" data-run-current="${esc(r.runId)}" aria-pressed="${r.runId===run?.runId}" ${state.busy?'disabled':''}>${esc(vehicleOf(r))} · ${esc(routeLabel(r,'destinationLabel',r.command?.command?.destination||'目的站未知'))}</button>`).join('')+'</div>':'';
    if(!isCurrent)return header;
    const running=run.order?.state==='BEING_PROCESSED', owns=run.observation?.vehicle?.transportOrder===run.orderId;
    const motion=run.motionControl, action=motion?.command?.command?.type, feedback=motion?.feedback;
    const motionPending=motion&&motion.receipt?.status!=='REJECTED'&&feedback?.status!=='CONFIRMED';
    const paused=action==='pause'&&feedback?.status==='CONFIRMED';
    const activeCancel=run.activeCancellation&&run.activeCancellation.receipt?.status!=='REJECTED';
    const withdrawing=run.cancellation&&run.cancellation.receipt?.status!=='REJECTED';
    const disabled=(!authorized||state.busy||!canWrite)?'disabled':'';
    const motionControls=running&&owns&&!activeCancel&&!withdrawing&&!motionPending
      ? `<button type="button" data-run-action="${paused?'resume':'pause'}" ${disabled}>${paused?'继续原任务':'暂停原任务并停稳'}</button>`:'';
    const immediate=(running||run.order?.state==='WITHDRAWN')&&owns&&!activeCancel
      ? `<button type="button" data-run-action="stop-cancel-review" ${disabled}>即时撤单并停车</button>`:'';
    const reviewHTML=review?.action==='stop-cancel'?`<p class="release-notice">将立即撤回 ${esc(vehicleOf(run))} 的当前任务，停止已下发动作。另一辆车必须已停稳且没有活动任务。受理后请继续核对车载取消、持续停稳和剩余资源。</p><button type="button" data-run-action="stop-cancel" ${disabled}>确认即时撤单并停车</button>`:'';
    return header+`<div class="release-actions">${motionControls}${immediate}</div>${reviewHTML}`;
  }
  function controlResultHTML(run){
    const action=run.motionControl, feedback=action?.feedback, immediate=run.activeCancellation, stop=immediate?.feedback;
    const receipt=status=>({ACCEPTED:'调度已受理',REJECTED:'调度已拒绝',UNKNOWN:'调度结果待核对'})[status]||'回执待核对';
    const motion=action?`<p class="release-notice">${action.command?.command?.type==='pause'?'暂停原任务':'继续原任务'} · ${receipt(action.receipt?.status)} · ${feedback?.status==='CONFIRMED'?(feedback.paused?'已确认暂停并持续停稳':'车载已确认解除暂停') : feedback?.status==='FAILED'?'车载动作失败':'等待车载确认'}</p>`:'';
    if(!immediate)return motion;
    const checks=[
      ['调度回执',receipt(immediate.receipt?.status)],
      ['任务终态',stop?.orderTerminal?'已核实':'待核实'],
      ['车载取消',stop?.actionStatus==='FINISHED'&&stop?.routeCleared?'已确认':stop?.actionStatus==='FAILED'?'动作失败':'待确认'],
      ['持续停稳',stop?.sustainedStationary?'已核实':'待核实'],
      ['路线资源',stop?.routeResourcesReleased?'路线资源已撤回，当前站点可能仍由该车占用':'释放状况待核对'],
      ['停车位置',stop?.positionAligned?'已与调度位置核对':'尚未与调度位置核对'],
    ];
    return motion+`<div class="release-notice"><strong>即时撤单结果</strong><ul>${checks.map(([label,result])=>`<li>${label} · ${result}</li>`).join('')}</ul>${stop?.paused===true?'<p>该车仍处于暂停。</p>':''}${run.sessionClosure?.status!=='COMPLETED'?'<p>如果停车位置、路线资源或下一单仍无法核实，可强制复位仿真，结束当前会话并保留记录。</p><button type="button" data-run-action="reset-link">查看强制复位仿真</button>':''}</div>`;
  }
  function resources(value){
    if(value==null)return '未提供';
    if(Array.isArray(value))return value.length?value.map(resources).join(' → '):'当前报告为空';
    if(typeof value==='object') {
      if(Array.isArray(value.samples))return `${value.source || '估计轨迹'} · ${value.sampleCount ?? value.samples.length} 个采样 · 最近 ${value.samples.length} 点`;
      if(value.route)return resources(value.route);
      if(value.steps)return resources(value.steps);
      if(value.resources)return resources(value.resources);
      return [value.path,value.pathName,value.destinationPoint,value.point,value.name,value.id].filter(v=>typeof v==='string').join(' / ') || '已有源数据（展开诊断查看）';
    }
    return String(value);
  }
  function motionHTML(observation={}) {
    const motion=observation.motion||{},execution=observation.resources?.executed;
    const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
    const samples=execution?.frame==='map'&&Array.isArray(execution.samples)?execution.samples.filter(p=>p.frame==='map'&&valid(p)).slice(-200):[];
    const path=motion.navPath?.frame==='map'&&motion.navPath?.fresh===true&&Array.isArray(motion.navPath.poses)?motion.navPath.poses.filter(valid):[];
    const estimate=motion.estimatedPose?.frame==='map'&&motion.estimatedPose?.fresh===true&&valid(motion.estimatedPose)?motion.estimatedPose:null;
    const truth=motion.groundTruthPose?.frame==='map'&&motion.groundTruthPose?.fresh===true&&valid(motion.groundTruthPose)?motion.groundTruthPose:null;
    const points=[...samples,...path,...[estimate,truth].filter(Boolean)];
    if(!points.length)return '<p class="release-notice">运动图层未提供：尚无同一 map 坐标系的实际采样。计划路线与已执行轨迹不互相替代。</p>';
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs)-.5,right=Math.max(...xs)+.5,bottom=Math.min(...ys)-.5,top=Math.max(...ys)+.5;
    const w=Math.max(2,right-left),h=Math.max(2,top-bottom),xy=p=>`${(p.x-left).toFixed(4)},${(top-p.y).toFixed(4)}`;
    const circle=(p,color)=>p?`<circle cx="${p.x-left}" cy="${top-p.y}" r="${Math.max(w,h)*.014}" fill="${color}"/>`:'';
    return `<figure class="run-motion"><figcaption>map · 米 · 计划与运动采样</figcaption><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="同一坐标系下的 Nav2 计划和 AMCL 估计轨迹，估计不等于真值" preserveAspectRatio="xMidYMid meet">${path.length?`<polyline points="${path.map(xy).join(' ')}" fill="none" stroke="#bd7c15" stroke-width="${Math.max(w,h)*.006}" stroke-dasharray=".12 .08"/>`:''}${samples.length?`<polyline points="${samples.map(xy).join(' ')}" fill="none" stroke="#346bc2" stroke-width="${Math.max(w,h)*.008}"/>`:''}${circle(estimate,'#346bc2')}${circle(truth,'#218153')}</svg><p><span class="run-key planned">虚线 · Nav2 当前计划：${path.length?'已提供':'未提供 / 过期'}</span> <span class="run-key executed">蓝线 · AMCL 估计轨迹：${samples.length?'最近 '+samples.length+' 点':'未提供'}（不是 ground truth）</span> <span class="run-key truth">绿点 · 仿真真值：${truth?'已提供':'未提供 / 过期'}</span></p></figure>`;
  }
  function mapOverlay(observation={},model={},includeVehiclePoses=true) {
    const motion=observation.motion||{},r=observation.resources||{},xy=p=>`${p.x*60},${-p.y*60}`,valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
    const names=value=>value==null?[]:Array.isArray(value)?value.flatMap(names):typeof value==='string'?[value]:typeof value==='object'?Object.values(value).flatMap(names):[];
    const allocated=new Set(names(r.allocatedNames||r.allocated)),points=new Map((model.points||[]).map(p=>[p.id,p]));
    const pathD=path=>{const a=points.get(path.source),b=points.get(path.target);if(!valid(a)||!valid(b))return '';const controls=(path.controlPoints||[]).filter(valid);let d=`M${xy(a)}`;if(path.connectionType==='BEZIER'&&controls.length===1)d+=` Q${xy(controls[0])} ${xy(b)}`;else if(path.connectionType==='BEZIER_3'&&controls.length===2)d+=` C${controls.map(xy).join(' ')} ${xy(b)}`;else d+=controls.map(p=>` L${xy(p)}`).join('')+` L${xy(b)}`;return d;};
    const allocation=(model.paths||[]).filter(p=>allocated.has(p.id)).map(p=>`<path d="${pathD(p)}" fill="none" stroke="#ad4794" stroke-width="7" opacity=".6"><title>后端分配资源 ${esc(p.id)}</title></path>`).join('')+[...points.values()].filter(p=>allocated.has(p.id)&&valid(p)).map(p=>`<circle cx="${p.x*60}" cy="${-p.y*60}" r="7" fill="none" stroke="#ad4794" stroke-width="4"><title>后端分配资源 ${esc(p.id)}</title></circle>`).join('');
    const plan=motion.navPath?.frame==='map'&&motion.navPath.fresh===true?(motion.navPath.poses||[]).filter(valid):[];
    const execution=r.executed?.frame==='map'?(r.executed.samples||[]).filter(p=>p.frame==='map'&&valid(p)).slice(-200):[];
    const truth=includeVehiclePoses&&motion.groundTruthPose?.frame==='map'&&motion.groundTruthPose.fresh===true&&valid(motion.groundTruthPose)?motion.groundTruthPose:null;
    return `<g pointer-events="none">${allocation}${plan.length?`<polyline points="${plan.map(xy).join(' ')}" fill="none" stroke="#bd7c15" stroke-width="3" stroke-dasharray="7 5"><title>Nav2 计划读回，不是已执行轨迹</title></polyline>`:''}${execution.length?`<polyline points="${execution.map(xy).join(' ')}" fill="none" stroke="#346bc2" stroke-width="3"><title>AMCL 估计轨迹，不是真值</title></polyline>`:''}${truth?`<circle cx="${truth.x*60}" cy="${-truth.y*60}" r="5" fill="#218153"><title>实际仿真真值反馈</title></circle>`:''}</g>`;
  }
  const workerSource=run=>run.observation?.worker?.robots?.[run.robotId||run.command?.command?.robotId]||run.observation?.worker;
  const vehicleColor=(run,index=0)=>{const id=run.robotId||run.command?.command?.robotId||'';return /02$/.test(id)?'#cd6322':/01$/.test(id)?'#346bc2':index===1?'#cd6322':'#346bc2';};
  function sharedHTML(runs=[]){
    if(!runs.length)return '<p class="release-notice">共享资源观察尚未取得；空列表不证明无冲突或已释放。</p>';
    return `<section class="run-shared"><h3>共享区 · 后端资源证据</h3>${runs.map(run=>{const o=run.observation||{},r=o.resources||{},waiting=r.waiting;return `<div><strong>${esc(run.vehicleName||run.robotId||run.command?.command?.robotId||'车辆未知')}</strong><p>资源源 ${esc(r.source?.name||'未提供')} · ${esc(r.source?.observedAt||'时间未提供')} · ${r.source?.sourceAgeSeconds!=null?esc(r.source.sourceAgeSeconds)+' 秒前':'资源源龄未知'}；运动源 ${esc(age(workerSource(run)?.observedAt))}${run.completion?.settled?' · 历史封存':''}</p><p>共享块：${Array.isArray(r.blocks)&&r.blocks.length?r.blocks.map(b=>`${esc(b.id)} · owners ${esc(resources(b.owners))} · 成员 ${esc(resources(b.members))}`).join('；'):'未提供权威块归属；不推断释放'}</p><p>等待：${waiting?.state==='waiting'?`后端已观察到资源冲突 · owners ${esc(resources(waiting.owners))} · 请求 ${esc(resources(waiting.requestedResources))} · 冲突 ${esc(resources(waiting.conflictingResources))}`:waiting?.state==='not_observed'?'当前源未观察到等待（不等于无冲突）':'未知 / 源未提供'}。</p></div>`;}).join('')}<p>释放须核对连续的实际 owners 变化与等待车后续分配；空资源列表、计划路线和停止位置均不单独证明释放。</p></section>`;
  }
  function latestBlocks(runs=[]){
    const blocks=new Map();
    for(const run of runs){const o=run.observation||{},times=[o.resources?.source?.observedAt,o.observedAt].map(value=>Date.parse(value)).filter(Number.isFinite),time=times[0];
      for(const block of o.resources?.blocks||[]){const previous=blocks.get(block.id),candidate={block,run,time,uncertain:o.status==='UNKNOWN'||!Number.isFinite(time)};if(candidate.uncertain||!previous||!previous.uncertain&&time>previous.time)blocks.set(block.id,candidate);}
    }
    return [...blocks.values()];
  }
  function liveRunsForRelease(runs=[],releaseId){return releaseId?runs.filter(run=>run&&run.releaseId===releaseId&&!terminal(run)):[];}
  function pairMapOverlay(runs=[],model={},includeVehiclePoses=true){
    const shared=latestBlocks(runs).map(({block:b,run,uncertain})=>{const point=(model.points||[]).find(p=>(b.members||[]).includes(p.id));if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return '';return `<g pointer-events="none"><circle cx="${point.x*60}" cy="${-point.y*60}" r="15" fill="none" stroke="#ad4794" stroke-width="3"/><text x="${point.x*60+18}" y="${-point.y*60+20}" fill="#873776" font-size="12">${esc(b.id)} · ${run.completion?.settled?'历史观察 · ':''}${uncertain?'归属待核':Array.isArray(b.owners)&&!b.owners.length?'该次占用报告为空':'占用车辆 '+esc(resources(b.owners))}</text><title>按源时间选择最后读回；空列表不证明实时释放</title></g>`;}).join('');
    return shared+runs.map((run,i)=>{const color=vehicleColor(run,i),id=run.vehicleName||run.robotId||run.command?.command?.robotId||'车辆未知',o=run.observation||{},pose=includeVehiclePoses?o.motion?.estimatedPose:null;return `<g data-vehicle="${esc(id)}"><title>${esc(id)} · 源 ${esc(age(workerSource(run)?.observedAt||o.observedAt))}${run.completion?.settled?' · 历史封存':''}</title>${o.status==='UNKNOWN'?'':mapOverlay(o,model,includeVehiclePoses).replaceAll('#346bc2',color)}${o.status!=='UNKNOWN'&&pose?.frame==='map'&&pose.fresh===true&&Number.isFinite(pose.x)&&Number.isFinite(pose.y)?`<circle cx="${pose.x*60}" cy="${-pose.y*60}" r="7" fill="${color}"/><text x="${pose.x*60+10}" y="${-pose.y*60-10}" fill="${color}" font-size="13">${esc(id)}</text>`:''}</g>`;}).join('');
  }
  function operationsHTML(state,diagnostics=false){
    if(state.authorized===false)return '<div class="release-heading"><h2>当前作业</h2></div><p>操作员登录后可查看任务详情。</p>';
    if(!state.status&&!state.observedRuns.length&&!state.run)return '<div class="release-heading"><h2>当前作业</h2></div><p>运行记录尚未读取，当前任务情况未知。</p>';
    const allRuns=state.observedRuns.length?state.observedRuns:[state.run].filter(Boolean),releaseId=state.status?.currentAdmission?.releaseId,runs=releaseId?allRuns.filter(run=>run.releaseId===releaseId):allRuns,otherRuns=allRuns.filter(run=>!runs.includes(run)),blocks=latestBlocks(runs),sealed=runs.length&&runs.every(run=>run.completion?.settled===true||run.sessionClosure?.status==='COMPLETED');
    if(!state.historyPreview&&allRuns.length&&(!releaseId||runs.every(run=>run.completion?.settled||run.sessionClosure?.status==='COMPLETED')))return '<div class="release-heading"><h2>当前作业</h2><a href="#/simulation">配置验证任务</a></div><p>当前没有可核验的活动任务。历史结果已保留。</p><details class="run-history-details"><summary>查看最后运行记录</summary>'+operationsHTML({...state,historyPreview:true},diagnostics)+'</details>';
    const cards=runs.map((run,i)=>{const o=run.observation||{},v=o.vehicle||{},r=o.resources||{},w=r.waiting,identity=run.vehicleName||run.robotId||run.command?.command?.robotId||'车辆未知';return `<article class="run-vehicle-card" style="--vehicle-color:${vehicleColor(run,i)}"><h3>${esc(identity)} ${run.completion?.settled?'<small class="run-history-tag">历史封存 · 非实时</small>':state.status?.currentAdmission?.releaseId&&run.releaseId!==state.status.currentAdmission.releaseId?'<small class="run-history-tag">其他版本观察 · 非当前</small>':''}<span>${esc(run.sessionClosure?.status==='COMPLETED'?'故障会话已结案，未成功到站':o.status==='UNKNOWN'?'观察中断 / UNKNOWN':run.completion?.confirmed?'到站停稳已核实':labels[run.state]||run.state||'未知')}</span></h3><p>位置 ${esc(v.currentPosition||v.position||'未提供')} → ${esc(routeLabel(run,'destinationLabel',run.command?.command?.destination||'目的站未提供'))}</p><p>运动观察 ${esc(age(workerSource(run)?.observedAt))}${run.completion?.settled?' · 历史封存':''}</p><p>${w?.state==='waiting'?`等待路权 · 占用车辆 ${esc(resources(w.owners))}`:w?.state==='not_observed'?'当前源未观察到等待':'等待状态未知'} · 资源观察 ${r.source?.sourceAgeSeconds!=null?esc(r.source.sourceAgeSeconds)+' 秒前':'年龄未知'}</p></article>`;}).join('');
    return `<div class="release-heading"><h2>RTS · 车辆与共享区</h2><a href="#/simulation">实验与完整运行记录</a></div>${state.error?`<p role="alert" class="release-error">读取失败：${esc(state.error)}；下方保留最后观察。</p>`:''}<div class="run-vehicle-grid">${cards||'<p>当前版本尚无任务运行记录；车辆是否就绪请核对车辆与连接。</p>'}</div>${otherRuns.length?'<details class="run-history-details"><summary>其他版本的历史任务（'+otherRuns.length+'）</summary><p>这些记录不代表当前车辆状态，请到仿真工作台的运行历史中查看。</p></details>':''}<div class="run-shared run-shared-compact"><strong>共享区${sealed?' · 最后观察 / 历史封存':''}</strong> ${blocks.map(({block:b,run,time,uncertain})=>`<span>${esc(b.id)} · ${uncertain?'归属待核（观察中断或源时间未提供 / 无效）':`${run.completion?.settled?'历史读回 · ':''}${Array.isArray(b.owners)&&!b.owners.length?'该次占用报告为空（不证明实时释放）':'占用车辆 '+esc(resources(b.owners))} · ${esc(age(new Date(time).toISOString()))}`}</span>`).join('；')||'归属未知；未提供权威读回'}</div><p class="run-map-key">地图：金虚线＝当前计划；紫＝已分配资源；蓝 LAB-01 / 橙 LAB-02＝AMCL 估计轨迹；绿＝仿真真值。计划、分配、执行分别核对；缺失不补画。</p><details data-rts-details><summary>共享区与运行源证据</summary>${diagnostics?`<p>空资源不证明释放或无冲突；此处仅为有界摘要，完整证据在服务端分页保留。</p><pre>${esc(JSON.stringify(runs.slice(0,2).map(run=>diagnosticSummary(run)),null,2))}</pre>`:''}</details>`;
  }
  class Controller {
    constructor(api,options={}) {
      this.api=api;this.scope=api.receiptSnapshot().scope;this.storage=options.storage;
      if(!this.storage)try{this.storage=root.localStorage;}catch(_){/* Report storage failure below. */}
      this.key='fleet-sim-run.v1:'+this.scope;this.onChange=options.onChange||(()=>{});
      this.lock=options.lock || (fn=>root.navigator?.locks?.request?root.navigator.locks.request('fleet-sim-run:'+this.scope,fn):Promise.reject(Error('当前来源不支持跨页面请求锁，仅可查询。')));
      this.viewRunId=null;this.state={run:null,runs:[],observedRuns:[],vehicles:[],targetId:null,capabilities:[],status:null,layout:null,robotId:null,fresh:false,busy:false,error:'',notice:'',pending:null};
      try{this.state.pending=this.read();}catch(e){this.state.error=e.message;this.storageFailed=true;}
    }
    read(){const p=JSON.parse(this.storage.getItem(this.key)||'null');if(p&&(p.scope!==this.scope||!/^[-A-Za-z0-9_.:]{1,128}$/.test(p.runId)))throw Error('运行恢复索引无效，请保留记录并核对原运行。');return p;}
    save(p){try{const previous=this.read();p={...p,vehicles:{...(previous?.vehicles||{}),...(previous?.robotId?{[previous.robotId]:{scope:previous.scope,runId:previous.runId,requestId:previous.requestId,robotId:previous.robotId}}:{}),...(p.robotId?{[p.robotId]:{scope:p.scope,runId:p.runId,requestId:p.requestId,robotId:p.robotId}}:{})}};this.storage.setItem(this.key,JSON.stringify(p));this.state.pending=p;}catch(_){this.storageFailed=true;throw Error('无法保存运行身份，未提交运行。');}}
    emit(){this.onChange(this.state);}
    updateBlocker({includeStored=true}={}){
      const s=this.state;
      if(s.busy)return '单次任务操作正在处理，请在“虚拟实验 → 单次任务与车辆处理”核对本次操作后再更新。';
      if(!includeStored)return '';
      const ids=[...new Set([s.pending?.runId,...Object.values(s.pending?.vehicles||{}).map(p=>p.runId)].filter(Boolean))];
      for(const id of ids){const run=[s.run,...s.observedRuns,...s.runs].find(r=>r?.runId===id);if(!terminal(run))return '原单次任务仍待核对，请到“虚拟实验 → 单次任务与车辆处理 → 运行历史与恢复”读取原运行；已受理不代表已收尾。';}
      return '';
    }
    requireRead(){if(!this.api.authorized)throw Error('请先登录操作员会话，再读取实验。');}
    async act(fn){if(this.state.busy)return;this.state.busy=true;this.state.error='';this.emit();try{if(this.reading)await this.reading;return await fn();}catch(e){this.state.error=e.message;throw e;}finally{this.state.busy=false;this.emit();}}
    async readAct(fn){if(this.state.busy||this.state.refreshing)return;this.state.refreshing=true;this.state.error='';this.emit();const work=(async()=>{try{return await fn();}catch(e){this.state.error=e.message;throw e;}finally{this.state.refreshing=false;this.emit();}})();this.reading=work;try{return await work;}finally{if(this.reading===work)this.reading=null;}}
    async refresh(){
      this.requireRead();this.state.fresh=false;
      const [status,layout,catalog]=await Promise.all([this.api.request('sim-publishing/status'),this.api.request('layout'),this.api.request('sim-runs')]);
      if(!Array.isArray(catalog?.runs))throw Error('运行目录响应不完整，请重新读取；尚不能确认没有记录。');
      this.state.status=status;this.state.layout=layout;this.state.runs=catalog.runs||[];this.state.targetId=catalog.targetId||'p0-sim';this.state.capabilities=Array.isArray(catalog.capabilities)?catalog.capabilities:[];
      this.state.occupancy=catalog.occupancy;
      this.state.vehicles=status.vehicles||catalog.vehicles||((catalog.robotIds||[catalog.robotId]).filter(Boolean).map(robotId=>({robotId,ready:!catalog.robotIds})));
      if(!this.state.vehicles.some(v=>v.robotId===this.state.robotId))this.state.robotId=this.state.vehicles[0]?.robotId||null;
      if(!this.storageFailed)this.state.pending=this.read();
      const id=this.viewRunId||this.state.pending?.vehicles?.[this.state.robotId]?.runId||(!this.state.pending?.robotId||this.state.pending.robotId===this.state.robotId?this.state.pending?.runId:null)||this.state.run?.runId||this.state.runs.find(r=>(r.robotId||r.command?.command?.robotId)===this.state.robotId)?.runId;
      const selectedRun=id?await this.query(id):null;
      const latest=new Map();for(const r of this.state.runs){const robotId=r.robotId||r.command?.command?.robotId;if(robotId&&!latest.has(robotId))latest.set(robotId,r.runId);}
      for(const p of Object.values(this.state.pending?.vehicles||{}))if(!latest.has(p.robotId))latest.set(p.robotId,p.runId);
      this.state.observedRuns=await Promise.all([...new Set(latest.values())].map(async runId=>{if(selectedRun?.runId===runId)return selectedRun;try{return await this.api.request('sim-runs/'+encodeURIComponent(runId));}catch(error){return {runId,state:'UNKNOWN',robotId:[...latest].find(([,id])=>id===runId)?.[0],observation:{errors:[error.message]}};}}));
      this.state.fresh=true;this.emit();
    }
    async inspect(id){
      const run=await this.query(id),robotId=run.robotId||run.command?.command?.robotId;
      this.viewRunId=id;
      if(robotId)this.state.robotId=robotId;
      this.emit();return run;
    }
    selectRobot(robotId){this.viewRunId=null;this.state.robotId=robotId;this.state.run=this.state.observedRuns.find(r=>(r.robotId||r.command?.command?.robotId)===robotId)||null;this.state.recoveryCheck=null;}
    async query(id){this.requireRead();const run=await this.api.request('sim-runs/'+encodeURIComponent(id));if(run.runId!==id)throw Error('运行响应身份不匹配，请查询原运行。');this.state.run=run;this.emit();
      // Feed recovery into the shared command ledger; this is a GET, never a retry.
      if(this.api.queryReceipt)for(const requestId of [run.command?.requestId,run.cancellation?.command?.requestId,run.recovery?.command?.requestId,run.motionControl?.command?.requestId,run.activeCancellation?.command?.requestId].filter(Boolean))await this.api.queryReceipt(requestId);
      return run;}
    blocked(robotId=this.state.robotId){
      const s=this.state,a=s.status?.currentAdmission,p=s.status?.activePublication;
      if(this.storageFailed)return '运行身份存储不可用。';
      if(!s.fresh)return '请读取当前版本与实验记录。';
      if(!s.status?.enabled||!s.status.targets?.some(t=>t.id===s.targetId&&['p0-sim','p0-pair'].includes(t.id)&&t.environment==='SIM'&&t.isolation))return '隔离仿真目标尚未配置。';
      if(a?.ready!==true||!a.releaseId||p?.status!=='READY'||p.releaseId!==a.releaseId)return '当前发布尚未通过实时准入，请到地图与发布核对。';
      if(!robotId)return '服务端尚未提供本实验车辆身份。';
      if(!s.vehicles.some(v=>v.robotId===robotId&&v.ready===true))return '所选车辆尚未通过实时就绪核对。';
      if(s.pending&&(!s.pending.robotId||s.pending.robotId===robotId)&&s.pending.runId!==s.run?.runId)return '存在待恢复的运行，请查询原运行。';
      if([s.run,...s.observedRuns,...s.runs].some(r=>r&&!terminal(r)&&(r.robotId||r.command?.command?.robotId||(s.vehicles.length===1?robotId:null))===robotId))return '所选车辆当前运行尚未结束，请查询原运行。';
      return this.api.receiptSnapshot().writeBlockedReason||null;
    }
    occupiedDestination(destination, robotId=this.state.robotId){
      const s=this.state;
      if(!s.fresh||!s.occupancy||s.occupancy.releaseId!==s.status?.currentAdmission?.releaseId)return '';
      const own=s.vehicles.find(v=>v.robotId===robotId)?.vehicleName||robotId;
      const peers=(s.occupancy?.owners?.[destination]||[]).filter(name=>name!==own);
      return peers.length?`目的站当前由 ${peers.join('、')} 占用或预留。请选择空闲站点，或等该车离站并释放站点。`:'';
    }
    async start(destination,robotId=this.state.robotId){
      this.requireRead();return this.lock(async()=>{
        this.viewRunId=null;if(robotId)this.state.robotId=robotId;await this.refresh();robotId=robotId||this.state.robotId;const reason=this.blocked(robotId);if(reason)throw Error(reason);
        if(!this.state.layout?.points?.some(p=>p.destination===destination))throw Error('请选择当前配置的目的站。');
        const occupied=this.occupiedDestination(destination,robotId);if(occupied)throw Error(occupied);
        const runId=this.api.id(),requestId=this.api.id(),s=this.state;
        this.save({scope:this.scope,runId,requestId,robotId});this.viewRunId=null;
        s.notice='运行身份已保存；结果未知时仅查询原运行，刷新不会重新发单。';
        await this.api.command({type:'create_order',robotId,destination},requestId,async command=>{
          const run=await this.api.request('sim-runs',{runId,publicationId:s.status.activePublication.requestId,releaseId:s.status.currentAdmission.releaseId,command});
          if(run.runId!==runId)throw Error('运行响应身份不匹配；请查询原运行。');s.run=run;this.emit();return run.receipt;
        });
        return this.query(runId);
      });
    }
    async reviewRecovery(){
      this.requireRead();const id=this.state.run?.runId;if(!id)throw Error('请先读取原运行。');
      if(authoredRoute(this.state.run,this.state.status)){this.state.recoveryCheck=null;throw Error(authoredRecoveryNote);}
      this.state.recoveryCheck=await this.api.request('sim-runs/'+encodeURIComponent(id)+'/recovery-check');this.emit();return this.state.recoveryCheck;
    }
    async finishStopped(){
      this.requireRead();const run=this.state.run,check=this.state.recoveryCheck;
      if(authoredRoute(run,this.state.status)){this.state.recoveryCheck=null;throw Error(authoredRecoveryNote);}
      if(!run||!check?.allowed||check.runId!==run.runId)throw Error('请先核对原任务的持续停稳与故障证据。');
      const prior=this.api.receiptSnapshot().records?.find(r=>r.envelope?.command?.type==='finish_stopped_run'&&r.envelope.command.runId===run.runId);
      const requestId=run.recovery?.command?.requestId||prior?.envelope.requestId||this.api.id();
      const op={type:'finish_stopped_run',runId:run.runId,orderId:run.orderId,robotId:run.robotId,releaseId:run.releaseId,sourceId:run.sourceId};
      await this.api.command(op,requestId,async command=>{
        const next=await this.api.request('sim-runs/'+encodeURIComponent(run.runId)+'/finish-stopped',command);
        if(next.runId!==run.runId)throw Error('故障任务收尾响应身份不匹配。');this.state.run=next;this.emit();return next.recovery?.receipt;
      });
      this.state.recoveryCheck=null;return this.query(run.runId);
    }
    async control(type,expectedIdentity){
      this.requireRead();
      const run=this.state.run;
      if(!run?.orderId||terminal(run)||expectedIdentity!==runIdentity(run))throw Error('原任务已变化，请重新核对车辆与目的站。');
      if(!currentRuns(this.state).some(current=>current.runId===run.runId))throw Error('请先选择当前仿真任务。');
      const immediate=type==='cancel_order',field=immediate?'activeCancellation':'motionControl';
      const op=immediate?{type,orderId:run.orderId}:{type,robotId:robotOf(run)};
      const id=this.api.id();
      try{
        await this.api.command(op,id,async command=>{
          const next=await this.api.request('sim-runs/'+encodeURIComponent(run.runId)+(immediate?'/cancel-active':'/motion'),command);
          if(next.runId!==run.runId)throw Error('操作响应身份不匹配，请查询原回执。');
          this.state.run=next;this.emit();return next.lastControlRequest?.receipt||next[field]?.receipt;
        });
      }catch(error){
        if(this.state.run?.lastControlRequest?.receipt?.status==='REJECTED')throw Error(this.state.run.lastControlRequest.receipt.error?.message||'调度拒绝了此操作。');
        throw error;
      }
      return this.query(run.runId);
    }
    async cancel(expectedIdentity){
      this.requireRead();const run=this.state.run;if(!run?.orderId||terminal(run))throw Error('当前没有可申请取消的活动任务。');
      if(expectedIdentity!==undefined&&expectedIdentity!==runIdentity(run))throw Error('当前任务已变化，请重新审阅要撤销的原任务。');
      const id=run.cancellation?.command?.requestId||this.api.id();
      await this.api.command({type:'cancel_order',orderId:run.orderId},id,async command=>{
        const next=await this.api.request('sim-runs/'+encodeURIComponent(run.runId)+'/cancel',command);
        if(next.runId!==run.runId)throw Error('取消响应运行身份不匹配。');this.state.run=next;this.emit();return next.cancellation?.receipt;
      });
      this.state.notice='正常撤单请求已核对；已下发动作可能继续，停稳另行核实。请分别查看任务与执行环境反馈。';
      return this.query(run.runId);
    }
  }
  function diagnosticSummary(run={}) {
    const text=value=>value&&typeof value==='object'?'复合字段（摘要未展开）':typeof value==='string'&&value.length>160?value.slice(0,160)+'…（摘要截取）':value;
    const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,text(value[k])]));
    const list=(values,project=text,max=12)=>Array.isArray(values)?{total:values.length,shown:values.slice(0,max).map(project)}:values==null?'未提供':text(values);
    const names=value=>Array.isArray(value)?list(value,v=>Array.isArray(v)?list(v,text):typeof v==='object'?pick(v,['name','id','path','pathName','destinationPoint']):text(v)):value==null?'未提供':text(value);
    const resourcesSummary=r=>({planned:list(r?.planned,route=>({stepCount:route?.steps?.length??route?.route?.steps?.length??null,steps:list(route?.steps||route?.route?.steps,step=>pick(step,['path','pathName','sourcePoint','destinationPoint']))})),allocated:names(r?.allocated),claimed:names(r?.claimed),executed:pick(r?.executed,['source','frame','sampleCount','windowLimit','currentSampleFresh']),trajectoryWindowCount:r?.executed?.samples?.length??null,blocks:list(r?.blocks,b=>({...pick(b,['id','type']),owners:names(b.owners),memberCount:b.members?.length??null,members:names(b.members)})),waiting:{...pick(r?.waiting,['state','sourceAgeSeconds']),owners:names(r?.waiting?.owners),requestedResources:names(r?.waiting?.requestedResources)},source:pick(r?.source,['name','observedAt','sourceAgeSeconds','ageUnavailableReason'])});
    const bridgeSummary=b=>({...pick(b,['serialNumber','timestamp','headerId','orderId','orderUpdateId','lastNodeId','lastNodeSequenceId','driving','paused']),safety:pick(b?.safetyState,['eStop','fieldViolation']),position:pick(b?.agvPosition,['mapId','positionInitialized','x','y','theta']),actions:list(b?.actionStates,a=>pick(a,['actionId','actionType','actionStatus'])),errors:list(b?.errors,e=>pick(e,['errorType','errorLevel']))});
    const robotSummary=r=>({...pick(r,['sourceId','observedAt','sourceAgeSeconds','ready','navReady','stationary','simTime']),blockers:list(r?.blockers),odom:pick(r?.odom,['vx','wz','wallAge','simAge']),navigation:{...pick(r?.navigation,['ready','observedAtUnix']),tf:pick(r?.navigation?.tf,['available','stamp','simTime','simAge']),states:Object.fromEntries(Object.entries(r?.navigation?.states||{}).slice(0,8).map(([k,v])=>[text(k),pick(v,['id','label','wallAge'])]))},bridge:bridgeSummary(r?.mqtt?.state?.value),bridgeSource:pick(r?.mqtt?.state,['receivedAtUnix','wallAge'])});
    const o=run.observation||{},c=run.completion||{},worker=o.worker||{},physical=c.closurePhysicalEvidence||{};
    return {summaryOnly:true,run:pick(run,['runId','robotId','vehicleName','orderId','publicationId','releaseId','sourceId','robotSourceId','state']),observedAt:o.observedAt,observationStatus:o.status,errors:list(o.errors),completion:{...pick(c,['orderFinished','stationary','atDestination','noActiveOrder','confirmed','settled','stationarySince','lastStationarySourceTimestamp','stationarySamples','sustainedStationary','closurePriorCompletedRunId']),physical:{...pick(physical,['confirmed','sourceTimestamp','newCancelOrderFinished']),bridge:bridgeSummary(physical.bridgeState)}},worker:{...pick(worker,['sourceId','observedAt','sourceAgeSeconds','ready']),robots:Object.fromEntries(Object.entries(worker.robots||{single:worker}).slice(0,2).map(([id,r])=>[text(id),robotSummary(r)]))},vehicle:pick(o.vehicle,['name','state','procState','currentPosition','transportOrder']),resources:resourcesSummary(o.resources),lastTrustedObservation:run.lastTrustedObservation?{observedAt:run.lastTrustedObservation.observedAt,resources:resourcesSummary(run.lastTrustedObservation.resources)}:null,evidence:{total:run.evidenceWindow?.total??run.evidence?.length??null,recent:(run.evidence||[]).slice(-10).map(e=>({...pick(e,['sequence','kind','observedAt','source','sourceTimestamp']),state:text(e.payload?.state),completion:pick(e.payload?.completion,['confirmed','settled','stationary','stationarySamples'])}))}};
  }
  function emptyRunText(context={},catalog=false){
    if(context.authorized===false)return '请使用页面顶部“操作员登录”后读取运行记录。';
    if(context.refreshing||context.busy)return '正在核对版本与运行记录，请稍候；尚未确认是否有任务。';
    if(context.error)return '运行记录读取或核对失败，尚不能确认是否有任务。请点击“读取版本与运行”重试。';
    if(context.fresh!==true)return '运行记录尚未读取，当前任务情况未知。请点击“读取版本与运行”。';
    if(catalog)return '已读取服务端运行目录，当前没有记录。';
    if(!context.robotId)return '已读取当前版本，尚未选择可核对的车辆。请先选择车辆。';
    return '已读取所选车辆的运行记录，当前没有记录。请先核对版本与车辆准入，再选择目的站并明确执行。';
  }
  function runHTML(run,diagnostics=false,context={}){
    if(!run)return '<p class="release-notice">'+emptyRunText(context)+'</p>';
    if(run.sessionClosure?.status==='COMPLETED')return `<div class="run-status"><strong>${run.sessionClosure.reason==='ISOLATED_SIM_FORCE_RESET'?'仿真会话已复位 · 到站未核实':'仿真故障会话已结案 · 未成功到站'}</strong></div><h3>${esc(run.vehicleName||run.robotId)} · ${esc(routeLabel(run,'destinationLabel','原目的站'))}</h3><p>仿真计算已关闭，旧虚拟车辆已禁用，调度资源已释放。原失败、撤单和运动证据保留在运行复盘；没有恢复或重放任务。</p><details><summary>结案依据</summary><pre>${esc(JSON.stringify(run.sessionClosure,null,2))}</pre></details>`;
    const o=run.observation||{},v=o.vehicle||{},r=o.resources||{},sealed=run.completion?.settled===true,positionAge=(Date.now()-Date.parse(o.observedAt))/1000,positionFresh=o.status==='TRUSTED'&&Number.isFinite(positionAge)&&positionAge>=0&&positionAge<=5;
    return `<div class="run-status"><strong>${esc(!sealed&&o.status==='UNKNOWN'?'状态待核对':run.motionControl?.feedback?.status==='CONFIRMED'&&run.motionControl.feedback.paused?'原任务已暂停':!sealed&&o.admission?.ready===false?'运行准入受阻':run.completion?.confirmed===true?'到站与持续停稳已核实':r.waiting?.state==='waiting'?'等待通行':labels[run.state]||run.state||'未知')}</strong><span>${sealed?(run.completion?.confirmed?"完成时网关观察":"收尾时网关观察"):"网关读取"}：${esc(age(o.observedAt))}</span></div>${!sealed&&o.status==='UNKNOWN'?`<p role="alert" class="release-error">观察中断 / UNKNOWN：车辆反馈中断、过期或来源尚未核实，请查看车辆状态并处理原任务。原运行、命令和资源历史保留；不会自动重发或恢复准入。</p>${run.lastTrustedObservation?`<details data-last-trusted><summary>最后可信资源观察（历史，不证明当前归属或释放）</summary><p>观察时间 ${esc(run.lastTrustedObservation.observedAt||'未提供')}</p><pre>${esc(JSON.stringify(diagnosticSummary(run).lastTrustedObservation,null,2))}</pre></details>`:''}`:''}${!sealed&&o.status==='TRUSTED'&&o.admission?.ready===false&&run.motionControl?.feedback?.paused!==true?`<p class="release-notice">观察已恢复，故障 / 准入仍阻断。请查看车辆状态并核对原任务；不会自动恢复行驶。</p>`:''}${sealed?'<p class="release-notice">本次运行的收尾证据已封存。下列停稳、到站、资源与运动数据均为封存时的观察；任务是否成功仍以到站完成结论为准，当前准入见开始区域。</p>':''}${root.MotionPresetUI?.recordedHTML(run.motionPreset||run.binding?.motionPreset)||""}<div class="run-operation-summary"><h3>${esc(run.vehicleName||run.robotId||'车辆')} · ${esc(routeLabel(run,'originLabel',run.startPoint||'起点未记录'))} → ${esc(routeLabel(run,'destinationLabel',run.command?.command?.destination||'目的站待核对'))}</h3><p>${sealed?'收尾时位置':positionFresh&&v.currentPosition?'当前位置':'当前位置待核对'}${sealed||positionFresh&&v.currentPosition?' '+esc(v.currentPosition||'未记录'):''}</p><p>${o.status==='UNKNOWN'?'反馈中断，暂不确认车辆状态':run.motionControl?.feedback?.status==='CONFIRMED'&&run.motionControl.feedback.paused?'原任务已暂停，车辆持续停稳':o.admission?.ready===false?'运行准入受阻，请核对车辆反馈':!sealed&&['FAILED','WITHDRAWN','CANCELLED'].includes(run.state)?'任务未成功，停稳与收尾待核对':r.waiting?.state==='waiting'?'等待通行':sealed?(run.completion?.confirmed?'已到站并停稳':'任务已失败收尾，车辆停稳已核对'):'正在执行 / 观察中'}</p></div><details class="run-reference"><summary>任务凭据与核对详情</summary><dl class="release-facts"><dt>运行 ID</dt><dd>${esc(run.runId)}</dd><dt>车辆</dt><dd>${esc(run.vehicleName||run.robotId||run.command?.command?.robotId||'未提供')}</dd><dt>地图版本</dt><dd>${esc(run.releaseId)}</dd><dt>导航任务</dt><dd>${esc(run.orderId||'尚未取得')}</dd><dt>目的站</dt><dd>${esc(run.command?.command?.destination||'未提供')}</dd><dt>发单回执</dt><dd>${esc(run.command?.requestId||'未提供')} · ${esc(run.receipt?.status||'尚待核对')}</dd><dt>执行环境源观察</dt><dd>${esc(workerSource(run)?.observedAt||"未提供")} · ${esc(age(workerSource(run)?.observedAt))}</dd><dt>任务内核状态</dt><dd>${esc(run.order?.state||'尚未取得')}</dd><dt>执行环境停稳</dt><dd>${sealed?(run.completion?.confirmed?'完成时的停稳证据（已封存）':'收尾时的停稳证据（已封存）'):run.completion?.stationary===true?'新鲜反馈报告停稳':run.completion?.stationary===false?'报告未停稳':'尚无新鲜停稳证据'} · ${run.completion?.sustainedStationary===true?'持续停稳已核实':'持续停稳待核实'}</dd><dt>到站核对</dt><dd>${run.completion?.atDestination===true?'报告位于目的站':'尚未核实到站'} · ${run.completion?.noActiveOrder===true?'无活动任务':'活动任务清理待核实'}</dd><dt>独占控制归属</dt><dd>以共享资源 owners 后端读回为准；空列表不证明独占或无冲突</dd><dt>车辆处理状态</dt><dd>${esc(v.procState||v.processingState||'未提供')} · 适配器 ${esc(v.adapterEnabled===true?'已启用':v.adapterEnabled===false?'未启用':'未提供')} · 处理任务 ${esc(v.transportOrder||'未提供')}</dd></dl></details><details class="run-reference"><summary>路线与通行依据</summary><div class="run-resources" aria-label="资源读回">${[['planned','计划路线'],['claimed','声明资源'],['allocated','分配资源'],['executed','已执行轨迹']].map(([key,title])=>`<div><strong>${title}</strong><p>${esc(resources(r[key]))}</p></div>`).join('')}</div>${sharedHTML([run])}</details>${motionHTML(o).replaceAll('#346bc2',vehicleColor(run)).replaceAll('蓝线','车辆色线')}${run.completion?.closurePriorCompletedRunId?`<p class="release-notice">失败收尾核对关联此前已完成运行 ${esc(run.completion.closurePriorCompletedRunId)} 的保留执行标识；不证明本运行已执行或成功到站。</p>`:''}${run.recovery?`<p class="release-notice">故障任务收尾回执：${esc(run.recovery.command?.requestId)} · ${esc(run.recovery.receipt?.status||'待核对')}。受理不等于车载取消、资源释放或任务收尾；故障不会自动解除。</p>`:''}${run.cancellation?`<p class="release-notice">取消回执：${esc(run.cancellation.command?.requestId)} · ${esc(run.cancellation.receipt?.status||'待核对')}。正常撤单，已下发动作可能继续，停稳另行核实；取消受理不等于车辆停稳。</p>`:''}<details data-run-details><summary>诊断与源证据</summary>${diagnostics?`<p>仅展示有界诊断摘要与最近 10 条证据索引，不是完整原始证据；完整证据仍在服务端分页保留。总记录 ${esc(run.evidenceWindow?.total??run.evidence?.length??'未提供')} 条。</p><pre>${esc(JSON.stringify(diagnosticSummary(run),null,2))}</pre>`:''}</details>`;
  }
  function mount(container,api,options={}){
    if(!container)return null;
    let destination='',reviewCancel=false,lastAuthorized=false,pausedReads=false;
    const controller=new Controller(api,{...options,onChange:()=>render()});
    const act=fn=>controller.act(fn).catch(()=>{}),read=fn=>controller.readAct(fn).catch(()=>{});
    function render(force=false){
      const focused=root.document?.activeElement;
      if(!force&&!controller.state.busy&&container.contains?.(focused)&&['runVehicle','runDestination'].includes(focused?.id))return;
      const s=controller.state,auth=!!(api.authorized),blocked=controller.occupiedDestination(destination)||controller.blocked(),open=container.querySelector('[data-run-details]')?.open;
      if(reviewCancel&&(!auth||terminal(s.run)||reviewCancel.identity!==runIdentity(s.run)||reviewCancel.scope!==api.scope||reviewCancel.keyRevision!==api.keyRevision))reviewCancel=false;
      const expanded=new Set(Array.from(container.querySelectorAll?.('details')||[]).filter(d=>d.open).map(d=>d.querySelector?.('summary')?.textContent));
      container.innerHTML=`<div class="release-heading"><h2>单次任务 · 车辆操作</h2><button type="button" data-run-action="refresh" ${!auth||s.busy?'disabled':''}>读取版本与运行</button></div><p>选择车辆和目的站后明确执行。每车已有任务必须先完成或处理；撤单受理不代表车辆已经停稳。</p>${!auth?'<p class="release-notice">请使用页面顶部“操作员登录”。</p>':''}${s.error?`<p role="alert" class="release-error">${esc(s.error)}</p>`:''}${s.notice?`<p role="status" class="release-notice">${esc(s.notice)}</p>`:''}<div class="release-columns"><section><h3>1. 核对并开始</h3><details><summary>当前版本依据</summary><p>${esc(s.status?.currentAdmission?.releaseId||'等待读取')}</p></details><p>当前准入：${s.fresh&&s.status?.currentAdmission?.ready===true?'后端允许':'尚未核实 / 已阻断'}</p><label for="runVehicle">车辆<select id="runVehicle" ${s.busy?'disabled':''}><option value="">请选择车辆</option>${s.vehicles.map(v=>`<option value="${esc(v.robotId)}" ${v.robotId===s.robotId?'selected':''}>${esc(v.vehicleName||v.robotId)} · ${v.ready===true?'就绪':'未就绪'}</option>`).join('')}</select></label><label for="runDestination">目的站<select id="runDestination" ${s.busy?'disabled':''}><option value="">请选择当前配置的目的站</option>${(s.layout?.points||[]).filter(p=>p.destination).map(p=>`<option value="${esc(p.destination)}" ${p.destination===destination?'selected':''}>${esc(p.name||p.id||p.destination)}</option>`).join('')}</select></label><button type="button" data-run-action="start" ${!auth||s.busy||blocked||!destination?'disabled':''}>执行单次任务</button>${blocked?`<p class="release-notice">${esc(blocked)}</p>`:''}<details class="run-history-details"><summary>运行历史与恢复</summary><p>刷新与第二个标签页只读取原运行，不会自动重新提交。</p>${s.pending?`<details><summary>恢复凭据</summary><p>保留运行：${esc(s.pending.runId)}</p></details>`:''}<ul class="run-history">${s.runs.map(r=>`<li><button type="button" data-run-query="${esc(r.runId)}" ${s.busy?'disabled':''}>${esc(r.vehicleName||r.robotId||r.command?.command?.robotId||'车辆未知')} · ${esc(labels[r.state]||r.state)} · ${esc(r.createdAt?new Date(r.createdAt).toLocaleString():'历史记录')}</button><button type="button" data-run-replay="${esc(r.runId)}" ${s.busy?'disabled':''}>运行复盘</button></li>`).join('')||'<li>'+emptyRunText({...s,authorized:auth},true)+'</li>'}</ul></details></section><section><h3>2. 当前任务与核对</h3>${activeControlHTML(s,auth,api.receiptSnapshot().canWrite,reviewCancel)}${runHTML(s.run,open,{...s,authorized:auth})}${s.run?controlResultHTML(s.run):''}${s.run?.orderId&&!terminal(s.run)&&!s.run.activeCancellation?`<div class="release-actions"><button type="button" data-run-action="cancel-review" ${!auth||s.busy||!api.receiptSnapshot().canWrite?'disabled':''}>申请正常撤单</button></div>${reviewCancel&&!reviewCancel.action?`<p class="release-notice">将撤销车辆 ${esc(s.run.vehicleName||s.run.robotId||s.run.command?.command?.robotId||'车辆未知')} 前往 ${esc(routeLabel(s.run,'destinationLabel',s.run.command?.command?.destination||'原目的站'))} 的这次任务。已下发动作可能继续，停稳另行核实。</p><button type="button" data-run-action="cancel" ${!auth||s.busy||!api.receiptSnapshot().canWrite?'disabled':''}>确认提交正常撤单</button>`:''}`:''}${authoredRecoveryHTML(s.run,s.status)}${s.targetId==='p0-pair'&&s.run?.orderId&&!terminal(s.run)&&!authoredRoute(s.run,s.status)?`<button type="button" data-run-action="recovery-review" ${!auth||s.busy||s.run.recovery?'disabled':''}>结束已停稳的故障任务</button>${s.recoveryCheck?.runId===s.run.runId?`<div class="release-notice"><p>车辆 ${esc(s.run.vehicleName||s.run.robotId)} · ${esc(s.run.command?.command?.destination||'原任务')}（当前待处理任务）</p><p>持续停稳：${Object.entries(s.recoveryCheck.stops||{}).map(([id,stop])=>esc(id)+' '+(stop.sustained?'已核实':'待核实')).join('；')}</p><p>仍锁存故障：${esc((s.recoveryCheck.robotBlockers||[]).join('；'))}；保留资源：${esc(resources(s.recoveryCheck.resources?.allocated))}</p><p>这不是急停；受理后仍须核对车载取消、停稳及任务收尾。不会清除故障或自动恢复行驶。</p><details><summary>停稳核对详情</summary><pre>${esc(JSON.stringify({summaryOnly:true,runId:s.recoveryCheck.runId,orderId:s.recoveryCheck.orderId,observedAt:s.recoveryCheck.observedAt,allowed:s.recoveryCheck.allowed,blockers:s.recoveryCheck.blockers,stops:s.recoveryCheck.stops,resources:diagnosticSummary({observation:{resources:s.recoveryCheck.resources}}).resources},null,2))}</pre></details>${s.recoveryCheck.allowed?`<button type="button" data-run-action="finish-stopped" ${s.busy?'disabled':''}>确认结束原故障任务</button>`:`<p>暂不可操作：${esc((s.recoveryCheck.blockers||[]).join('；'))}</p>`}</div>`:''}`:''}<a href="#/events">查看统一命令回执</a></section></div>`;
      for(const d of container.querySelectorAll?.('details')||[])if(expanded.has(d.querySelector?.('summary')?.textContent))d.open=true;
      if(open){const d=container.querySelector('[data-run-details]');if(d)d.open=true;}
      if(container.contains?.(focused)===false&&focused?.tagName==='SUMMARY'){
        Array.from(container.querySelectorAll?.('summary')||[]).find(el=>el.textContent===focused.textContent)?.focus?.({preventScroll:true});
      }
      for(const attr of ['runAction','runQuery','runReplay','runCurrent'])if(focused?.dataset?.[attr]){
        Array.from(container.querySelectorAll?.('button')||[]).find(el=>el.dataset?.[attr]===focused.dataset[attr])?.focus?.({preventScroll:true});
      }
      container.querySelector('[data-run-details]')?.addEventListener('toggle',e=>{if(e.target.open&&!e.target.querySelector('pre'))render();});
      container.querySelector('#runVehicle')?.addEventListener('change',e=>{controller.selectRobot(e.target.value);s.recoveryCheck=null;s.run=s.observedRuns.find(r=>(r.robotId||r.command?.command?.robotId)===s.robotId)||null;reviewCancel=false;render(true);read(()=>controller.refresh());});
      container.querySelector('#runDestination')?.addEventListener('change',e=>{destination=e.target.value;render(true);});
      container.querySelectorAll('[data-run-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.runAction;if(a==='refresh')read(()=>controller.refresh());if(a==='start')act(()=>controller.start(destination));if(a==='recovery-review')act(()=>controller.reviewRecovery());if(a==='finish-stopped')act(()=>controller.finishStopped());if(a==='cancel-review'){reviewCancel=reviewCancel&&!reviewCancel.action?false:{identity:runIdentity(s.run),scope:api.scope,keyRevision:api.keyRevision};render();}if(a==='pause'||a==='resume'){const identity=runIdentity(s.run),scope=api.scope,revision=api.keyRevision;act(()=>{if(scope!==api.scope||revision!==api.keyRevision)throw Error('控制连接已变化，请重新核对原任务。');return controller.control(a,identity);});}if(a==='stop-cancel-review'){reviewCancel=reviewCancel?.action==='stop-cancel'?false:{action:'stop-cancel',identity:runIdentity(s.run),scope:api.scope,keyRevision:api.keyRevision};render();}if(a==='cancel'||a==='stop-cancel'){const reviewed=reviewCancel;reviewCancel=false;if(!reviewed)return;act(()=>{if(reviewed.scope!==api.scope||reviewed.keyRevision!==api.keyRevision)throw Error('控制连接已变化，请重新审阅原任务。');return a==='stop-cancel'?controller.control('cancel_order',reviewed.identity):controller.cancel(reviewed.identity);});}if(a==='reset-link')root.document?.getElementById('sim-force-reset')?.scrollIntoView({block:'center'});}));
      container.querySelectorAll('[data-run-replay]').forEach(b=>b.addEventListener('click',()=>options.onReplay?.({kind:'run',id:b.dataset.runReplay})));
      container.querySelectorAll('[data-run-current]').forEach(b=>b.addEventListener('click',()=>{reviewCancel=false;act(()=>controller.inspect(b.dataset.runCurrent));}));
      container.querySelectorAll('[data-run-query]').forEach(b=>b.addEventListener('click',()=>{reviewCancel=false;act(()=>controller.inspect(b.dataset.runQuery));}));
      if(options.operations){const opened=options.operations.querySelector('[data-rts-details]')?.open;options.operations.innerHTML=operationsHTML({...s,authorized:auth},opened);if(opened){const d=options.operations.querySelector('[data-rts-details]');if(d)d.open=true;}options.operations.querySelector('[data-rts-details]')?.addEventListener('toggle',e=>{if(e.target.open&&!e.target.querySelector('pre'))render();});}
      if(!s.busy&&['runVehicle','runDestination'].includes(focused?.id))container.querySelector('#'+focused.id)?.focus?.({preventScroll:true});
      options.onState?.(s);
    }
    const storageListener=e=>{if(e.key===controller.key||e.key===null){try{controller.state.pending=controller.read();if(api.authorized&&!pausedReads)read(()=>controller.refresh());else render();}catch(error){controller.state.error=error.message;render();}}};
    root.addEventListener?.('storage',storageListener);
    const timer=root.setInterval?.(()=>{if(!pausedReads&&api.authorized&&!controller.state.busy)read(()=>controller.refresh());},5000);
    render();return {controller,render,setReadPaused(value){const previous=pausedReads;pausedReads=!!value;if(previous&&!pausedReads&&api.authorized){controller.state.fresh=false;read(()=>controller.refresh());}},authorizationChanged(){const a=!!(api.authorized);if(a!==lastAuthorized){lastAuthorized=a;render();if(a&&!pausedReads)read(()=>controller.refresh());}},destroy(){root.clearInterval?.(timer);root.removeEventListener?.('storage',storageListener);container.replaceChildren();options.operations?.replaceChildren();}};
  }
  root.SimulationRunUI={Controller,mount,resources,runHTML,motionHTML,mapOverlay,pairMapOverlay,liveRunsForRelease,sharedHTML,operationsHTML,terminal,runIdentity,emptyRunText};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.SimulationRunUI;
})(globalThis);
