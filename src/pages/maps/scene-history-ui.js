(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
  const authorized=api=>!!(api.authorized&&api.deploymentConfirmed);
  const identity=api=>[api.apiBase,api.scope,api.deploymentId,api.keyRevision,api.authorized,api.deploymentConfirmed];
  const same=(a,b)=>!!a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const time=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString():'未记录';
  function storageScope(api){
    // Keep credentials, query strings and arbitrary scope contents out of storage.
    let url;try{url=new URL(api.apiBase||api.scope||'/api/v1/',root.location?.origin||'http://localhost');}catch(_){url=new URL('http://unknown-target/');}
    let deployment=api.deploymentId||'';
    if(!deployment){try{deployment=new URL(api.scope).hash.match(/(?:#|&)deployment=([^&]+)/)?.[1]||'';}catch(_){}}
    return url.origin+url.pathname+'|deployment='+deployment;
  }
  const array=v=>Array.isArray(v)?v:[];
  const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?v.map(stable):Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]))):v;
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  const get=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
  const format=v=>v===undefined||v===null?'未记录':typeof v==='object'?JSON.stringify(stable(v)):String(v);
  const groupFields={
    site:[['x','位置 X'],['y','位置 Y'],['width','宽度'],['depth','进深']],
    walls:[['name','名称'],['start.x','起点 X'],['start.y','起点 Y'],['end.x','终点 X'],['end.y','终点 Y'],['thickness','厚度'],['height','高度']],
    obstacles:[['name','名称'],['templateId','设备类型'],['x','位置 X'],['y','位置 Y'],['width','宽度'],['depth','进深'],['height','高度'],['yaw','朝向（弧度）']],
    points:[['name','名称'],['x','位置 X'],['y','位置 Y']],
    paths:[['name','名称'],['sourcePointId','起点'],['targetPointId','终点'],['direction','通行方向'],['maxVelocity','最高速度']],
    stations:[['name','名称'],['pointId','关联点位'],['yaw','朝向（弧度）']],
    spawns:[['pointId','起始点位'],['yaw','起始朝向（弧度）']]
  };
  const labels={walls:'墙体',obstacles:'设备与障碍',points:'点位',paths:'路线',stations:'停车工位',spawns:'车辆起点'};
  const workcellFields=[
    ['workcell.templateId','规划类型'],['workcell.footprint.x','中心 X（m）'],['workcell.footprint.y','中心 Y（m）'],
    ['workcell.footprint.yaw','轮廓朝向（弧度）'],['workcell.footprint.width','宽度（m）'],['workcell.footprint.depth','深度（m）'],
    ['workcell.table.clearHeight','桌底净高（m）'],['workcell.table.topThickness','桌面厚度（m）'],['workcell.table.legWidth','桌腿宽度（m）'],
    ['workcell.terminal.x','立牌 X（m）'],['workcell.terminal.y','立牌 Y（m）'],['workcell.terminal.yaw','立牌朝向（弧度）'],
    ['workcell.terminal.height','立牌安装高度（m）'],['workcell.terminal.tagId','Tag 编号'],['workcell.terminal.buttonId','按钮编号'],
  ];
  const planName=id=>root.SceneWorkcellModel?.labels[id]||({'buffer-v1':'缓冲位','lift-table-v1':'高桌载台'})[id]||'普通停车位';
  function pointName(scene,id){return array(scene?.navigation?.points).find(p=>p.id===id)?.name||'未命名点位';}
  function fieldValue(scene,key,value){
    if(['pointId','sourcePointId','targetPointId'].includes(key))return value?pointName(scene,value):'未记录';
    if(key==='direction')return ({bidirectional:'双向',forward:'单向',unidirectional:'单向'})[value]||'方向依据见原始记录';
    if(key==='templateId')return ({'equipment-box-v1':'设备箱体','rect-column-v1':'立柱','bumper-v1':'防撞挡块'})[value]||'设备类型依据见原始记录';
    if(key==='workcell.templateId')return planName(value);
    return format(value);
  }
  function compareScenes(before,after){
    const changes=[];
    const changedFields=(a,b,fields)=>fields.filter(([key])=>!equal(get(a,key),get(b,key))).map(([key,label])=>({key,label,before:get(a,key),after:get(b,key)}));
    if(before?.name!==after?.name)changes.push({kind:'scene',action:'changed',name:'场景名称',text:`场景名称：${format(before?.name)} → ${format(after?.name)}`});
    if(!equal(before?.site??null,after?.site??null)){
      const fields=changedFields(before?.site,after?.site,groupFields.site);
      changes.push({kind:'site',action:!before?.site?'added':!after?.site?'removed':'changed',name:'场地',fields,text:!before?.site?'新增场地':!after?.site?'移除场地':`场地：${fields.map(f=>`${f.label} ${format(f.before)} → ${format(f.after)}`).join('；')}`});
    }
    for(const kind of Object.keys(labels)){
      const items=s=>array(['walls','obstacles'].includes(kind)?s?.[kind]:s?.navigation?.[kind]);
      const key=o=>kind==='spawns'?(o.id||o.vehicleName||o.robotId):o.id;
      const old=new Map(items(before).map(o=>[key(o),o])),next=new Map(items(after).map(o=>[key(o),o]));
      for(const id of [...new Set([...old.keys(),...next.keys()])].sort()){
        const a=old.get(id),b=next.get(id),name=b?.name||a?.name||(kind==='spawns'?((b||a)?.vehicleName||(b||a)?.robotId):'未命名对象');
        if(!a||!b){const action=a?'removed':'added';changes.push({kind,id,action,name,text:`${a?'移除':'新增'}${labels[kind]}「${name}」`});continue;}
        const fields=changedFields(a,b,groupFields[kind]);
        if(kind==='stations'){
          if(a.workcell&&b.workcell)fields.push(...changedFields(a,b,workcellFields));
          else if(a.workcell||b.workcell)fields.push(...changedFields(a,b,workcellFields.slice(0,1)));
        }
        if(fields.length)changes.push({kind,id,action:'changed',name,fields,text:`${labels[kind]}「${name}」：${fields.map(f=>`${f.label} ${fieldValue(before,f.key,f.before)} → ${fieldValue(after,f.key,f.after)}${['pointId','sourcePointId','targetPointId'].includes(f.key)&&fieldValue(before,f.key,f.before)===fieldValue(after,f.key,f.after)?'（关联对象已更换）':''}`).join('；')}`});
      }
    }
    return changes;
  }
  class Controller{
    constructor(api,options={}){
      this.api=api;this.onChange=options.onChange||(()=>{});try{this.storage=options.storage===undefined?root.sessionStorage:options.storage;}catch(_){this.storage=null;}
      this.visible=false;this.destroyed=false;this.sceneId=null;this.tab='versions';this.context=identity(api);this.sequence=0;this.scope=storageScope(api);this.reset();
    }
    reset(){this.history=null;this.revision=null;this.compareFrom=null;this.compareTo=null;this.snapshots=new Map();this.loading=false;this.previewLoading=false;this.error='';this.previewError='';}
    emit(){if(!this.destroyed)this.onChange(this);}
    storageKey(){return 'fleet-scene-history.v1:'+encodeURIComponent(this.scope)+':'+this.sceneId;}
    restore(){try{const v=JSON.parse(this.storage?.getItem(this.storageKey())||'null');if(v?.version===1)for(const field of ['revision','compareFrom','compareTo'])if(Number.isInteger(v[field])&&v[field]>0)this[field]=v[field];}catch(_){}}
    persist(){try{this.storage?.setItem(this.storageKey(),JSON.stringify({version:1,revision:this.revision,compareFrom:this.compareFrom,compareTo:this.compareTo}));}catch(_){}}
    sync(){
      const context=identity(this.api);if(same(this.context,context))return false;
      this.context=context;this.sequence++;this.scope=storageScope(this.api);this.reset();this.restore();this.emit();return true;
    }
    current(c){return !this.destroyed&&this.visible&&authorized(this.api)&&c.sequence===this.sequence&&c.sceneId===this.sceneId&&same(c.context,identity(this.api));}
    capture(){return {sequence:this.sequence,sceneId:this.sceneId,context:identity(this.api)};}
    async selectScene(id){
      this.sync();id=validId(id)?id:null;
      if(id===this.sceneId){if(this.visible&&!this.history&&!this.loading)return this.refresh();return;}
      this.sequence++;this.sceneId=id;this.reset();if(id)this.restore();this.emit();if(this.visible&&id)return this.refresh();
    }
    async setVisible(value){
      const entered=!!value&&!this.visible;this.visible=!!value;const changed=this.sync();
      if(!this.visible){this.sequence++;this.loading=false;this.previewLoading=false;this.emit();return;}
      if(entered||changed){if(this.history){if(this.tab==='revisions')return this.loadSnapshots();this.emit();return;}return this.refresh();}
    }
    authorizationChanged(){const changed=this.sync();if(!authorized(this.api)){this.sequence++;this.reset();this.emit();return;}if(changed&&this.visible&&this.sceneId)return this.refresh();}
    async refresh(){
      this.sync();if(this.destroyed||!this.visible||!authorized(this.api)||!this.sceneId)return;
      this.sequence++;const c=this.capture();this.history=null;this.snapshots.clear();this.loading=true;this.previewLoading=false;this.error='';this.previewError='';this.emit();
      try{
        const v=await this.api.request('map-workspace/scenes/'+encodeURIComponent(this.sceneId)+'/history');if(!this.current(c)){this.sync();return;}
        if(v?.sceneId!==this.sceneId||(v.name!==null&&typeof v.name!=='string')||(v.headRevision!==null&&(!Number.isInteger(v.headRevision)||v.headRevision<1))||!Array.isArray(v.revisions)||!v.revisions.length||v.revisions.some(r=>!record(r)||!Number.isInteger(r.revision)||r.revision<1||(v.headRevision!==null&&r.revision>v.headRevision))||new Set(v.revisions.map(r=>r.revision)).size!==v.revisions.length||!Array.isArray(v.generations)||v.generations.some(r=>!record(r))||!Array.isArray(v.versions)||!Array.isArray(v.coverage)||v.coverage.some(x=>typeof x!=='string')||v.versions.some(r=>!record(r)||!validId(r.releaseId)||!Array.isArray(r.runs)||r.runs.some(x=>!record(x))||!Array.isArray(r.publications)||r.publications.some(x=>!record(x))))throw Error('invalid history');
        this.history=v;
        const revisions=v.revisions.map(r=>r.revision).sort((a,b)=>a-b),has=n=>revisions.includes(n);
        if(!has(this.revision))this.revision=revisions.at(-1);if(!has(this.compareTo))this.compareTo=this.revision;if(!has(this.compareFrom))this.compareFrom=revisions.at(-2)||revisions[0];this.persist();
      }catch(e){if(this.current(c))this.error=[401,403].includes(e.status)?'场景历史查询权限已失效，请重新验证访问密钥。':'此场景历史暂时无法读取，请核对权限与连接后刷新。';}
      finally{if(this.current(c)){this.loading=false;this.emit();}}
      if(this.current(c)&&this.history&&this.tab==='revisions')await this.loadSnapshots();
    }
    selectTab(tab){if(!['versions','revisions'].includes(tab))return;this.sync();this.tab=tab;this.emit();if(tab==='revisions'&&this.history)return this.loadSnapshots();}
    async selectRevision(value){this.sync();if(!this.history?.revisions.some(r=>r.revision===Number(value)))return;this.revision=Number(value);this.persist();return this.loadSnapshots();}
    async selectCompare(from,to){this.sync();if(![from,to].every(n=>this.history?.revisions.some(r=>r.revision===Number(n))))return;this.compareFrom=Number(from);this.compareTo=Number(to);this.persist();return this.loadSnapshots();}
    async loadSnapshots(){
      if(!this.visible||!authorized(this.api)||!this.history||this.destroyed)return;
      this.sequence++;const c=this.capture();this.previewLoading=true;this.previewError='';this.emit();
      const wanted=[...new Set([this.revision,this.compareFrom,this.compareTo])];
      const results=await Promise.allSettled(wanted.map(async n=>{
        if(this.snapshots.has(n))return;
        const v=await this.api.request('map-workspace/scenes/'+encodeURIComponent(this.sceneId)+'/revisions/'+n);
        if(!this.current(c))return;
        if(v?.id!==this.sceneId||v.revision!==n||v.scene?.frame!=='map'||v.scene?.unit!=='m'||typeof v.scene?.name!=='string'||!Array.isArray(v.scene.walls)||!Array.isArray(v.scene.obstacles))throw Error('snapshot mismatch');
        this.snapshots.set(n,v);
      }));
      if(!this.current(c)){this.sync();return;}
      if(results.some(r=>r.status==='rejected'))this.previewError='部分历史修订未能读取或身份不符；未读取的内容不参与预览与比较。请刷新重试。';
      this.previewLoading=false;this.emit();
    }
    destroy(){this.destroyed=true;this.sequence++;this.reset();}
  }
  const publicationStatus=p=>({READY:'发布核对曾完成，当前可用性另查',RETIRED:'已停用（历史记录）',REJECTED:'发布未通过',UNKNOWN:'发布结果待核对',RETIRING:'停用处理中（历史记录）',PREFLIGHT:'发布条件检查中（历史记录）',PUBLISHING:'发布处理中（历史记录）',KERNEL_VERIFIED:'调度模型曾核对',WORKER_APPLYING:'仿真加载中（历史记录）',WAITING_WORKER:'等待车辆（历史记录）'})[p.status]||'发布进度未完整记录';
  const runStatus=r=>({CLOSED:'故障会话已结案，未成功到站',SUCCEEDED:'成功（服务端记录）',FAILED:'未成功',UNKNOWN:'结果待核实',ACTIVE:'进行中（历史记录）',ACCEPTED:'已受理，执行结果待核实',REJECTED:'未受理'})[r.outcome]||({FINISHED:'订单已结束，实际结果另查',WITHDRAWN:'订单已撤回，停稳另查',EXECUTING:'执行中（历史记录）',DISPATCHING:'派发中（历史记录）',UNROUTABLE:'无可用路线'})[r.state]||'运行结果待核实';
  function evidence(value,label='查看原始依据'){return `<details class="scene-history-evidence"><summary>${label}</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`;}
  function motion(p){if(!p)return '运行模型未记录';const id=typeof p==='string'?p:p.id;return ({'acceptance-v1':'工况验收档','development-v1':'快速开发档'})[id]||(typeof p==='object'&&(p.name||p.label))||'运行模型已记录，参数见详情';}
  function summary(s){return s?`场地 ${esc(s.width??'未记录')} × ${esc(s.depth??'未记录')} m · 墙体 ${esc(s.walls??'未记录')} · 障碍 ${esc(s.obstacles??'未记录')} · 点位 ${esc(s.points??'未记录')} · 路线 ${esc(s.paths??'未记录')} · 停车工位 ${esc(s.stations??'未记录')} · 车辆起点 ${esc(s.spawns??'未记录')}`:'几何数量未记录';}
  function historicalSVG(scene,preview){
    if(!preview)return '<p>二维预览组件尚未载入。</p>';
    const svg=preview(scene),site=scene?.site;if(!site)return svg;
    const size=Math.max(site.width,site.depth),points=new Map(array(scene.navigation?.points).map(p=>[p.id,p]));
    const spawn=array(scene.navigation?.spawns).map(s=>{const p=points.get(s.pointId);if(!p||![p.x,p.y,s.yaw,size].every(Number.isFinite)||size<=0)return '';const r=size*.018;return `<g><title>${esc(s.vehicleName||s.robotId||'车辆起点')}</title><circle cx="${p.x}" cy="${-p.y}" r="${r}" fill="#d68631"/><line x1="${p.x}" y1="${-p.y}" x2="${p.x+2*r*Math.cos(s.yaw)}" y2="${-p.y-2*r*Math.sin(s.yaw)}" stroke="#7c4615" stroke-width="${r*.3}"/></g>`;}).join('');
    return svg.replace(/<\/svg>\s*$/,spawn+'</svg>');
  }
  function contentHTML(c,options={}){
    if(!authorized(c.api))return '<p class="scene-history-empty">请先验证当前服务器权限，再查看场景历史。</p>';
    if(!c.sceneId)return '<p class="scene-history-empty">选择场景后，可查看已保存修订、生成版本与关联运行。</p>';
    if(c.error)return `<p class="scene-history-error" role="alert">${esc(c.error)}</p>`;
    if(!c.history)return `<p class="scene-history-empty" role="status">${c.loading?'正在读取所选场景历史…':'准备读取场景历史…'}</p>`;
    const h=c.history,choices=selected=>h.revisions.slice().sort((a,b)=>b.revision-a.revision).map(r=>`<option value="${r.revision}" ${r.revision===selected?'selected':''}>修订 ${r.revision} · ${esc(r.name||'未命名场景')} · ${esc(time(r.updatedAt))}</option>`).join('');
    const selected=h.revisions.find(r=>r.revision===c.revision),snapshot=c.snapshots.get(c.revision),before=c.snapshots.get(c.compareFrom),after=c.snapshots.get(c.compareTo),changes=before&&after?compareScenes(before.scene,after.scene):null;
    const previews=[['比较前',c.compareFrom,before],['比较后',c.compareTo,after]];
    return `<div class="scene-history-tabs" role="tablist" aria-label="场景档案内容"><button type="button" class="button" role="tab" aria-selected="${c.tab==='versions'}" data-scene-history-tab="versions">版本与运行</button><button type="button" class="button" role="tab" aria-selected="${c.tab==='revisions'}" data-scene-history-tab="revisions">修订与差异</button></div><section role="tabpanel" aria-label="修订与差异" ${c.tab==='revisions'?'':'hidden'}><div class="scene-history-controls"><label>查看保存修订<select data-scene-history-revision>${choices(c.revision)}</select></label>${h.headRevision!==null?`<a class="button" href="scene-builder.html?sceneId=${esc(c.sceneId)}">编辑最新草稿</a>`:''}</div><p class="scene-history-note">${h.headRevision===null?'当前草稿缺失，仅保留修订历史。':`当前草稿「${esc(h.name)}」目录头为修订 ${h.headRevision}。`}历史修订只读；编辑入口始终读取服务器上的最新草稿。</p><h3>${esc(snapshot?.scene?.name||selected?.name||h.name||'未命名场景')} · 修订 ${c.revision}</h3><p>${summary(selected?.summary)}</p>${c.previewLoading?'<p role="status">正在读取历史修订预览与比较…</p>':''}${c.previewError?`<p class="scene-history-error" role="alert">${esc(c.previewError)}</p>`:''}<div class="scene-history-preview"><div class="scene-history-map">${snapshot?historicalSVG(snapshot.scene,options.previewSVG):'<p>所选修订尚未读取，暂无预览。</p>'}</div></div><p class="scene-history-note">已保存草稿的二维历史预览，非运行地图；深色为墙体与设备，蓝色为路线，绿色为停车工位，橙色为车辆起点及朝向。高度请看差异与原始依据；预览不代表车辆准入或净空通过。</p>${snapshot?evidence(snapshot,'查看此修订原始依据与警告'):''}<h3>比较两个保存修订</h3><div class="scene-history-controls"><label>比较前<select data-scene-history-compare-from>${choices(c.compareFrom)}</select></label><label>比较后<select data-scene-history-compare-to>${choices(c.compareTo)}</select></label></div><div class="scene-history-preview-grid">${previews.map(([title,n,v])=>`<section class="scene-history-preview"><h4>${title} · 修订 ${n}</h4><div class="scene-history-map">${v?historicalSVG(v.scene,options.previewSVG):'<p>修订内容未读取。</p>'}</div></section>`).join('')}</div><div class="scene-history-diff">${changes?changes.length?`<p>发现 ${changes.length} 项对象变化${changes.length>100?'，以下展示前 100 项；完整对比依据可在两份修订中查看':''}。</p><ul>${changes.slice(0,100).map(x=>`<li>${esc(x.text)}</li>`).join('')}</ul>`:'<p>所比较修订的名称、场地、墙体、设备与障碍、路线、停车工位和车辆起点未发现变化。</p>':'<p>两份修订均读取成功后才显示差异。</p>'}</div><p class="scene-history-note">按保存对象身份比较；仅列表顺序改变不计入差异。车辆起点按车辆身份比较。坐标与尺寸单位为 m，朝向为弧度，最高速度单位为 m/s。差异不判断实际可通行或当前运行状态。</p></section><section role="tabpanel" aria-label="版本与运行" ${c.tab==='versions'?'':'hidden'}><h3>确认版本与发布运行 · ${h.versions.length} 个版本</h3><ol class="scene-history-list">${h.versions.map((v,vi)=>`<li class="scene-history-item"><h4>${esc(v.sceneName||h.name)} · 修订 ${esc(v.sceneRevision)} 的确认版本</h4><p>创建：${esc(time(v.createdAt))} · ${esc(motion(v.motionPreset))}</p><p>发布 ${v.publications.length} 条 · 关联运行 ${v.runs.length} 条${options.onTasks?` <button type="button" class="button" data-scene-history-tasks="${vi}">查看此版本关联任务</button>`:''}</p><ul>${v.publications.map(p=>`<li>${esc(publicationStatus(p))} · 记录更新：${esc(time(p.updatedAt))}${evidence(p,'查看发布原始依据')}</li>`).join('')||'<li>尚未记录发布；确认版本不代表已发布。</li>'}</ul><ul>${v.runs.map((r,ri)=>`<li><strong>${esc(r.label||'关联车辆任务')}</strong> · ${esc(runStatus(r))}<p>创建：${esc(time(r.createdAt))}</p><div class="scene-history-controls">${options.onReplay&&r.runId?`<button type="button" class="button" data-scene-history-replay="${vi}:${ri}">复盘此任务</button>`:''}${options.onTasks&&r.runId?`<button type="button" class="button" data-scene-history-tasks="${vi}:${ri}">查看关联任务</button>`:''}</div>${evidence(r,'查看运行原始依据')}</li>`).join('')||'<li>当前记录范围内没有关联运行，不据此判断车辆是否运行过。</li>'}</ul>${evidence({...v,publications:undefined,runs:undefined},'查看版本原始依据')}</li>`).join('')||'<li class="scene-history-empty">当前记录范围内没有确认版本。</li>'}</ol><details class="scene-history-generations"><summary>生成记录 · ${h.generations.length} 条</summary><ol class="scene-history-list">${h.generations.map(g=>`<li class="scene-history-item"><h4>修订 ${esc(g.sceneRevision)} 的地图与仿真生成</h4><p>${esc(({READY:'生成曾完成',PREPARING:'生成处理中（历史记录）',REJECTED:'生成未通过',UNKNOWN:'生成结果待核对'})[g.status]||'生成状态未完整记录')} · ${esc(motion(g.motionPreset))}</p><p>创建：${esc(time(g.createdAt))} · ${g.releaseId?'已关联确认版本':'未记录关联确认版本'}</p>${evidence(g)}</li>`).join('')||'<li class="scene-history-empty">当前记录范围内没有生成记录。</li>'}</ol></details></section><div class="scene-history-note"><p>以上数量仅为当前部署接口返回的记录，不代表其他部署或未保留记录；历史发布与运行状态不能证明当前车辆可用、已停稳或到站。</p><details><summary>记录范围与空窗说明</summary><ul>${h.coverage.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>接口未提供额外覆盖范围说明；缺记录不视为未发生。</li>'}</ul></details></div>`;
  }
  function mount(container,api,options={}){
    container.innerHTML='<section class="scene-history" aria-label="所选场景历史"><div class="scene-history-heading"><div><h2>场景修订与运行沿革</h2><p class="scene-history-note">按所选场景回看保存内容、生成版本、发布与关联任务。</p></div><button type="button" class="button" data-scene-history-refresh>刷新历史</button></div><div data-scene-history-content></div></section>';
    const content=container.querySelector('[data-scene-history-content]'),refresh=container.querySelector('[data-scene-history-refresh]');
    const controller=new Controller(api,{...options,onChange:render});
    function render(c){refresh.disabled=!authorized(api)||!c.sceneId||c.loading;content.innerHTML=contentHTML(c,options);}
    const onChange=e=>{
      controller.authorizationChanged();if(!controller.visible||!authorized(api))return;
      if(e.target.matches?.('[data-scene-history-revision]'))void controller.selectRevision(e.target.value);
      if(e.target.matches?.('[data-scene-history-compare-from],[data-scene-history-compare-to]'))void controller.selectCompare(content.querySelector('[data-scene-history-compare-from]').value,content.querySelector('[data-scene-history-compare-to]').value);
    };
    const onClick=e=>{
      controller.authorizationChanged();if(!controller.visible||!authorized(api))return;
      const tab=e.target.closest?.('[data-scene-history-tab]');if(tab&&content.contains(tab)){void controller.selectTab(tab.dataset.sceneHistoryTab);return;}
      const button=e.target.closest?.('[data-scene-history-replay],[data-scene-history-tasks]');if(!button||!content.contains(button))return;
      const replay=button.dataset.sceneHistoryReplay,value=replay??button.dataset.sceneHistoryTasks;if(!/^\d+(?::\d+)?$/.test(value||''))return;
      const [vi,ri]=value.split(':').map(Number),version=controller.history?.versions[vi],run=ri===undefined?null:version?.runs[ri];if(!version)return;
      if(replay!==undefined&&run?.runId)options.onReplay?.({kind:'run',id:run.runId});
      else if(replay===undefined)options.onTasks?.({q:run?.runId||version.releaseId});
    };
    const onRefresh=()=>void controller.refresh();refresh.addEventListener('click',onRefresh);content.addEventListener('change',onChange);content.addEventListener('click',onClick);render(controller);
    return {controller,selectScene:id=>controller.selectScene(id),setVisible:value=>controller.setVisible(value),authorizationChanged:()=>controller.authorizationChanged(),destroy(){controller.destroy();refresh.removeEventListener('click',onRefresh);content.removeEventListener('change',onChange);content.removeEventListener('click',onClick);container.replaceChildren();}};
  }
  root.SceneHistoryUI={Controller,mount,compareScenes,contentHTML,historicalSVG};if(typeof module==='object'&&module.exports)module.exports=root.SceneHistoryUI;
})(typeof window==='undefined'?globalThis:window);



