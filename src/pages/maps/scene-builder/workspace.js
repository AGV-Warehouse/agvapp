(function(){
  'use strict';
  const $=id=>document.getElementById(id),M=SceneBuilderModel,W=SceneWorkcellModel;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=new FleetAPI(()=>{},()=>{},onSessionChange);
  let sessionReady=false,sessionRevision=null,sessionAction=false;
  let selected=null,tool='select',discardAction=null,knownScope=null,canvas=null,generationUI=null,publicationUI=null,networkUI=null,floorplan=null,workcellUI=null,placing=null,routeMode=false;
  const controller=new SceneBuilderController.Controller(api,{storage:window.sessionStorage,onChange:render,onIdentity(id){const url=new URL(location.href);if(id)url.searchParams.set('sceneId',id);else url.searchParams.delete('sceneId');history.replaceState(null,'',url);}});
  const clearance=SceneClearanceUI.mount($('sceneClearanceView'),api,{
    getContext:()=>({scene:controller.scene,scope:api.scope,keyRevision:api.keyRevision,disabled:clearanceDisabled()}),
    onSelect(value){
      const tab=$(['point','path'].includes(value.kind)?'sceneRoutesTab':'sceneDesignTab');
      tab.click();
      if(tab.getAttribute('aria-selected')!=='true'||propertyDirty||editingFloorplan()||workcellUI.hasUnapplied())return false;
      choose(value);
      $('sceneCanvas').scrollIntoView({block:'nearest'});
      canvas.focus();
      return true;
    },
    onUpdate(){renderClearance();canvas.render();},
  });
  canvas=SceneBuilderCanvas.mount($('sceneCanvas'),{getScene:()=>controller.scene,onChange(scene){try{const prior=controller.scene;controller.change(scene);if(scene.walls.length>prior.walls.length)choose({kind:'wall',id:scene.walls.at(-1).id});else if(scene.obstacles.length>prior.obstacles.length)choose({kind:'obstacle',id:scene.obstacles.at(-1).id});else if(tool==='site')choose({kind:'site'});message('');}catch(e){message(e.message,true);}},onSelect(value){if(!commitProperties())return;selected=value;renderInspector();renderObjects();},onStatus(text){$('sceneToolHint').textContent=text;},onCanvasPoint(point,hit,raw){if(floorplan?.canvasPoint(raw))return true;if(!routeMode||!networkUI)return false;
      if(placing){const which=placing;placing=null;if(!workcellUI.setPosition(which,point)){message('请重新选择要定位的工位或立牌。',true);return true;}const text=which==='terminal'?'已定位立牌，请应用工位配置。':'已定位工位轮廓，请应用工位配置。';$('sceneToolHint').textContent=text;message(text);return true;}
      if(!requireWorkcellApplied())return true;
      const mapped=hit?.kind==='workcell'?(networkUI.activeTool()==='network-select'?{kind:'station',id:hit.id}:null):hit;
      networkUI.handleCanvasPoint(point,mapped);return true;},renderOverlay(svg,options){
      if(routeMode){
        const layer=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');
        layer.innerHTML=W.overlaySVG(controller.scene,options.scale,selected?.kind==='station'?selected.id:null,true);
        svg.append(layer);
        networkUI?.renderOverlay(svg,{...options,selection:selected});
      }
      clearance.overlay(svg,options);
    },networkHitAt(point){if(!routeMode)return null;const n=SceneNetworkModel.read(controller.scene),p=n.points.find(p=>Math.hypot(p.x-point.x,p.y-point.y)<=.2);if(p)return {kind:'point',id:p.id};for(const path of n.paths){const a=n.points.find(p=>p.id===path.sourcePointId),b=n.points.find(p=>p.id===path.targetPointId);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));if(Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy)<=.15)return {kind:'path',id:path.id};}return networkUI?.activeTool()==='network-select'?W.hitAt(controller.scene,point,.2):null;},onCancel(){
      floorplan?.cancelPick();
      if(placing){placing=null;message('已取消在图上定位。');return;}
      if(routeMode)networkUI?.cancel();
    },
    drawBackground:(...args)=>floorplan?.draw(...args),
    drawForeground:(...args)=>floorplan?.drawAnchors(...args),
    getBackgroundBounds:()=>floorplan?.bounds()||[],getOverlayBounds:()=>routeMode?W.bounds(controller.scene):[]});
  floorplan=SceneFloorplanLayer.mount($('sceneFloorplanView'),{
    api, controller, getCanvas:()=>canvas, prepareEdit:commitProperties,
    onUpdate:render,
  });
  function requireWorkcellApplied(){
    if(!workcellUI?.hasUnapplied()&&!placing)return true;
    message('请先应用工位配置，或放弃本次工位修改。',true);
    $('sceneWorkcellInspector').scrollIntoView({block:'nearest'});
    return false;
  }
  function editingFloorplan(){return floorplan.hasDraft()||floorplan.isBusy();}
  function clearanceDisabled(){
    return !api.authorized||!api.deploymentConfirmed||controller.busy||!!controller.pending||
      (!!controller.sceneScope&&controller.sceneScope!==api.scope)||!controller.scene.site||
      !controller.scene.navigation?.points.length;
  }
  function renderClearance(){
    clearance.render();
    const disabled=clearanceDisabled()||clearance.loading();
    $('sceneCheckClearance').disabled=disabled;
    $('sceneLocateClearance').disabled=disabled;
    $('sceneLocateClearance').hidden=!controller.scene.navigation?.points.length;
  }
  function checkClearance(){
    if(!requireWorkcellApplied()||!requireCalibrationDone()||!commitProperties())return;
    clearance.check();
  }
  $('sceneCheckClearance').onclick=checkClearance;
  $('sceneLocateClearance').onclick=()=>{
    $('sceneRoutesTab').click();
    if($('sceneRoutesTab').getAttribute('aria-selected')!=='true')return;
    $('sceneCheckClearance').scrollIntoView({block:'nearest'});
    $('sceneCheckClearance').focus();
    checkClearance();
  };
  function requireCalibrationDone(){
    if(!editingFloorplan())return true;
    message('请先应用或取消底图校准，再继续。',true);
    $('sceneFloorplanPanel').open=true;
    return false;
  }
  function message(text,error=false){const el=$('sceneMessage');el.hidden=!text&&!controller.pending&&!controller.conflict;el.dataset.error=error?'true':'false';el.replaceChildren(document.createTextNode(text));if(controller.pending){const b=document.createElement('button');b.className='button';b.textContent='核对上次保存';b.disabled=controller.busy;b.onclick=()=>act(()=>controller.reconcile(),'已核对，场景保存成功。');el.append(b);if(controller.canRetry){const retry=document.createElement('button');retry.className='button';retry.textContent='重试原保存';retry.disabled=controller.busy;retry.onclick=()=>act(()=>controller.retryPending(),'原场景已保存。');el.append(retry);}}if(controller.conflict){const b=document.createElement('button');b.className='button';b.textContent='保存为新场景';b.disabled=controller.busy;b.onclick=()=>act(()=>controller.save(true),'已另存为新场景。');el.append(b);const r=document.createElement('button');r.className='button';r.textContent='重新打开服务器版本';r.onclick=()=>withDiscard(()=>act(()=>controller.open(controller.id),'已打开服务器版本。'));el.append(r);}}
  function friendly(error){if(error.status===409)return '服务器已有更新版本。本页修改已保留；可以另存为新场景，或重新打开服务器版本。';if(error.status===401||error.status===403)return '连接权限已失效，请重新连接草稿库。本页修改仍保留。';if(controller.pending)return '保存结果尚未确认。本页已保留原请求，请核对上次保存。';return error.message||'操作未完成，请保留本页修改后重试。';}
  async function act(action,success){try{await action();message(success||'');return true;}catch(e){message(friendly(e),true);return false;}finally{render();}}
  function withDiscard(action){if(!requireWorkcellApplied()||!commitProperties())return;if(controller.busy||floorplan.isBusy())return;if(controller.pending){message('请先核对上次保存，再切换场景。',true);return;}if(!controller.dirty&&!floorplan.hasDraft()){action();return;}discardAction=action;$('sceneDiscardDialog').showModal();}
  let propertyDirty=false;
  document.addEventListener('input',e=>{if(e.target.closest('#sceneProperties'))propertyDirty=true;});
  function commitProperties(){const form=$('sceneProperties');if(!propertyDirty||!form)return true;if(!form.reportValidity())return false;propertyDirty=false;form.requestSubmit();return !propertyDirty;}
  function choose(selection){if(!commitProperties())return;selected=selection;canvas.setSelection(selection);renderInspector();renderObjects();}
  function setTool(value){if(controller.busy||controller.pending||editingFloorplan())return;tool=value;canvas.setTool(value);$('sceneToolHint').textContent=value==='select'?'选择对象，拖动可调整位置。':value==='site'?'拖出矩形，或点选两个对角；已有场地时将重画边界。':value==='wall'?'从起点拉到终点，或点选两个端点。':'点击画布放置，可在右侧调整尺寸。';$('sceneWelcome').hidden=routeMode||!!controller.scene.site||!!controller.scene.floorplan||editingFloorplan()||tool!=='select';document.querySelectorAll('[data-scene-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sceneTool===value)));}
  function renderObjects(){const scene=controller.scene,items=[...(scene.site?[{kind:'site',id:'site',name:'场地'}]:[]),...scene.walls.map(o=>({...o,kind:'wall'})),...scene.obstacles.map(o=>({...o,kind:'obstacle'}))];$('sceneObjectCount').textContent=items.length;$('sceneObjects').innerHTML=items.length?items.map(o=>`<button data-scene-select="${o.kind}:${o.id}" aria-pressed="${selected?.kind===o.kind&&(o.kind==='site'||selected.id===o.id)}">${esc(o.name)}</button>`).join(''):'<p>画布还是空的</p>';}
  const number=(key,label,value,extra='')=>`<label>${label}<input name="${key}" type="number" step="0.01" value="${esc(value)}" required ${extra}></label>`;
  const pair=(a,b)=>`<div class="scene-field-pair">${a}${b}</div>`;
  function renderInspector(){if(propertyDirty)return;if(routeMode){workcellUI?.render();networkUI?.render();return;}const o=selected&&M.find(controller.scene,selected),el=$('sceneInspector');if(!o){el.innerHTML='<h2>对象属性</h2><p>选中画布或列表中的对象，在这里调整尺寸。</p><h3>搭建顺序</h3><p>① 画出场地轮廓<br>② 拉墙分隔空间<br>③ 放入预设障碍</p><button id="sceneCreateBySize" class="button">按尺寸建立场地</button><p>所有尺寸以米为单位。高度与厚度会随场景保存。</p>';$('sceneCreateBySize').onclick=createSite;return;}
    const site=selected.kind==='site',wall=selected.kind==='wall',heading=site?'场地':wall?'墙体':'障碍物';let fields=site?'':`<label>名称<input name="name" value="${esc(o.name)}" maxlength="80" required></label>`;
    fields+=wall?'<h3>墙体端点</h3>'+pair(number('sx','起点 X（m）',o.start.x),number('sy','起点 Y（m）',o.start.y))+pair(number('ex','终点 X（m）',o.end.x),number('ey','终点 Y（m）',o.end.y)):'<h3>'+ (site?'场地左下角':'中心位置')+'</h3>'+pair(number('x','X（m）',o.x),number('y','Y（m）',o.y));
    if(wall)fields+='<h3>尺寸</h3>'+pair(number('thickness','厚度（m）',o.thickness,'min="0.01" max="10"'),number('height','高度（m）',o.height,'min="0.01" max="100"'));
    else fields+='<h3>尺寸</h3>'+pair(number('width','宽度（m）',o.width,'min="0.01" max="1000"'),number('depth','进深（m）',o.depth,'min="0.01" max="1000"'))+(site?'':pair(number('height','高度（m）',o.height,'min="0.01" max="100"'),number('angle','朝向（°）',Math.round(o.yaw*180/Math.PI*100)/100,'min="-180" max="180"')));
    el.innerHTML=`<h2>${heading}</h2><p>${site?'边界定义场地范围，不自动生成实体墙。':wall?'以端点定位；厚度在墙体中心线两侧展开。':'预设尺寸可按实际设备调整。'}</p><form id="sceneProperties">${fields}<button class="button button-primary" type="submit">应用修改</button></form><div class="scene-inspector-actions">${site?'':'<button id="sceneDuplicate" class="button">复制</button>'}<button id="sceneDelete" class="button">删除${site?'场地':''}</button></div>`;
    $('sceneProperties').onsubmit=e=>{e.preventDefault();if(controller.busy||controller.pending)return;const f=new FormData(e.currentTarget),num=k=>Number(f.get(k));let patch=wall?{name:f.get('name').trim(),start:{x:num('sx'),y:num('sy')},end:{x:num('ex'),y:num('ey')},thickness:num('thickness'),height:num('height')}:{x:num('x'),y:num('y'),width:num('width'),depth:num('depth')};if(!site&&!wall)Object.assign(patch,{name:f.get('name').trim(),height:num('height'),yaw:num('angle')*Math.PI/180});try{controller.change(M.update(controller.scene,selected,patch));message('已应用修改，记得保存场景。');}catch(error){propertyDirty=true;message(error.message,true);}};
    $('sceneDelete').onclick=()=>{try{controller.change(M.remove(controller.scene,selected));choose(null);message('已删除，可撤销。');}catch(e){message(e.message,true);}};
    if($('sceneDuplicate'))$('sceneDuplicate').onclick=()=>{try{controller.change(M.duplicate(controller.scene,selected));message('已复制对象，可在列表中选择并移动。');}catch(e){message(e.message,true);}};
  }
  function render(){if(!canvas||!floorplan)return;
    floorplan.refresh();
    renderAccess();
    renderClearance();
    const blocked=controller.busy||!!controller.pending||floorplan.isBusy();
    const calibration=editingFloorplan();
    const plan=controller.scene.floorplan;
    $('sceneFloorplanLabel').textContent=plan||calibration?'厂房底图':'导入厂房底图';
    $('sceneFloorplanSummary').textContent=calibration?'校准中':plan?'已校准 · '+plan.name:'PNG / JPG · 两点校准';
    $('sceneFloorplanPanel').classList.toggle('scene-floorplan-editing',calibration);
    $('sceneCanvas').classList.toggle('scene-calibrating',calibration);
    if(calibration)canvas.cancel();
    const awaiting=new URL(location.href).searchParams.has('sceneId')&&!controller.id;document.body.classList.toggle('scene-awaiting-saved',awaiting);if(awaiting&&!api.authorized)message('请登录后打开已保存的场景。');$('sceneName').value=controller.scene.name;$('sceneName').disabled=controller.busy||!!controller.pending;$('sceneSaveState').textContent=controller.pending?'保存结果待核对':controller.busy?'正在读取 / 保存…':controller.revision?`已保存 r${controller.revision}${controller.dirty?' · 有未保存修改':''}`:controller.dirty?'有未保存修改':'尚未保存';$('sceneSave').disabled=blocked;$('sceneOpen').disabled=blocked;$('sceneNew').disabled=blocked;$('sceneUndo').disabled=blocked||calibration||!controller.undo.length;$('sceneRedo').disabled=blocked||calibration||!controller.redo.length;$('sceneWelcome').hidden=routeMode||!!controller.scene.site||!!controller.scene.floorplan||editingFloorplan()||tool!=='select';$('sceneCanvas').style.pointerEvents=blocked?'none':'';document.querySelectorAll('[data-scene-tool],[data-route-tool]').forEach(b=>b.disabled=blocked||calibration);canvas.render();renderObjects();renderInspector();$('sceneReview').textContent=controller.scene.site?`场地 ${controller.scene.site.width} × ${controller.scene.site.depth} m · 墙体 ${controller.scene.walls.length} · 障碍 ${controller.scene.obstacles.length}`:'尚未建立场地。';if(controller.warnings.length)$('sceneReview').textContent+=' · '+controller.warnings.map(w=>w.message).join('；');$('sceneRouteSummary').textContent=SceneNetworkModel.summary(controller.scene);const workcellCount=W.list(controller.scene).length;
    $('sceneWorkcellLegend').hidden=!workcellCount;
    if(workcellCount){
      const warnings=W.outside(controller.scene);
      $('sceneReview').textContent+=` · 规划工位 ${workcellCount}${warnings.length?' · '+warnings.join('；'):''}`;
    }
    generationUI?.render();publicationUI?.render();}
  function createSite(){if(!requireCalibrationDone())return;try{controller.change({...controller.scene,site:{x:0,y:0,width:12,depth:8}});choose({kind:'site'});setTool('select');canvas.fit();message('已建立 12 × 8 m 场地，可在右侧修改尺寸。');}catch(e){message(e.message,true);}}
  document.querySelectorAll('[data-scene-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.sceneTool));
  $('sceneObjects').onclick=e=>{const b=e.target.closest('[data-scene-select]');if(!b)return;const [kind,id]=b.dataset.sceneSelect.split(':');choose({kind,...(kind==='site'?{}:{id})});setTool('select');};
  function commitName(){const value=$('sceneName').value.trim();if(value===controller.scene.name)return true;try{controller.change({...controller.scene,name:value});return true;}catch(error){message(error.message,true);return false;}}
  $('sceneName').oninput=e=>{try{controller.change({...controller.scene,name:e.target.value});}catch(error){message(error.message,true);}};
  $('sceneName').onchange=()=>commitName();
  $('sceneStartSize').onclick=createSite;$('sceneUndo').onclick=()=>{if(requireWorkcellApplied()){controller.history('undo');choose(null);}};$('sceneRedo').onclick=()=>{if(requireWorkcellApplied()){controller.history('redo');choose(null);}};
  $('sceneZoomIn').onclick=()=>canvas.zoom(1);$('sceneZoomOut').onclick=()=>canvas.zoom(-1);$('sceneFit').onclick=()=>canvas.fit();
  function renderAccess(){
    $('sceneAccess').textContent=api.authorized?'操作员已登录':'操作员登录';
    $('sceneAccessStatus').textContent=api.authorized?'已登录，可读取和保存场景。':api.portalRole==='automation'?'当前使用自动化凭据。请使用操作员密钥登录。':'登录后可读取和保存场景。';
    $('sceneCredentials').hidden=api.authorized;
    $('sceneKey').disabled=api.authorized||sessionAction;
    $('sceneLogin').hidden=api.authorized;
    $('sceneLogin').disabled=sessionAction;
    $('sceneEndAccess').hidden=!(api.authorized||api.portalRole||api.logoutPending);
    $('sceneEndAccess').disabled=sessionAction;
  }
  async function loadSceneWorkspace(){
    if(knownScope&&knownScope!==api.scope&&(controller.id||controller.dirty||controller.pending)) throw Error('服务器身份已变化，请保留原连接下的修改后再打开场景。');
    knownScope=api.scope;
    await controller.list();
    if(!controller.dirty&&!controller.id){
      if(controller.restorePending()) {
        message('检测到待核对保存；只读取原场景，不会重新保存。');
        await act(()=>controller.reconcile(),'已恢复上次保存的场景。');
      } else {
        const id=new URL(location.href).searchParams.get('sceneId');
        if(id){
          if(!/^[a-f0-9]{32}$/.test(id)) throw Error('场景地址无效。');
          await controller.open(id);
          canvas.fit();
          message('已打开保存的场景。');
        }
      }
    }
    if(!$('sceneGenerationPanel').hidden) publicationUI?.refresh();
  }
  function onSessionChange(){
    if(!sessionReady)return;
    if(sessionRevision!==api.keyRevision){
      sessionRevision=api.keyRevision;
      if(api.authorized&&!sessionAction&&!controller.busy) loadSceneWorkspace().catch(error=>message(friendly(error),true));
      if(!api.authorized) {controller.catalog=[]; $('sceneCatalog').replaceChildren(); $('sceneOpenDialog').close();}
    }
    render();
  }
  function openAccess(){ $('sceneAccessError').hidden=true; $('sceneAccessDialog').showModal(); }
  $('sceneAccess').onclick=openAccess;
  $('sceneAccessDialog').addEventListener('close',()=>{$('sceneKey').value='';});
  $('sceneAccessForm').onsubmit=async e=>{
    e.preventDefault();
    if(controller.busy||sessionAction||api.authorized)return;
    const key=$('sceneKey').value.trim();
    $('sceneKey').value='';
    $('sceneAccessError').hidden=true;
    sessionAction=true;
    renderAccess();
    try {
      await api.loginPortal(key);
      if(!api.authorized)return;
      await loadSceneWorkspace();
      $('sceneAccessDialog').close();
    } catch(error) {
      $('sceneAccessError').textContent=friendly(error);
      $('sceneAccessError').hidden=false;
    } finally {sessionAction=false;render();}
  };
  $('sceneEndAccess').onclick=async()=>{
    if(controller.busy||sessionAction)return;
    sessionAction=true;
    renderAccess();
    try {await api.logoutPortal();$('sceneAccessDialog').close();message('已退出登录。');}
    catch(_) {$('sceneAccessError').textContent='未能确认已退出，请重试。';$('sceneAccessError').hidden=false;}
    finally {sessionAction=false;render();}
  };
  $('sceneSave').onclick=()=>{if(!requireWorkcellApplied()||!requireCalibrationDone()||!commitProperties())return;if(!commitName())return;if(!api.authorized){$('sceneAccessDialog').showModal();return;}act(()=>controller.save(),`场景已保存，可从“打开场景”重新载入。`);};
  $('sceneOpen').onclick=async()=>{if(!requireWorkcellApplied())return;if(!api.authorized){$('sceneAccessDialog').showModal();return;}if(await act(()=>controller.list())){$('sceneCatalog').innerHTML=controller.catalog.length?controller.catalog.map(s=>`<div class="scene-catalog-row"><div><strong>${esc(s.name)}</strong><small>修订 ${s.revision} · ${esc(new Date(s.updatedAt).toLocaleString())}</small></div><button class="button" data-open-scene="${esc(s.id)}">打开</button></div>`).join(''):'<p>草稿库里还没有场景。建立场地后点击“保存场景”。</p>';$('sceneOpenDialog').showModal();}};
  $('sceneCatalog').onclick=e=>{const b=e.target.closest('[data-open-scene]');if(!b)return;withDiscard(async()=>{$('sceneOpenDialog').close();if(await act(()=>controller.open(b.dataset.openScene),'已打开保存的场景。')){floorplan.reset();choose(null);render();setTool('select');canvas.fit();}});};
  $('sceneNew').onclick=()=>withDiscard(()=>{floorplan.reset();controller.fresh();modePanel('geometry');choose(null);setTool('select');canvas.fit();message('');});
  $('sceneKeepEditing').onclick=()=>{$('sceneDiscardDialog').close();discardAction=null;};$('sceneDiscard').onclick=()=>{const fn=discardAction;discardAction=null;$('sceneDiscardDialog').close();fn?.();};document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  window.addEventListener('beforeunload',e=>{if(controller.dirty||controller.pending||propertyDirty||editingFloorplan()||workcellUI?.hasUnapplied()){e.preventDefault();e.returnValue='';}});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();$('sceneSave').click();}});
  function savedScene(){return {id:controller.id,revision:controller.revision,scene:controller.scene,dirty:controller.dirty,pending:controller.pending,busy:controller.busy||!api.authorized||!api.deploymentConfirmed,scope:api.scope,keyRevision:api.keyRevision};}
  publicationUI=ScenePublicationUI.mount($('scenePublicationView'),api,{getSavedScene:savedScene});
  generationUI=SceneGenerationUI.mount($('sceneGenerationView'),api,{getSavedScene:savedScene,onFrozen:release=>publicationUI.select(release),onPlan(){
    modePanel('routes');const first=W.list(controller.scene).find(st=>st.workcell.terminal)||W.list(controller.scene)[0];if(first)choose({kind:'station',id:first.id});
  },onStatus:message});
  function updateRouteTools(){document.querySelectorAll('[data-route-tool]').forEach(b=>{const value=b.dataset.routeTool==='network-select'?'network-select':b.dataset.routeTool.replace('network-','');b.setAttribute('aria-pressed',String(networkUI?.activeTool()===value));b.disabled=controller.busy||!!controller.pending||editingFloorplan();});canvas.render();}
  networkUI=SceneNetworkUI.mount($('sceneNetworkInspector'),{getScene:()=>controller.scene,getSelection:()=>selected,showTools:false,isDisabled:()=>controller.busy||!!controller.pending||editingFloorplan(),onChange(scene){if(controller.busy||controller.pending)return;if(!requireWorkcellApplied())throw Error('请先应用或放弃工位修改。');controller.change(scene);},onSelect(value){if(requireWorkcellApplied())choose(value);},onStatus(text,error){message(text,error);$('sceneToolHint').textContent=text;},onToolChange:updateRouteTools,onCanvasFocus:()=>canvas.focus()});
  workcellUI=SceneWorkcellUI.mount($('sceneWorkcellInspector'),{
    getScene:()=>controller.scene,getSelection:()=>routeMode?selected:null,
    isDisabled:()=>controller.busy||!!controller.pending||editingFloorplan(),
    onChange(plan){
      if(!routeMode||selected?.kind!=='station')throw Error('请先选择停车工位。');
      placing=null;
      controller.change(SceneNetworkModel.setWorkcell(controller.scene,selected.id,plan));
    },
    onPlace(which){
      placing=which;
      const text=which==='terminal'?'点击画布定位立牌。Esc 取消。':'点击画布定位工位轮廓中心。Esc 取消。';
      $('sceneToolHint').textContent=text;
      message(text);
      canvas.focus();
    },
    onStatus(text,error){
      if(!error)placing=null;
      message(text,error);
    },
  });
  document.querySelectorAll('[data-route-tool]').forEach(b=>b.onclick=()=>{
    if(requireWorkcellApplied())networkUI.setTool(b.dataset.routeTool==='network-select'?'network-select':b.dataset.routeTool.replace('network-',''));
  });
  function modePanel(mode){if(!requireWorkcellApplied()||!requireCalibrationDone()||!commitProperties())return;const generating=mode==='generate';routeMode=mode==='routes';selected=null;canvas.setSelection(null);setTool('select');document.body.classList.toggle('scene-planning',routeMode);$('sceneDesignPanel').hidden=generating;$('sceneGenerationPanel').hidden=!generating;$('sceneGeometryLibrary').hidden=routeMode;$('sceneRouteLibrary').hidden=!routeMode;$('sceneInspector').hidden=routeMode;$('sceneNetworkInspector').hidden=!routeMode;workcellUI.render();$('sceneDesignPanel').setAttribute('aria-labelledby',routeMode?'sceneRoutesTab':'sceneDesignTab');$('sceneDesignTab').setAttribute('aria-selected',String(mode==='geometry'));$('sceneRoutesTab').setAttribute('aria-selected',String(routeMode));$('sceneGenerationTab').setAttribute('aria-selected',String(generating));$('scenePageTitle').textContent=generating?'校验并发布仿真':routeMode?'规划路线与停车工位':'场景搭建';$('scenePageDescription').textContent=generating?'核对全部路线净空和同源地图，再明确发布到隔离仿真。':routeMode?'在场地上放点、连线、设置停车工位和车辆起点。':'导入厂房底图，或从空白画布搭建场地。';if(generating){generationUI.render();publicationUI.refresh();}else{if(routeMode)networkUI.setTool('network-select');render();canvas.fit();}updateRouteTools();}
  $('sceneDesignTab').onclick=()=>modePanel('geometry');$('sceneRoutesTab').onclick=()=>modePanel('routes');$('sceneGenerationTab').onclick=()=>modePanel('generate');
  const embedded=new URL(location.href).searchParams.get('embedded')==='1'&&parent!==window;
  function leaveEditor(view='maps'){withDiscard(()=>{if(embedded)parent.postMessage({type:'fleet-editor-close',view},location.origin);else location.href=view==='simulation'?'./?task=scene#/simulation':'./#/maps';});}
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname==='/'&&u.hash==='#/simulation'&&u.searchParams.get('task')==='scene'){e.preventDefault();leaveEditor('simulation');}});
  document.querySelectorAll('a[href="./#/maps"]').forEach(a=>a.onclick=e=>{e.preventDefault();leaveEditor();});
  window.addEventListener('message',e=>{if(!embedded||e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==='fleet-editor-close-request')leaveEditor();});
  const exampleParams=new URL(location.href).searchParams;
  if(exampleParams.get('example')==='fab-transfer') {
    $('sceneExampleGuide').hidden=false;
    if(!exampleParams.has('sceneId')) {controller.change(SceneExample.create());message('示例已打开为独立练习副本。可直接修改；点击保存后才写入当前服务器。');}
  }
  render();canvas.fit();
  sessionReady=true;
  api.watchPortalSession().then(()=>{if(!api.authorized&&!embedded&&exampleParams.has('sceneId'))openAccess();});
  window.PortalUpdates?.addGuard('scene-editor',()=>{
    if(controller.dirty||propertyDirty||editingFloorplan()||workcellUI?.hasUnapplied()||placing)return '场景编辑器有未保存或未应用的修改（含工位与底图校准）。请先应用并保存，或明确放弃修改后关闭编辑器，再更新。';
    if(controller.busy||controller.pending)return '场景正在保存或保存结果待核对，请先核对原保存结果，再更新。';
    return generationUI?.updateBlocker?.()||publicationUI?.updateBlocker?.()||window.PortalUpdates.apiBlocker(api)||'';
  });
  window.PortalUpdates?.ready();
  if(new URL(location.href).searchParams.get('step')==='simulation')modePanel('generate');
})();
