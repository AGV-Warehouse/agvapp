(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const titles={forceReset:'强制复位仿真',closeStoppedSession:'结案已关闭的仿真会话',stopUnresolvedWorker:'停止仿真计算（保留未结案）',startWorker:'准备仿真服务',stopWorker:'关闭仿真服务',startViewer:'打开 Gazebo 实景',stopViewer:'关闭 3D 画面'};
  const reasons={WORKER_ALREADY_RUNNING:'仿真服务已启动',WORKER_ALREADY_STOPPED:'仿真服务已关闭',WORKER_NOT_RUNNING:'请先准备仿真服务',READY_PUBLICATION_REQUIRED:'请先生成并发布场景',SIM_NOT_READY:'请等待当前版本的车辆准入通过',PUBLICATION_RETIRE_REQUIRED:'请先在场景发布页停用当前仿真',UNSETTLED_RUNS:'仍有任务待完成或核对',REJECTED_EXECUTION_UNCONFIRMED:'发布未通过，尚未确认仿真执行已停止。请刷新核对服务，或审阅“停止仿真计算（保留未结案）”。',VIEWER_ALREADY_RUNNING:'3D 观察器已启动',VIEWER_ALREADY_STOPPED:'3D 观察器已关闭',VIEWER_WORKER_IDENTITY_CHANGED:'观察器绑定需由负责人重新准备',ENVIRONMENT_REVIEW_REQUIRED:'环境服务已更新，请刷新状态并重新审阅操作。',ENVIRONMENT_CONTEXT_CHANGED:'环境或任务已变化，本次操作未执行。请刷新状态并重新审阅。',ENVIRONMENT_HOST_UNAVAILABLE:'仿真电脑尚未连接。请确认电脑已开机并登录，登录后连接服务会自动准备；稍候刷新，仍未恢复请联系维护人员。',ENVIRONMENT_ENGINE_UNAVAILABLE:'仿真电脑正在准备运行环境，请稍候刷新；长时间未恢复请联系维护人员。',ENVIRONMENT_CONTAINER_UNAVAILABLE:'仿真服务配置尚未准备好，请联系维护人员完成安装。',ENVIRONMENT_CONTAINER_MISSING:'未找到仿真服务，请联系维护人员完成安装。',ENVIRONMENT_STATE_INVALID:'仿真服务状态无法识别，请联系维护人员核对；尚未确认停止。',ENVIRONMENT_IDENTITY_MISMATCH:'仿真服务身份不符合当前环境，请联系维护人员核对。',ENVIRONMENT_VIEWER_BINDING_MISMATCH:'3D 观察器与当前仿真不匹配，请联系维护人员重新准备。'};
  Object.assign(reasons,{
    SIM_RESET_IN_PROGRESS:'正在复位隔离仿真。',
    SIM_RESET_REVIEW_REQUIRED:'原复位尚未完成。请刷新并重新审阅当前范围。',
    SIM_RESET_PUBLICATION_IN_PROGRESS:'当前发布仍在处理中，请等发布结果明确后再复位。',
    SIM_RESET_CONTAINER_STATE_UNCONFIRMED:'仿真执行状态待确认，请先刷新。持续异常时请联系维护人员。',
    SIM_RESET_EXECUTION_CHANGED:'仿真容器身份已变化，请联系维护人员核对后重新审阅。',
    SIM_RESET_EXECUTION_NOT_STOPPED:'仿真计算仍在运行，请刷新并重新审阅。',
    SIM_RESET_RUN_MISMATCH:'待处理任务与当前发布不匹配，请联系维护人员核对原任务。',
    SIM_RESET_PUBLICATION_MISMATCH:'当前发布无法确认属于隔离仿真，请联系维护人员。',
    SIM_RESET_ORDER_MISMATCH:'调度中有无法归属到本次范围的订单，请联系维护人员核对。',
    SIM_RESET_KERNEL_UNCONFIRMED:'无法确认当前调度范围，请联系维护人员核对。',
    SIM_RESET_RESOURCES_UNCONFIRMED:'车辆或通行资源仍待确认。请刷新后重新审阅，持续异常时联系维护人员。',
    SIM_RESET_WORKER_UNAVAILABLE:'未能读取空闲仿真服务，请确认仿真电脑连接后重新审阅。',
    SIM_RESET_WORKER_REVIEW_REQUIRED:'旧会话的仿真记录需要维护人员核对。',
    SIM_RESET_WORKER_RELEASE_MISMATCH:'仿真服务保留了另一个发布，请联系维护人员。',
  });
  const stopActions=['stopWorker','stopViewer','stopUnresolvedWorker','closeStoppedSession','forceReset'];
  const stopMessages={stopWorker:'关闭当前隔离仿真服务与 3D 画面。已保存的场景、任务和运行记录会保留；下次需要时可在本页重新准备服务。',stopViewer:'关闭当前 3D 观察器，释放画面计算资源。仿真与任务会继续运行。',stopUnresolvedWorker:'仅关闭隔离仿真的 Worker 与画面。任务、资源占用和失败证据保留为未结案；这不是成功到站、正常停用或实车停车。重新启动不会恢复任务。',closeStoppedSession:'仿真计算必须已关闭。将结束原撤回任务在调度内核中的占用，禁用旧虚拟车辆并保留失败历史；不会标记成功到站，也不会启动或重放任务。'};
  stopMessages.forceReset='停止本场景的后续派发，关闭仿真计算与 3D 画面，结束所列未结案任务，核实解除虚拟资源占用后停用当前发布。场景、任务和运行记录会保留，原任务不会重放。仅作用于该隔离仿真环境。';
  const resetProgress={STOPPING:'正在关闭仿真计算与 3D 画面。',RELEASING:'正在结案未完成任务并核对车辆资源。',RETIRING_WORKER_RELEASE:'正在停用旧场景。',VERIFIED_IDLE:'已核实资源释放，正在保存结案记录。'};
  function viewerURL(value){try{if(typeof value!=='string')return null;const base=root.location?.href,u=new URL(value,base);const sameOrigin=base&&u.origin===new URL(base).origin&&u.pathname==='/sim-viewer/';return (sameOrigin||u.origin==='http://127.0.0.1:55236'&&u.pathname==='/')&&!u.username&&!u.password&&!u.search&&!u.hash?u.href:null;}catch(_){return null;}}
  function readyViewerURL(viewer){
    return viewer?.ready===true&&viewer.running===true&&viewer.rendererRunning===true?viewerURL(viewer.url):null;
  }
  function serviceState(state) {
    if (!state) return '等待读取当前环境';
    if (!state.enabled) return '当前服务器未连接仿真环境';
    const worker=state.worker;
    if (!worker || worker.error || ['unavailable','unknown'].includes(worker.state)) return '仿真服务状态未知，请检查仿真电脑连接；尚未确认停止';
    if (worker.running===true) {
      if(state.simulationReady===true)return '仿真服务与场景已就绪';
      if(state.activePublicationStatus==='UNKNOWN')return '当前场景结果待核对，请查看原发布与任务记录';
      if(['READY','WAITING_WORKER','WORKER_APPLYING','PUBLISHING','KERNEL_VERIFIED','RETIRING'].includes(state.activePublicationStatus))return '当前场景尚未通过车辆准入，请核对发布与车辆状态';
      return '仿真服务已准备，等待场景发布';
    }
    if (worker.running===false && ['exited','dead','created'].includes(worker.state)) return '仿真服务已关闭，不占用仿真 CPU';
    if (worker.state==='missing') return '未找到仿真容器，请检查环境配置';
    return '仿真服务状态待核对，尚未确认停止';
  }
  function mount(container,api,options={}){
    let state=null,scope=null,keyRevision=null,serial=0,reading=false,busy=false,pending=null,receipt=null,error='',visible=options.initialVisible!==false,destroyed=false,showViewer=false,stopReview=null,lastMarkup='',resetReceiptMissing=false;
    let revealViewer=false,observationVisible=false;
    const storage=options.storage||root.sessionStorage,host=options.viewerContainer;
    container.innerHTML='<section class="sim-environment"><div class="sim-environment-heading"><div><p class="eyebrow">隔离仿真</p><h2>从场景到机器人运行</h2><p>先准备服务，规划并发布场景，再让车辆执行任务。</p></div><button class="button" data-env-refresh>刷新环境状态</button></div><div data-env-content></div></section>';
    const content=container.querySelector('[data-env-content]');
    const storageKey=()=> 'fleet-sim-environment:'+api.scope;
    const authorized=()=>api.authorized&&api.deploymentConfirmed;
    const writable=()=>authorized()&&api.receiptSnapshot?.().canWrite===true;
    const allowed=action=>writable()&&!busy&&!pending&&state?.enabled===true&&state.actions?.[action]?.allowed===true;
    const reason=action=>{const code=state?.actions?.[action]?.reason;return reasons[code]||(code?'当前条件未满足，请核对环境状态':'');};
    const context=()=>({scope:api.scope,key:api.keyRevision,serial});
    const current=c=>!destroyed&&c.scope===api.scope&&c.key===api.keyRevision&&c.serial===serial;
    function persist(){storage.setItem(storageKey(),JSON.stringify({pending,showViewer}));}
    function bind(){if(scope===api.scope&&keyRevision===api.keyRevision)return;serial++;scope=api.scope;keyRevision=api.keyRevision;state=null;pending=null;receipt=null;error='';resetReceiptMissing=false;showViewer=false;revealViewer=false;stopReview=null;try{const saved=JSON.parse(storage.getItem(storageKey())||'null');if(saved?.pending){const p=saved.pending;if(typeof p.requestId!=='string'||!titles[p.action]||p.deploymentId!==api.deploymentId)throw Error('原服务操作身份需核对。');pending=p;}showViewer=saved?.showViewer===true;}catch(e){error='原操作索引无法读取，请保留记录后核对。';}lastMarkup='';}
    function renderViewer(){
      if(!host)return;
      if(!visible||!authorized())revealViewer=false;
      const url=!destroyed&&visible&&authorized()&&showViewer?readyViewerURL(state?.viewer):null;
      const frame=host.querySelector('iframe');
      const open=!!url;
      if(host.hidden===open){
        host.hidden=!open;
        options.onViewerChange?.(open);
      }
      if(frame?.getAttribute('src')===url)return;
      if(!open){
        if(frame)host.replaceChildren();
        return;
      }
      const player=host.ownerDocument.createElement('iframe');
      player.title='Gazebo 实时仿真视频';
      player.setAttribute('src',url);
      player.setAttribute('referrerpolicy','no-referrer');
      player.setAttribute('allow','autoplay; fullscreen');
      player.setAttribute('sandbox','allow-scripts allow-same-origin');
      host.replaceChildren(player);
      if(revealViewer){
        revealViewer=false;
        options.onViewerReveal?.();
      }
    }
    const reviewIdentity=action=>JSON.stringify([action,api.scope,api.keyRevision,state?.controlContext]);
    function reviewStop(action, surface){
      if((surface==='overview'?!observationVisible:!visible)||!allowed(action)||!state?.controlContext)return;
      stopReview={action,surface,identity:reviewIdentity(action),expectedContext:JSON.parse(JSON.stringify(state.controlContext))};
      render();
    }
    function notifyObservation(){
      options.onObservationChange?.(observationVisible?{
        state,
        authorized:authorized(),
        writable:writable(),
        viewerURL:authorized()?readyViewerURL(state?.viewer):null,
        canOpen:allowed('startViewer'),
        canReviewClose:allowed('stopViewer')&&!!state?.controlContext,
        reviewOpen:stopReview?.surface==='overview',
        busy,
        pending:!!pending,
        error,
        reason:reason('startViewer'),
      }:null);
    }
    function render(){if(destroyed)return;bind();if(stopReview&&(!writable()||stopReview.identity!==reviewIdentity(stopReview.action)||!state?.controlContext||state?.actions?.[stopReview.action]?.allowed!==true))stopReview=null;
      const sceneId=state?.scene?.sceneId,sceneHref=typeof sceneId==='string'&&/^[a-f0-9]{32}$/.test(sceneId)?'scene-builder.html?sceneId='+sceneId:'scene-builder.html';
      const publicationHref=sceneHref+(sceneHref.includes('?')?'&':'?')+'step=simulation';
      const worker=state?.worker?.running===true,simReady=state?.simulationReady===true;
      const viewerAvailable=authorized()&&!!readyViewerURL(state?.viewer);
      const watching=viewerAvailable&&showViewer;
      const opening=pending?.action==='startViewer';
      const viewerStatus=watching?'':viewerAvailable?'Gazebo 视频可查看。'
        :opening?(busy?'正在启动视频，等待首帧。':'视频启动结果待核对。刷新环境状态可继续查询。')
        :state?.actions?.startViewer?.reason==='VIEWER_ALREADY_RUNNING'?'暂未收到实时画面。可刷新环境状态，或关闭 3D 画面后重新打开。'
        :showViewer&&authorized()?'画面状态待核对。确认服务恢复后会重新连接。'
        :reason('startViewer');
      const viewerButton=watching?'':viewerAvailable
        ?'<button class="button" data-env-show>打开 Gazebo 实景</button>'
        :`<button class="button" data-env-action="startViewer" ${allowed('startViewer')?'':'disabled'}>打开 Gazebo 实景</button>`;
      const latest=state?.latestControl;
      const lastControl=receipt&&(!latest||receipt.requestId===latest.requestId||receipt.updatedAt>=latest.updatedAt)?receipt:latest;
      const resetControl=lastControl?.action==='forceReset'?lastControl:null;
      const resetPending=pending?.action==='forceReset'||state?.actions?.forceReset?.reason==='SIM_RESET_IN_PROGRESS';
      const resetActive=resetPending?(resetProgress[resetControl?.resetPhase]||'正在核对原复位。刷新只查询原请求。'):
        resetControl?.status==='COMPLETED'&&state?.activePublicationStatus==='RETIRED'&&state?.worker?.running===false?
          '仿真已复位，车辆资源已释放，旧发布已停用。可重新准备服务并发布场景。':'';
      const resetError=resetControl&&['FAILED','UNKNOWN','REVIEW_REQUIRED'].includes(resetControl.status)?
        reasons[resetControl.error?.code]||'原复位结果待核对。请刷新后重新审阅当前范围。':'';
      const showReset=state?.enabled&&state?.actions?.forceReset?.reason!=='SIM_RESET_NOT_NEEDED'&&!!state?.actions?.forceReset;
      const resetReason=showReset&&!allowed('forceReset')&&!resetPending?reason('forceReset'):'';
      const resetPanel=`<div id="sim-force-reset">${showReset?`<button class="button" data-env-stop-review="forceReset" ${allowed('forceReset')&&state?.controlContext?'':'disabled'}>${esc(titles.forceReset)}</button>`:''}${resetError?`<p role="alert">${esc(resetError)}</p>`:''}${resetReason?`<small>${esc(resetReason)}</small>`:''}${resetReceiptMissing&&pending?.action==='forceReset'?`<button class="button" data-env-retry-reset>重试原复位请求</button>`:''}</div>`;
      const reviewVehicles=(state?.activeRunIds||[]).map(id=>state.activeRunVehicles?.[id]).filter(Boolean).join('、');
      const closedSession=lastControl?.action==='closeStoppedSession'&&lastControl.status==='COMPLETED'&&state?.activePublicationStatus==='UNKNOWN'&&(lastControl.publicationId||lastControl.expectedContext?.publicationId)===state?.activePublicationId;
      const markup=`${!authorized()?'<p class="sim-environment-note">请使用右上角“操作员登录”读取状态。</p>':''}${error?`<p role="alert" class="sim-environment-error">${esc(error)}</p>`:''}<ol class="sim-demo-steps"><li><span>1</span><strong>准备服务</strong><p>${esc(serviceState(state))}</p><button class="button button-primary" data-env-action="startWorker" ${allowed('startWorker')?'':'disabled'}>准备仿真服务</button>${!allowed('startWorker')&&reason('startWorker')?`<small>${esc(reason('startWorker'))}</small>`:''}</li><li><span>2</span><strong>规划与发布</strong><p>打开编辑器后，依次完成“规划路线”和“生成与仿真”；编辑场景不会启动机器人。</p><a class="button" href="${esc(sceneHref)}">${state?.scene?'编辑场景：'+esc(state.scene.name):'打开场景搭建器'}</a></li><li><span>3</span><strong>运行与观察</strong><p>${simReady?'当前发布车辆已就绪，可在下方下达任务。':viewerAvailable?'导航未就绪，实景仍可查看；画面不代表可发任务或地图版本已核实。':'服务启动不等于可发单，须先发布并通过车辆准入。'}</p>${viewerButton}${viewerStatus?`<small>${esc(viewerStatus)}</small>`:''}</li></ol><div class="sim-environment-footer"><p>${resetActive?resetActive:busy?'正在核对原服务操作，请稍候。':pending?'服务操作结果待核对；刷新只查询原请求，不会重复执行。':closedSession?'故障会话已结案，未成功到站。下一步：准备仿真服务（仅启动空闲服务，不恢复原任务）→查看并停用当前发布→关闭仿真服务。':receipt?.status==='COMPLETED'?`${esc(titles[receipt.action])}已完成。`:receipt?.status==='FAILED'?'操作未完成，请查看当前条件后重试。':'日常保持门户与 openTCS；验收结束先停用发布，再关闭仿真服务。'}</p><div>${['stopViewer','stopWorker'].map(action=>`<button class="button" data-env-stop-review="${action}" ${allowed(action)&&state?.controlContext?'':'disabled'}>${esc(titles[action])}</button>`).join('')}</div>${resetPanel}${!state?.actions?.forceReset?['closeStoppedSession','stopUnresolvedWorker'].filter(action=>allowed(action)).map(action=>`<button class="button" data-env-stop-review="${action}" ${state?.controlContext?'':'disabled'}>${esc(titles[action])}</button>`).join(''):''}${!state?.controlContext&&authorized()?'<p class="sim-environment-note">环境操作依据尚未读取，请刷新环境状态；仍未恢复请联系维护人员。</p>':''}${stopReview?.surface==='workbench'?`<div class="sim-environment-review"><strong>审阅：${esc(titles[stopReview.action])}</strong><p>场景：${esc(state?.scene?.name||'当前隔离仿真')} · 未结案任务 ${esc(state?.activeRunIds?.length||0)} 项${reviewVehicles?'（'+esc(reviewVehicles)+'）':''}。</p><p role="alert">${esc(stopMessages[stopReview.action])}</p><button class="button" data-env-action="${stopReview.action}" ${allowed(stopReview.action)?'':'disabled'}>确认${esc(titles[stopReview.action])}</button><button class="button" data-env-review-back>返回</button></div>`:''}${['READY','UNKNOWN','WAITING_WORKER','WORKER_APPLYING','PUBLISHING','KERNEL_VERIFIED','RETIRING'].includes(state?.activePublicationStatus)?`<a class="button" href="${esc(publicationHref)}">查看并停用当前发布</a>`:''}${worker&&!allowed('stopWorker')&&reason('stopWorker')?`<small>${esc(reason('stopWorker'))}</small>`:''}</div><details class="sim-environment-evidence"><summary>环境与操作依据</summary><pre data-env-evidence></pre></details>`;
      if(markup!==lastMarkup){lastMarkup=markup;const opened=content.querySelector('.sim-environment-evidence')?.open;const focused=root.document?.activeElement;const focusAction=content.contains?.(focused)?focused?.dataset?.envAction:null;const focusReview=content.contains?.(focused)?focused?.dataset?.envStopReview:null;const focusShow=content.contains?.(focused)&&focused?.hasAttribute('data-env-show');content.innerHTML=markup;if(focusShow)content.querySelector('[data-env-show]')?.focus?.({preventScroll:true});if(opened){const details=content.querySelector('.sim-environment-evidence');if(details)details.open=true;}if(focused?.tagName==='SUMMARY')content.querySelector('.sim-environment-evidence summary')?.focus?.({preventScroll:true});if(focusAction)content.querySelector('[data-env-action="'+focusAction+'"]')?.focus?.({preventScroll:true});if(focusReview)content.querySelector('[data-env-stop-review="'+focusReview+'"]')?.focus?.({preventScroll:true});content.querySelectorAll('[data-env-stop-review]').forEach(button=>button.addEventListener('click',()=>reviewStop(button.dataset.envStopReview,'workbench')));content.querySelector('[data-env-retry-reset]')?.addEventListener('click',retryPendingReset);content.querySelector('[data-env-review-back]')?.addEventListener('click',()=>{stopReview=null;render();});content.querySelector('[data-env-show]')?.addEventListener('click',()=>{if(!authorized())return;revealViewer=visible;showViewer=true;persist();render();});for(const b of content.querySelectorAll('[data-env-action]'))b.addEventListener('click',()=>act(b.dataset.envAction,'workbench'));}
      const evidence=content.querySelector('[data-env-evidence]');
      const evidenceText=JSON.stringify({observedAt:state?.observedAt,targetId:state?.targetId,publicationStatus:state?.activePublicationStatus,worker:state?.worker,viewer:state?.viewer,pending,receipt},null,2);
      if(evidence&&evidence.textContent!==evidenceText)evidence.textContent=evidenceText;
      container.querySelector('[data-env-refresh]').disabled=!authorized()||busy;
      renderViewer();notifyObservation();options.onState?.(state);
    }
    function applyReceipt(value){
      receipt=value;
      resetReceiptMissing=false;
      if(!['COMPLETED','FAILED','REVIEW_REQUIRED'].includes(value.status))return;
      if(value.action==='startViewer'){
        if(value.status==='COMPLETED')showViewer=true;
        else revealViewer=false;
      }
      if(value.status==='COMPLETED'&&['stopViewer','stopWorker','stopUnresolvedWorker','forceReset'].includes(value.action)){
        showViewer=false;
        revealViewer=false;
      }
      pending=null;
      persist();
    }
    async function queryReceipt(c){if(!pending)return;const value=await api.request('sim/environment/controls/'+encodeURIComponent(pending.requestId));if(!current(c))return;if(value.requestId!==pending.requestId||value.action!==pending.action||value.deploymentId!==pending.deploymentId)throw Error('原服务操作回读身份不匹配。');applyReceipt(value);}
    async function refresh(force=false){bind();if(!authorized()||reading&&!force||busy)return;const c=context();reading=true;try{error='';try{await queryReceipt(c);}catch(e){if(!current(c))return;resetReceiptMissing=pending?.action==='forceReset'&&e.protocolFault&&e.code==='ENVIRONMENT_CONTROL_NOT_FOUND';error='原服务操作仍待核对，记录已保留；下方独立读取当前环境，已运行的实景仍可查看。';}if(!current(c))return;const value=await api.request('sim/environment');if(!current(c))return;if(value.enabled===true&&value.deploymentId!==api.deploymentId)throw Error('环境状态来自另一部署。');state=value;}catch(e){if(current(c)){state=null;error='环境状态尚未核实，请重读原操作和当前状态。';}}finally{reading=false;if(current(c))render();}}
    async function act(action,surface){bind();if(surface==='overview'?!observationVisible:!visible)return;if(stopActions.includes(action)&&(!stopReview||stopReview.surface!==surface||stopReview.action!==action||stopReview.identity!==reviewIdentity(action)))return;if(!writable()||busy||pending||!titles[action]||state?.actions?.[action]?.allowed!==true)return;const expectedContext=stopReview?.expectedContext;stopReview=null;if(action==='startViewer')revealViewer=visible;busy=true;serial++;const c=context();error='';try{pending={requestId:api.id(),deploymentId:api.deploymentId,action,...(stopActions.includes(action)?{expectedContext}:{})};persist();render();const value=await api.request('sim/environment/controls',{...pending});if(!current(c))return;if(value.requestId!==pending.requestId||value.action!==action||value.deploymentId!==pending.deploymentId)throw Error('服务操作响应身份不匹配。');applyReceipt(value);}catch(e){if(current(c)){if(e.protocolFault&&[400,403,409,422].includes(e.status)){if(action==='startViewer')revealViewer=false;pending=null;persist();}error=pending?'服务操作结果待核对，原请求已保留。':reasons[e.code]||'当前条件未允许此操作，请刷新环境状态。';}}finally{busy=false;if(current(c)){const rejectedError=!pending?error:'';render();await refresh(true);if(rejectedError){error=rejectedError;render();}}}}
    async function retryPendingReset(){
      if(!visible||!writable()||busy||!resetReceiptMissing||pending?.action!=='forceReset')return;
      busy=true;resetReceiptMissing=false;serial++;const c=context();error='';render();
      try{
        const value=await api.request('sim/environment/controls',{...pending});
        if(!current(c))return;
        if(value.requestId!==pending.requestId||value.action!==pending.action||value.deploymentId!==pending.deploymentId)throw Error('服务操作响应身份不匹配。');
        applyReceipt(value);
      }catch(e){
        if(current(c)&&e.protocolFault&&[400,403,409,422].includes(e.status)){
          pending=null;persist();
          error=reasons[e.code]||'原复位范围已变化，请重新审阅。';
        }
      }finally{
        busy=false;
        if(current(c)){const rejectedError=error;await refresh(true);if(rejectedError){error=rejectedError;render();}}
      }
    }
    container.querySelector('[data-env-refresh]').addEventListener('click',()=>refresh());
    const timer=root.setInterval?.(()=>{if((visible||observationVisible)&&!destroyed)refresh();},7000);
    render();return {
      refresh,render,
      updateBlocker(){return busy||pending?'服务操作正在处理或结果待核对，请到“虚拟实验 → 刷新环境状态”核对原服务操作，再更新。':'';},
      authorizationChanged(){bind();render();return refresh();},
      setVisible(value){
        if(visible===value)return;
        visible=value;
        if(!value&&stopReview?.surface==='workbench')stopReview=null;
        render();
        if(value)return refresh();
      },
      setObservationVisible(value){
        if(observationVisible===value)return;
        observationVisible=value;
        if(!value&&stopReview?.surface==='overview')stopReview=null;
        render();
        if(value)return refresh();
      },
      openObservation(){if(observationVisible)return act('startViewer','overview');},
      reviewObservationClose(){if(observationVisible)reviewStop('stopViewer','overview');},
      closeObservation(){if(observationVisible&&stopReview?.surface==='overview')return act('stopViewer','overview');},
      cancelObservationReview(){if(stopReview?.surface==='overview'){stopReview=null;render();}},
      destroy(){destroyed=true;serial++;root.clearInterval?.(timer);renderViewer();options.onObservationChange?.(null);container.replaceChildren();},
    };
  }
  root.SimEnvironmentUI={mount,viewerURL,serviceState};if(typeof module==='object'&&module.exports)module.exports=root.SimEnvironmentUI;
})(globalThis);
