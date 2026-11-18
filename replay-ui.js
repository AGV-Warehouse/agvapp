(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const finite=Number.isFinite;
  const timeOf=value=>Number(value?.timeSeconds);
  async function loadReplay(api,target,options={}){
    const execution=target.kind==='scenario'?await api.request('sim-scenarios/executions/'+encodeURIComponent(target.id),undefined,{signal:options.signal}):null;
    if(execution&&!Array.isArray(execution.recordedRunIds))throw Error('场景缺少可靠的已记录任务索引，未猜测或跳过记录。');
    const ids=execution?execution.recordedRunIds:[target.id],scenarioEvents=[];
    if(execution){
      if(!Number.isInteger(execution.evidenceThrough)||execution.evidenceThrough<0)throw Error('场景车辆记录未提供固定读取边界。');
      if(!ids.every(id=>execution.steps?.some(step=>step.runId===id&&step.runRecorded===true)))throw Error('场景已记录任务索引与步骤证据不一致。');
      if(!Number.isInteger(execution.eventsThrough)||execution.eventsThrough<0)throw Error('场景编排事件未提供固定读取边界。');
      let after=0,more=true;
      while(more){if(options.cancelled?.())throw Error('历史读取已取消。');const result=await api.request('sim-scenarios/executions/'+encodeURIComponent(target.id)+'/events?after='+after+'&limit=50&through='+execution.eventsThrough,undefined,{signal:options.signal});
        if(!Array.isArray(result.events)||!result.cursor||result.cursor.through!==execution.eventsThrough||result.cursor.after!==after||!Number.isInteger(result.cursor.nextAfter)||typeof result.cursor.hasMore!=='boolean'||result.events.some(event=>event.executionId!==execution.executionId||event.scope!=='SCENARIO_GATEWAY_RECORD'||event.sequence<=after||event.sequence>execution.eventsThrough))throw Error('编排事件来源或读取边界不一致。');
        for(const event of result.events||[]){const index=execution.steps?.findIndex(step=>step.stepId===event.stepId)??-1;scenarioEvents.push({...event,eventNamespace:'scenario',executionId:execution.executionId,displayTaskNumber:index>=0?index+1:null,robotId:index>=0?execution.steps[index].robotId:null,skippedTasks:execution.steps?.map((step,i)=>step.state==='SKIPPED'?i+1:null).filter(Boolean)||[],recordedAt:event.at,sourceTime:null});}
        more=result.cursor.hasMore;if(more&&!(result.cursor.nextAfter>after))throw Error('编排事件分页未前进。');after=result.cursor.nextAfter;
      }
    }
    target={...target,label:target.kind==='scenario'?(execution?.scenarioName||target.label):target.label,binding:execution||null,scenarioEvents,displaySteps:execution?.steps?.map((step,index)=>({taskNumber:index+1,robotId:step.robotId,destination:step.destination,state:step.state,controlPending:step.controlPending,runRecorded:step.runRecorded===true}))||target.displaySteps};
    const pages=[];let highwater=execution?.evidenceThrough;
    for(const id of [...new Set(ids)]){let after=0,through=highwater,more=true;while(more){if(options.cancelled?.())throw Error('历史读取已取消。');const query='sim-replay/runs/'+encodeURIComponent(id)+'?after='+after+'&limit=30'+(through===undefined?'':'&through='+through);const page=await api.request(query,undefined,{signal:options.signal});if(page.kind!=='HISTORICAL_REPLAY'||page.runId!==id||!page.cursor)throw Error('历史回放响应无效。');if(through===undefined){through=page.cursor.through;highwater=through;}else if(through!==page.cursor.through)throw Error('历史读取边界变化，未混合索引。');pages.push(page);more=page.cursor.hasMore;if(more&&!(page.cursor.nextAfter>after))throw Error('历史分页游标未前进。');after=page.cursor.nextAfter;}}
    if(options.cancelled?.())throw Error('历史读取已取消。');return normalizePages(pages,target);
  }
  function normalizePages(pages,target={}){
    if(['releaseId','releaseHash','sourceId','deploymentId','mapId','frame'].some(key=>new Set(pages.map(p=>p[key])).size>1||target.binding?.[key]!=null&&pages.some(page=>page[key]!==target.binding[key])))throw Error('历史记录来源或版本不一致，未合并回放。');
    const raw=pages.flatMap(p=>p.frames||[]).sort((a,b)=>Date.parse(a.recordedAt)-Date.parse(b.recordedAt)||a.sequence-b.sequence),events=[...pages.flatMap(p=>(p.events||[]).map(e=>({...e,eventNamespace:'run'}))),...(target.scenarioEvents||[])],times=[...raw,...events].map(v=>Date.parse(v.recordedAt)).filter(finite),start=times.length?times.reduce((value,t)=>Math.min(value,t),Infinity):0,history=new Map(),frames=[],frameContext=new Map(raw.map(frame=>[frame.runId+'|'+frame.sequence,frame])),runRobots=new Map(raw.filter(f=>f.robotId).map(f=>[f.runId,f.robotId]));
    for(const f of raw){const t=(Date.parse(f.recordedAt)-start)/1000;if(!finite(t))continue;
      const robots=Object.entries(f.robots||{});if(!robots.length)frames.push({...f,timeSeconds:t,sourceAvailable:false,isPrimary:true,lifecyclePrimary:true,errors:f.gapReasons||[],gap:true});
      for(const [name,robot] of robots){const id=robot.robotId||name,key=id+'|'+(robot.sourceId||''),old=history.get(key)||[];let samples=f.gap?[]:old;
        const p=robot.estimatedPose;if(!f.gap&&p?.fresh===true&&p.frame==='map'&&finite(p.x)&&finite(p.y)&&(!samples.length||samples.at(-1).stamp!==p.stamp))samples=[...samples,p].slice(-200);history.set(key,samples);
        frames.push({...f,primaryRobotId:f.robotId,robotId:id,timeSeconds:t,sourceTime:robot.sourceTime||f.sourceTime,stateTimestamp:robot.stateTimestamp,errors:f.gapReasons||[],sourceAvailable:!f.gap,estimatedPose:p,groundTruthPose:robot.groundTruthPose,plan:robot.plan,estimatedTrajectory:{frame:'map',samples},isPrimary:id===f.robotId||name===f.robotId||robot.vehicleName===f.robotId,lifecyclePrimary:id===f.robotId||name===f.robotId||robot.vehicleName===f.robotId,allocatedNames:id===f.robotId||name===f.robotId||robot.vehicleName===f.robotId?f.resources?.allocatedNames:undefined,resourceSource:id===f.robotId||name===f.robotId||robot.vehicleName===f.robotId?f.resources?.source:null});
      }
    }
    return {replayId:target.id,kind:target.kind,label:target.kind==='scenario'?(target.binding?.scenarioName||target.label||'方案名称未知'):(pages[0]?.vehicleName||pages[0]?.robotId||'车辆未知')+' → '+(pages[0]?.destination||'目的站未知'),motionPreset:pages[0]?.motionPreset||target.binding?.motionPreset,createdAt:target.kind==='scenario'?target.binding?.createdAt:pages[0]?.createdAt,displaySteps:target.displaySteps||[],runIds:[...new Set(pages.flatMap(p=>p.runIds||[p.runId]))],releaseId:pages[0]?.releaseId||target.binding?.releaseId,model:pages[0]?.model||{},timelineBasis:'gateway recordedAt; source times shown separately',frames,events:[...new Map(events.map(e=>[JSON.stringify([e.eventNamespace,e.executionId,e.runId,e.sequence,e.kind,e.recordedAt,e.label,e.details]),e])).values()].map(e=>({...e,observedAdmissionReady:frameContext.get(e.runId+'|'+e.sequence)?.admissionReady,observedRobots:frameContext.get(e.runId+'|'+e.sequence)?.robots,robotId:e.robotId||e.details?.robotId||runRobots.get(e.runId)||null,timeSeconds:(Date.parse(e.recordedAt)-start)/1000})).filter(e=>finite(e.timeSeconds)).sort((a,b)=>a.timeSeconds-b.timeSeconds||String(a.runId).localeCompare(String(b.runId))||a.sequence-b.sequence||String(a.kind).localeCompare(String(b.kind))),coverage:pages.map(p=>p.coverage),highwaters:pages.map(p=>p.cursor?.through)};
  }
  function eventLabel(event){
    const kind=(event.kind||'').toUpperCase(),d=event.details||{},who=event.robotId||d.robotId||'车辆',first=d.firstObserved||d.baseline?'首次记录到':'';
    if(event.eventNamespace==='scenario'){
      const labels={START_INTENT_RECORDED:'已记录本次方案开始意图，尚不代表已下发任务',START_REJECTED:'本次开始未获允许，未开始新作业',EXECUTION_STARTED:'操作员已明确开始方案',PAUSED_REVIEW:event.reason==='GATEWAY_RESTART_REVIEW_REQUIRED'?'服务重启，后续作业等待核对':'后续作业已暂停，先处理当前任务',UNSUBMITTED_STEPS_STOPPED:'操作员已停止剩余未开始作业，已下发任务仍需收尾',EXPLICITLY_CONTINUED:'操作员核对后继续后续作业',STEP_PREPARED:'正在准备一项任务',STEP_SUBMITTED:'已提交一项车辆任务，实际执行另行核对',STEP_SUCCEEDED:'一项任务已成功收尾',STEP_FAILED:'一项任务未成功，后续作业暂停',STEP_UNKNOWN:'一项任务结果待核对',STEP_OBSERVATION_UNCERTAIN:'一项任务反馈未核实，后续作业暂停',EXECUTION_COMPLETED:'方案内任务均已完成'};
      if(kind==='UNSUBMITTED_STEPS_STOPPED'&&event.skippedTasks?.length)return '任务 '+event.skippedTasks.join('、')+' 未执行（操作员停止剩余作业）；已下发任务仍需收尾';
      const label=labels[kind]||'方案编排记录';return event.displayTaskNumber?(who+' · 任务 '+event.displayTaskNumber+'：'+label.replace('一项任务','任务')):label;
    }
    if(kind==='CANCEL_REQUESTED')return who+' 已请求撤单，实际停稳待核实';
    if(kind==='CANCEL_RECEIPT')return who+(d.status==='REJECTED'?' 撤单未被接受，原任务仍需处理':d.status==='ACCEPTED'?' 撤单已受理，车辆停稳与任务收尾仍待核实':' 撤单结果待核对，不能认定车辆已停稳');
    if(kind.includes('RECOVERY'))return who+' 已请求结束已停稳的故障任务；等待车载取消及任务收尾，不代表恢复可执行';
    if(kind==='RESOURCE_OBSERVATION'){
      const waiting=d.waiting||{},owners=waiting.owners||[];
      if(waiting.state==='waiting')return who+' 等待通行'+(owners.length?'，交叉口由 '+owners.join('、')+' 占用':'，占用车辆尚未核实');
      const block=(d.blocks||[]).find(v=>v.id==='SHARED-CROSSING')||d.blocks?.[0];
      if(block&&Array.isArray(block.owners))return first+who+' 的通行资源记录：'+(block.owners.length?'交叉口占用车 '+block.owners.join('、'):'本次占用报告为空，不单独证明已释放');
      return who+' 的通行资源未提供完整归属，状态待核对';
    }
    if(kind==='RUN_CLOSURE_OBSERVED'){
      if(d.settled&&d.confirmed)return who+' '+first+'已到站并持续停稳，任务成功收尾';
      if(d.settled)return who+' '+first+'持续停稳已核实，任务未成功但已收尾';
      if(d.sustainedStationary)return who+' '+first+'持续停稳已核实，任务收尾仍待核对';
      return who+' 的实际停稳或任务收尾尚未核实';
    }
    if(kind==='PHYSICAL_MOTION_OBSERVED')return who+' '+first+(d.motionState==='MOVING'?'仍在运动，不能当作已经停稳':d.motionState==='STATIONARY'?'本次物理反馈停稳，持续停稳另行核对':'运动反馈未知，暂不确认停稳');
    if(kind==='OBSERVATION_STATUS'){const robot=Object.values(event.observedRobots||{}).find(value=>value.robotId===who||value.vehicleName===who);return who+(d.status==='TRUSTED'?(event.observedAdmissionReady===false?(robot?.paused||robot?.errors?.length?' 观察恢复，故障仍锁定，暂不能继续':' 观察恢复，但准入仍受阻，暂不能继续新作业'):' 的观察可核对；故障与是否可执行仍需单独检查'):' 的反馈中断或尚未核实，当前状态暂不确定');}
    if(kind==='ADMISSION_CHANGED')return who+(d.ready===true?' 当时的准入允许，后续执行仍需看任务状态':' 当时的准入受阻，不能据此继续新作业');
    if(kind==='BRIDGE_FAULT_STATE')return who+' '+first+(d.errors?.length||d.paused?'故障 / 暂停锁定，观察恢复也不能自动继续':'反馈未报告锁定故障，是否可执行仍须核对准入');
    if(kind==='VDA_ACTION_STATE'){
      const action=d.actionType==='cancelOrder'?'车载取消':d.actionType==='initPosition'?'定位初始化':d.actionType==='factsheetRequest'?'车辆资料核对':'车载动作';
      const status={FINISHED:'已确认完成',RUNNING:'仍在处理',FAILED:'处理失败',WAITING:'等待处理'}[d.actionStatus]||'状态待核对';
      return who+' '+first+action+status+(d.actionType==='cancelOrder'?'，任务收尾与资源仍需分别核对':d.baseline?'（历史起始基线，不表示此时刚执行）':'');
    }
    if(kind==='STATE_CHANGED')return who+(d.state==='FINISHED'?' 内核报告完成，实际到站与停稳需另行核对':d.state==='FAILED'?' 内核报告失败，实际停稳与收尾需另行核对':d.state==='WITHDRAWN'?' 内核已撤回任务，车辆未必已经停稳':d.state==='EXECUTING'?' 任务已进入执行，通行与运动反馈分别核对':' 任务状态已更新，具体车辆结果仍需核对');
    if(kind==='RUN_CREATED')return who+' 作业意图已记录，实际受理与执行另行核对';
    if(kind==='COMMAND_RECEIPT')return who+(d.status==='ACCEPTED'?' 的任务已受理，实际执行另行核对':' 的任务受理结果待核对');
    return /[\u3400-\u9fff]/.test(event.label||'')?event.label:who+' 的运行记录';
  }
  function keyEventGroup(event){
    const kind=event.kind||'',d=event.details||{};
    if(event.eventNamespace==='scenario')return ['PAUSED_REVIEW','EXPLICITLY_CONTINUED','UNSUBMITTED_STEPS_STOPPED','START_REJECTED','EXECUTION_STARTED','EXECUTION_COMPLETED'].includes(kind)?'方案暂停、继续与停止':null;
    if(kind.includes('CANCEL')||kind.includes('RECOVERY')||kind==='VDA_ACTION_STATE'&&d.actionType==='cancelOrder')return '撤单与故障任务处理';
    if(kind==='OBSERVATION_STATUS'&&(!d.baseline||d.status!=='TRUSTED'))return '反馈中断与恢复';
    if(kind==='BRIDGE_FAULT_STATE'&&(!d.baseline||d.paused||d.errors?.length))return '故障与锁定';
    if(kind==='SIM_SESSION_CLOSED')return '停稳与任务收尾';
    if(kind==='RUN_CLOSURE_OBSERVED'&&!d.baseline&&(d.sustainedStationary||d.settled||d.confirmed)||kind==='PHYSICAL_MOTION_OBSERVED'&&!d.baseline&&d.motionState==='STATIONARY')return '停稳与任务收尾';
    return null;
  }
  class Controller {
    constructor(onChange=()=>{}){this.onChange=onChange;this.data=null;this.time=0;this.playing=false;this.speed=1;this.layers={plan:true,allocated:true,estimated:true,truth:false};}
    load(data){
      if(!Array.isArray(data?.frames)||!Array.isArray(data?.events))throw Error('回放索引无效，未建立历史时间轴。');
      this.data={...data,frames:data.frames.filter(f=>finite(timeOf(f))).sort((a,b)=>timeOf(a)-timeOf(b)),events:data.events.filter(e=>finite(timeOf(e))).sort((a,b)=>timeOf(a)-timeOf(b))};
      this.duration=[...this.data.frames,...this.data.events].reduce((max,item)=>Math.max(max,timeOf(item)),0);this.time=0;this.playing=false;this.emit();
    }
    emit(){this.onChange(this);}
    seek(seconds){this.time=Math.max(0,Math.min(this.duration||0,Number(seconds)||0));this.emit();}
    toggle(){this.playing=!this.playing;this.emit();}
    tick(elapsed){if(!this.playing)return;this.time=Math.min(this.duration,this.time+Math.max(0,elapsed)*this.speed);if(this.time>=this.duration)this.playing=false;this.emit();}
    event(direction){const list=this.data?.events||[];const event=direction>0?list.find(e=>timeOf(e)>this.time+.001):[...list].reverse().find(e=>timeOf(e)<this.time-.001);if(event)this.seek(timeOf(event));}
    snapshots(){
      const latest=new Map(),resources=new Map(),finalRuns=new Map(),terminalRobots=new Map();
      for(const f of this.data?.frames||[]){if(f.lifecyclePrimary||f.isPrimary)finalRuns.set(f.runId,f);if(timeOf(f)>this.time)continue;const id=f.robotId||f.runId||'source';latest.set(id,f);if(f.isPrimary)resources.set(id,f);}
      const ids=this.data?.runIds||[],sealed=ids.length>0&&ids.every(id=>{const f=finalRuns.get(id);return f?.completion?.settled===true&&f.status==='TRUSTED'&&!f.gap&&f.sourceAvailable!==false&&timeOf(f)<=this.time;});
      if(sealed)for(const f of finalRuns.values()){const old=terminalRobots.get(f.robotId);if(!old||timeOf(f)>timeOf(old))terminalRobots.set(f.robotId,f);}
      return [...latest.values()].map(frame=>{const final=sealed?terminalRobots.get(frame.robotId):null,f=final||frame,r=final||resources.get(f.robotId);return {...f,sealedTail:!!final,allocatedNames:r?.allocatedNames,resourceSource:r?.resourceSource,resourceRecordedAt:r?.recordedAt,resourceUnknown:!r||r.gap||!final&&this.time-timeOf(r)>5,heldSeconds:this.time-timeOf(f),displayGap:f.gap||!final&&this.time-timeOf(f)>5};});
    }
  }
  function mapHTML(controller){
    const model=controller.data?.model||{},points=new Map((model.points||[]).filter(p=>finite(p.x)&&finite(p.y)).map(p=>[p.id,p])),all=[...points.values()];
    const frames=controller.snapshots(),validPoint=value=>value&&finite(value.x)&&finite(value.y),pose=value=>value?.frame==='map'&&validPoint(value);
    for(const f of frames)for(const p of [f.estimatedPose,f.groundTruthPose])if(pose(p))all.push(p);
    if(!all.length)return '<p class="release-notice">历史地图 / 同坐标系位置未提供，不补画。</p>';
    const xs=all.map(p=>p.x),ys=all.map(p=>p.y),left=Math.min(...xs)-.5,bottom=Math.min(...ys)-.5,w=Math.max(2,Math.max(...xs)-left+.5),h=Math.max(2,Math.max(...ys)-bottom+.5),xy=p=>`${p.x},${-p.y}`;
    const path=p=>{const a=points.get(p.source),b=points.get(p.target);return a&&b?`M${xy(a)} L${xy(b)}`:'';};
    const base=(model.paths||[]).map(p=>`<path d="${path(p)}" fill="none" stroke="#ccd5da" stroke-width=".025"/>`).join('');
    const overlays=frames.map((f,index)=>{if(f.displayGap||f.sourceAvailable===false)return '';const color=/02$/.test(f.robotId||'')?'#cd6322':index===1?'#cd6322':'#346bc2';const allocated=new Set(f.allocatedNames||[]),history=f.estimatedTrajectory?.samples||[],plan=f.plan?.poses||[],estimate=f.estimatedPose,truth=f.groundTruthPose;
      return `<g><title>${esc(f.robotId||f.runId)} · ${esc(f.sourceTime||'源时间未提供')}</title>${controller.layers.allocated&&!f.resourceUnknown?(model.paths||[]).filter(p=>allocated.has(p.id)).map(p=>`<path d="${path(p)}" fill="none" stroke="#ad4794" stroke-width=".09"/>`).join(''):''}${controller.layers.plan&&f.plan?.frame==='map'&&f.plan.fresh===true&&plan.some(validPoint)?`<polyline points="${plan.filter(validPoint).slice(0,500).map(xy).join(' ')}" fill="none" stroke="#bd7c15" stroke-dasharray=".15 .1" stroke-width=".04"/>`:''}${controller.layers.estimated&&f.estimatedTrajectory?.frame==='map'&&history.some(pose)?`<polyline points="${history.filter(pose).slice(-200).map(xy).join(' ')}" fill="none" stroke="${color}" stroke-width=".04"/>`:''}${controller.layers.estimated&&pose(estimate)&&(estimate.fresh===true||f.sealedTail)?`<circle cx="${estimate.x}" cy="${-estimate.y}" r=".09" fill="${f.sealedTail?'white':color}" stroke="${color}" stroke-width=".035"><title>${f.sealedTail?'最后记录的历史估计位置；原源新鲜度未改，不代表当前':'该次原估计位置'}</title></circle>`:''}${controller.layers.truth&&pose(truth)&&truth.fresh===true?`<circle cx="${truth.x}" cy="${-truth.y}" r=".06" fill="#218153"/>`:''}</g>`;
    }).join('');
    return `<svg class="replay-map" viewBox="${left} ${-(bottom+h)} ${w} ${h}" role="img" aria-label="独立历史回放地图，不是实时地图">${base}${overlays}</svg>`;
  }
  function stepLabel(step){if(step.controlPending)return '原任务停稳 / 收尾待核实';if(step.state==='SKIPPED')return '未执行（剩余作业已停止）';if(step.state==='NOT_SUBMITTED')return '尚未开始';if(step.state==='UNKNOWN')return '结果待核对';return ({SUCCEEDED:'已成功收尾',FAILED:'未成功',SUBMITTED:'已提交',DISPATCHING:'提交结果待核对'}[step.state]||'历史任务');}
  function mount(container,options={}){
    let error='',busy=false,lastTick=Date.now(),closed=true,generation=0,loadAbort=null,renderedData=null;
    const controller=new Controller(()=>render());
    const framesHTML=frames=>(controller.layers.truth&&frames.some(f=>f.groundTruthPose?.frame==='world')?'<p class="release-notice">这段真值记录使用 world 坐标，缺少已记录的 map 变换，不能叠加到地图。</p>':'')+(frames.some(f=>f.plan?.truncated)?'<p class="release-notice">计划只保留了原记录的部分路径点，未补画缺失部分。</p>':'')+frames.map(f=>`<p><strong>${esc(f.robotId||'车辆')}</strong> · ${f.sealedTail?'车辆运行记录已封存；仅显示最后历史位置，其后不再采样':f.displayGap||f.sourceAvailable===false?'此处记录不完整，状态待核对':'历史样本 · 保持最后记录'}${!f.sealedTail&&f.heldSeconds>5?' · 超过5秒无新样本，不补画运动':''}</p>`).join('')||'<p>当前位置尚无历史样本。</p>';
    const recentEvents=()=> (controller.data?.events||[]).filter(e=>timeOf(e)<=controller.time).slice(-8);
    const eventsHTML=()=>recentEvents().map(e=>`<li>${timeOf(e).toFixed(1)} 秒 · ${esc(eventLabel(e))} · ${e.sourceTime?'历史源记录':'网关记录；无物理源时间'}</li>`).join('');
    const sourcesHTML=frames=>frames.map(f=>`<p>${esc(f.robotId||f.runId)} · 网关记录 ${esc(f.recordedAt||'未提供')} · 原源时间 ${esc(f.sourceTime||'未提供')} · VDA时间 ${esc(f.stateTimestamp||'未提供')} · 样本保持 ${f.heldSeconds.toFixed(1)} 秒 · ${f.errors?.map(esc).join('；')||'未报告缺项'}</p>`).join('')+recentEvents().map(e=>`<p>${esc(e.kind)} · 原源时间 ${esc(e.sourceTime||'未提供')} · 网关记录 ${esc(e.recordedAt||'未提供')}</p>`).join('');
    function patch(){options.onPosition?.(controller.time);const frames=controller.snapshots(),seek=container.querySelector('[data-replay-seek]');if(seek&&root.document?.activeElement!==seek)seek.value=controller.time;const clock=container.querySelector('[data-replay-clock]');if(clock)clock.textContent=controller.time.toFixed(1)+' / '+controller.duration.toFixed(1)+' 秒';const toggle=container.querySelector('[data-replay-toggle]');if(toggle)toggle.textContent=controller.playing?'暂停':'播放';for(const [selector,html] of [['[data-replay-map]',mapHTML(controller)],['[data-replay-sources]',framesHTML(frames)],['[data-replay-events]',eventsHTML()],['[data-replay-source-detail]',sourcesHTML(frames)]]){const node=container.querySelector(selector);if(node)node.innerHTML=html;}}
    function render(){if(closed)return;const data=controller.data;if(!busy&&renderedData===data&&data&&container.querySelector('[data-replay-seek]')){patch();return;}
      const groups=new Map();for(const [index,event] of (data?.events||[]).entries()){const group=keyEventGroup(event);if(group){if(!groups.has(group))groups.set(group,[]);groups.get(group).push({index,event});}}
      container.innerHTML=`<div class="release-heading replay-record-heading"><div>${data?`<strong>${esc(data.label||'历史作业记录')}</strong><small>记录开始 ${esc(Number.isFinite(Date.parse(data.createdAt))?new Date(data.createdAt).toLocaleString():'未知')}</small>`:'<strong>读取历史作业记录</strong>'}</div><button class="button" type="button" data-replay-close>返回当前运行</button></div>${error?`<p role="alert" class="release-error">${esc(error)}</p>`:''}${busy?'<p role="status">正在读取历史索引…</p>':''}${data?`<div class="replay-meta">${data.displaySteps?.length?`<details class="replay-task-details"><summary>任务 ${data.displaySteps.length} 项 · 已运行 ${data.displaySteps.filter(step=>step.runRecorded).length} · 未执行 ${data.displaySteps.filter(step=>['SKIPPED','NOT_SUBMITTED'].includes(step.state)).length}</summary><ul class="replay-step-inventory">${data.displaySteps.map(step=>`<li>任务 ${step.taskNumber} · ${esc(step.robotId)} → ${esc(step.destination)} · ${esc(stepLabel(step))}${step.runRecorded?'':' · 暂无车辆运行记录，不绘制运动'}</li>`).join('')}</ul></details>${data.displaySteps.some(step=>['SKIPPED','NOT_SUBMITTED'].includes(step.state))?`<p class="replay-step-note">${data.displaySteps.filter(step=>['SKIPPED','NOT_SUBMITTED'].includes(step.state)).map(step=>'任务 '+step.taskNumber+(step.state==='SKIPPED'?' 未执行':' 尚未开始')).join('；')}</p>`:''}${data.displaySteps.some(step=>step.state==='UNKNOWN'||step.controlPending)?`<p class="release-notice">${data.displaySteps.filter(step=>step.state==='UNKNOWN'||step.controlPending).map(step=>'任务 '+step.taskNumber+' '+esc(stepLabel(step))).join('；')}</p>`:''}`:''}${root.MotionPresetUI?.recordedHTML(data.motionPreset)||""}</div><div class="replay-controls"><button class="button button-primary" type="button" data-replay-toggle>${controller.playing?'暂停':'播放'}</button><button class="button" type="button" data-replay-event="-1">前一个关键事件</button><button class="button" type="button" data-replay-event="1">后一个关键事件</button><label class="replay-key-events">定位关键事件<select data-replay-key-event><option value="">选择取消、反馈或收尾事件…</option>${[...groups].map(([group,items])=>`<optgroup label="${esc(group)}">${items.map(({index,event})=>`<option value="${index}">${timeOf(event).toFixed(1)} 秒 · ${esc(eventLabel(event))}</option>`).join('')}</optgroup>`).join('')}</select></label><label>回放速度<select data-replay-speed aria-label="回放速度">${[.5,1,2,4].map(v=>`<option value="${v}" ${controller.speed===v?'selected':''}>${v}×</option>`).join('')}</select></label><label class="replay-seek"><span class="replay-seek-caption">记录时间 <span data-replay-clock></span></span><input type="range" data-replay-seek min="0" max="${controller.duration}" step="any" value="${controller.time}"></label></div><div class="replay-layers">${[['plan','计划路线'],['allocated','已分配路段'],['estimated','定位轨迹'],['truth','仿真真值']].map(([key,label])=>`<label><input type="checkbox" data-replay-layer="${key}" ${controller.layers[key]?'checked':''}>${label}</label>`).join('')}</div><p class="replay-legend"><span class="replay-blue">蓝 LAB-01</span> · <span class="replay-orange">橙 LAB-02</span> · 空心圈＝封存位置</p><div class="replay-stage"><section class="replay-visual"><div data-replay-map></div><div class="replay-sources" data-replay-sources></div></section><section class="replay-event-panel"><h3>最近关键事件</h3><ol class="replay-events" data-replay-events></ol></section></div><details><summary>记录时间与来源完整性</summary><p>原地图版本 ${esc(data.releaseId||'未提供')} · 原 Run ${(data.runIds||[]).map(esc).join(' / ')}</p><div data-replay-source-detail></div><p>不同来源分别采样，不把网关记录时间当作物理源时间；缺少原时间即未知。定位轨迹为原 AMCL 估计，不等于真值。</p><p class="fine-print">计划、资源分配、估计轨迹与真值来自不同源；资源无源时间则未知。历史时间不使过期反馈重新新鲜，不跨缺口插值。轨迹显示最近200点，计划仅显示原记录点，片段不补全。</p></details>`:''}`;
      container.querySelector('[data-replay-close]')?.addEventListener('click',close);
      container.querySelector('[data-replay-toggle]')?.addEventListener('click',()=>controller.toggle());
      container.querySelector('[data-replay-seek]')?.addEventListener('input',e=>{controller.playing=false;controller.seek(e.target.value);});
      container.querySelector('[data-replay-key-event]')?.addEventListener('change',event=>{if(event.target.value==='')return;const selected=controller.data?.events?.[Number(event.target.value)];if(selected&&keyEventGroup(selected)){controller.playing=false;controller.seek(timeOf(selected));}});
      container.querySelector('[data-replay-speed]')?.addEventListener('change',e=>{controller.speed=Number(e.target.value);});
      container.querySelectorAll('[data-replay-event]').forEach(b=>b.addEventListener('click',()=>controller.event(Number(b.dataset.replayEvent))));
      container.querySelectorAll('[data-replay-layer]').forEach(b=>b.addEventListener('change',()=>{controller.layers[b.dataset.replayLayer]=b.checked;patch();}));
      if(!busy)renderedData=data;if(data)patch();
    }
    function close(){closed=true;generation++;loadAbort?.abort();controller.playing=false;container.hidden=true;options.onClose?.();}
    const timer=root.setInterval?.(()=>{const now=Date.now();controller.tick((now-lastTick)/1000);lastTick=now;},200);
    return {controller,close,async open(target){const requestGeneration=++generation;loadAbort?.abort();loadAbort=root.AbortController?new root.AbortController():null;closed=false;renderedData=null;busy=true;error='';controller.playing=false;controller.data=null;container.hidden=false;options.onOpen?.();render();try{const data=await options.loadReplay(target,{signal:loadAbort?.signal,cancelled:()=>closed||generation!==requestGeneration});if(generation===requestGeneration&&!closed){controller.load(data);controller.seek(Number(target.at)||0);}}catch(e){if(generation===requestGeneration)error=e.message;}finally{if(generation===requestGeneration){busy=false;render();}}},destroy(){generation++;closed=true;loadAbort?.abort();root.clearInterval?.(timer);controller.playing=false;container.replaceChildren();}};
  }
  root.ReplayUI={Controller,mount,mapHTML,loadReplay,normalizePages,eventLabel,stepLabel,keyEventGroup};if(typeof module!=='undefined'&&module.exports)module.exports=root.ReplayUI;
})(globalThis);
