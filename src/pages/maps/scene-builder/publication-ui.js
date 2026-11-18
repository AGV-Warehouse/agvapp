(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages={PREFLIGHT:'正在检查发布条件',PUBLISHING:'正在加载调度模型',KERNEL_VERIFIED:'调度模型已核对',WORKER_APPLYING:'正在加载仿真地图与车辆',WAITING_WORKER:'正在等待仿真车辆就绪',READY:'发布已完成，当前车辆尚未就绪',UNKNOWN:'发布结果待核对',REJECTED:'发布未通过',RETIRING:'正在停用当前仿真',RETIRED:'当前版本已停用'};
  function mount(container,api,options={}){
    let controller=null,controllerKeyRevision=null,releaseId=null,notice='',failure='',review=null,serial=0,destroyed=false,reading=false,lastRenderedHTML=null;
    function createController(){const key=api.keyRevision;controllerKeyRevision=key;let owned;owned=new root.MapReleaseUI.Controller(api,{onChange:render,beforePublish(release){if(owned!==controller||key!==api.keyRevision||!match()||release.releaseId!==controller?.state.release?.releaseId||controller.scope!==api.scope)throw Error('场景或连接已变化，请重新审阅后发布。');}});return owned;}
    function ensure(){if(!api.authorized||!api.deploymentConfirmed)return false;if(controller?.scope===api.scope&&controllerKeyRevision===api.keyRevision)return true;serial++;controller=createController();releaseId=null;review=null;return true;}
    function match(){const s=options.getSavedScene(),r=controller?.state.release;return controllerKeyRevision===api.keyRevision&&r?.sceneSource&&r.sceneSource.sceneId===s.id&&r.sceneSource.sceneRevision===s.revision&&!s.dirty&&!s.pending&&!s.busy;}
    async function act(fn,kind){if(!ensure())return;failure='';try{await controller.run(fn);notice=kind||'';}catch(e){failure=e.message;}finally{render();}}
    async function retireConfirmed(requestId){await controller.retire(requestId);if(controller.state.activePublication?.status!=='RETIRED')throw Error('停用尚未确认：任务或资源仍需核对，请查看原发布依据。');}
    async function refresh(){if(!ensure()||reading||controller.state.busy)return;const c=controller,t=serial;reading=true;try{await c.refresh(true);if(destroyed||c!==controller||t!==serial)return;const p=c.state.publication;if(p&&!['READY','REJECTED','UNKNOWN','RETIRED'].includes(p.status))await c.refreshPublication(p.requestId);}catch(e){if(c===controller)failure=e.message;}finally{reading=false;render();}}
    async function select(release){if(!ensure())return;if(releaseId===release.releaseId)return;if(controller.state.busy){failure='发布正在处理，请先核对原版本。';render();return;}serial++;controller=createController();releaseId=release.releaseId;review=null;const c=controller,t=serial,scope=api.scope,key=api.keyRevision;try{await c.refresh(true);if(c!==controller||serial!==t||api.scope!==scope||api.keyRevision!==key)return;await c.chooseRelease(release.releaseId);if(c!==controller||serial!==t||api.scope!==scope||api.keyRevision!==key)return;notice='生成版本已确认。先审阅当前仿真，再明确发布。';}catch(e){if(c===controller){releaseId=null;failure=e.message;options.onStatus?.(failure,true);}}render();}
    function render(){if(destroyed)return;const r=controller?.state.release,s=controller?.state,p=s?.activePublication,busy=!!s?.busy;
      if(!api.authorized||controller?.scope!==api.scope||controllerKeyRevision!==api.keyRevision){if(lastRenderedHTML!==''){container.innerHTML='';lastRenderedHTML='';}return;}
      if(!r){
        const canRetire=['READY','UNKNOWN'].includes(p?.status);
        const confirming=canRetire&&review?.requestId===p.requestId;
        const markup=canRetire?`<section class="scene-publication"><h2>已发布的仿真版本</h2><p>这里是当前运行版本，可能与正在编辑的草稿不同。可返回工作台查看实景；停用前须核对车辆已停稳且没有活动任务。</p>${failure?`<p role="alert" class="scene-error">${esc(failure)}</p>`:''}<div class="generation-actions"><a class="button button-primary" href="./?task=scene#/simulation">查看当前运行与实景</a>${confirming?`<button class="button" data-scene-pub-active-confirm ${busy?'disabled':''}>确认停用原发布</button><button class="button" data-scene-pub-active-back>返回</button>`:`<button class="button" data-scene-pub-active-review ${busy?'disabled':''}>审阅停用原发布</button>`}</div></section>`:'';
        if(markup===lastRenderedHTML)return;
        container.innerHTML=markup;lastRenderedHTML=markup;
        container.querySelector('[data-scene-pub-active-review]')?.addEventListener('click',()=>{review={requestId:p.requestId};render();});
        container.querySelector('[data-scene-pub-active-back]')?.addEventListener('click',()=>{review=null;render();});
        container.querySelector('[data-scene-pub-active-confirm]')?.addEventListener('click',()=>{
          if(review?.requestId!==controller.state.activePublication?.requestId){review=null;render();return;}
          const requestId=review.requestId;review=null;act(()=>retireConfirmed(requestId),'原发布已停用，记录保留。');
        });
        return;
      }
      if(review?.kind==='retire'&&(review.requestId!==p?.requestId||!['READY','UNKNOWN'].includes(p?.status)))review=null;
      const same=p?.releaseId===r.releaseId,ready=api.authorized&&same&&p?.status==='READY'&&s.status?.currentAdmission?.ready===true;
      const canRetire=['READY','UNKNOWN'].includes(p?.status),needsRetire=canRetire&&!same;
      const used=root.MapReleaseUI.releaseAlreadyUsed(s,r.releaseId),canPublish=match()&&!busy&&!used&&!needsRetire&&(!p||['RETIRED','REJECTED'].includes(p.status));
      const markup=`<section class="scene-publication"><h2>进入隔离仿真</h2><p>已确认场景修订 ${esc(r.sceneSource.sceneRevision)}。发布会让仿真加载这份地图、几何与车辆起点。</p>${root.MotionPresetUI?.recordedHTML(r.motionPreset)||''}${failure?`<p role="alert" class="scene-error">${esc(failure)}</p>`:''}${notice?`<p role="status">${esc(notice)}</p>`:''}${used?'<p class="generation-source-note">此版本已经使用，不能再次启动。需要新一轮仿真时，点击上方“新建生成方案”，再依次生成、确认新版本并审阅发布。原运行记录会保留。</p>':''}${!match()?'<p>当前编辑内容与确认版本不同。请回到对应已保存修订，或重新生成并确认。</p>':''}<div class="scene-publication-state"><strong>${ready?'仿真已就绪':needsRetire?'当前仿真仍在运行另一个版本':stages[p?.status]||'等待发布'}</strong><p>${ready?'车辆已加载此地图，定位与导航准入已核对。':needsRetire?'请先明确停用当前隔离仿真，原记录会保留。':'发布受理、地图加载与车辆就绪会分别核对。'}</p></div><div class="generation-actions">${canRetire?`<button class="button" data-scene-pub-retire ${busy?'disabled':''}>审阅停用当前仿真</button>`:''}<button class="button button-primary" data-scene-pub-publish ${canPublish?'':'disabled'}>审阅并发布到仿真</button><button class="button" data-scene-pub-refresh ${busy?'disabled':''}>核对发布与就绪</button>${p?.status==='UNKNOWN'?'<button class="button" data-scene-pub-verify>重新核对原发布</button>':''}${ready?'<a class="button button-primary" href="./?task=scene#/simulation">返回工作台看实景或下达任务</a>':p&&!['RETIRED','REJECTED'].includes(p.status)?'<a class="button" href="./?task=scene#/simulation">返回工作台核对车辆与任务</a>':''}</div>${review?.kind==='retire'?'<div class="scene-publish-review"><p>确认停用当前隔离仿真？系统须核实车辆停稳、无活动任务，执行记录会保留。</p><button class="button" data-scene-pub-confirm-retire>确认停用当前仿真</button><button class="button" data-scene-pub-back>返回</button></div>':''}${review==='publish'?`<div class="scene-publish-review"><p>将场景修订 ${esc(r.sceneSource.sceneRevision)} 发布到本机隔离双车仿真。车辆将从预览起点投入新会话，旧任务不会自动重放。</p><button class="button button-primary" data-scene-pub-confirm-publish>确认发布此场景到仿真</button><button class="button" data-scene-pub-back>返回</button></div>`:''}<details class="generation-evidence"><summary>发布与版本依据</summary><pre>${esc(JSON.stringify({releaseId:r.releaseId,releaseHash:r.releaseHash,sceneSource:r.sceneSource,publication:p?{requestId:p.requestId,releaseId:p.releaseId,status:p.status,stage:p.stage,error:p.error}:null},null,2))}</pre></details></section>`;
      if(markup===lastRenderedHTML)return;
      container.innerHTML=markup;lastRenderedHTML=markup;
      container.querySelector('[data-scene-pub-retire]')?.addEventListener('click',()=>{review={kind:'retire',requestId:p.requestId};render();});
      container.querySelector('[data-scene-pub-publish]')?.addEventListener('click',()=>{review='publish';render();});
      container.querySelector('[data-scene-pub-back]')?.addEventListener('click',()=>{review=null;render();});
      container.querySelector('[data-scene-pub-refresh]')?.addEventListener('click',refresh);
      container.querySelector('[data-scene-pub-verify]')?.addEventListener('click',()=>act(()=>controller.verify(),'已核对原发布。'));
      container.querySelector('[data-scene-pub-confirm-retire]')?.addEventListener('click',()=>{const reviewed=review;if(reviewed?.kind!=='retire'||reviewed.requestId!==controller.state.activePublication?.requestId){review=null;render();return;}review=null;act(()=>retireConfirmed(reviewed.requestId),'当前隔离仿真已停用，记录保留。');});
      container.querySelector('[data-scene-pub-confirm-publish]')?.addEventListener('click',()=>{if(!match()){failure='场景修订已变化，请重新审阅。';render();return;}review=null;act(()=>controller.publish('p0-pair'),'发布已受理，正在核对地图与车辆。');});
    }
    const timer=root.setInterval?.(()=>{if(controller&&api.authorized&&!destroyed)refresh();},2500);
    return {select,refresh,render,updateBlocker(){return controller?.updateBlocker()||'';},destroy(){destroyed=true;serial++;root.clearInterval?.(timer);container.replaceChildren();lastRenderedHTML='';}};
  }
  root.ScenePublicationUI={mount};if(typeof module==='object'&&module.exports)module.exports={mount};
})(globalThis);
