const test=require('node:test'),assert=require('node:assert/strict'),UI=require('../src/pages/maps/scene-builder/generation-ui.js');
const id='a'.repeat(32),gen='b'.repeat(32),rid='c'.repeat(32);const settle=()=>new Promise(r=>setImmediate(r));
function harness(handler){const nodes=new Map(),container={innerHTML:'',querySelector(sel){if(!nodes.has(sel))nodes.set(sel,{listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}});return nodes.get(sel);},querySelectorAll(){return [];}},values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},calls=[],saved={id,revision:1,scene:{site:{x:0,y:0,width:12,depth:8}},dirty:false,pending:null,busy:false,scope:'pair',keyRevision:1};let count=0;const api={id:()=>++count===1?gen:rid,request:async(path,body)=>{calls.push({path,body});return handler(path,body);}};const generated=[],frozen=[];const ui=UI.mount(container,api,{getSavedScene:()=>saved,storage,onGenerated:v=>generated.push(v),onFrozen:v=>frozen.push(v)});return {container,nodes,values,storage,calls,saved,generated,frozen,ui,click:async key=>{nodes.get('[data-generation-'+key+']').listeners.click();await settle();await settle();}};}
const ready=()=>({generationId:gen,sceneId:id,revision:1,status:'READY',result:{raster:{metadata:{resolution:.05,width:20,height:20,origin:[0,0],frame:'map'}},imageBase64:'YWJj'}});
test('preview uses recorded raster origin and resolution and never loads remote image URLs',()=>{const html=UI.previewSVG(ready().result);assert.match(html,/viewBox="0 -1 1 1"/);assert.match(html,/导航占据预览/);assert.match(html,/data:image\/png;base64,YWJj/);assert.doesNotMatch(UI.previewSVG({...ready().result,imageBase64:'https://evil.test'}),/evil/);assert.match(UI.previewSVG({raster:{metadata:{}}}),/缺少有效/);});
test('generate records original intent before POST and freeze never publishes',async()=>{let h;h=harness((path,body)=>{if(path==='sim-publishing/status')return {kernelHash:'hash'};if(path.endsWith('/generations')){assert.ok(h.values.size);assert.equal(body.layout.centerX,6);assert.equal(body.layout.centerY,5.5);return ready();}if(path==='sim-publishing/scene-freeze')return {releaseId:rid};throw Error(path);});await h.click('start');assert.equal(h.generated.length,1);await h.click('freeze');assert.equal(h.frozen[0].releaseId,rid);assert.ok(h.calls.every(c=>!c.path.includes('publications')&&!c.path.includes('sim-runs')));assert.equal(h.calls.filter(c=>c.body).length,2);h.ui.destroy();});
test('generation lost response reload only GETs original ID and does not regenerate',async()=>{const h=harness((path,body)=>{if(path==='sim-publishing/status')return {};if(body)throw Error('network');return ready();});await h.click('start');assert.match(h.container.innerHTML,/结果待核对/);await h.click('refresh');assert.equal(h.generated.length,1);assert.equal(h.calls.filter(c=>c.body).length,1);h.ui.destroy();});
test('dirty scene rejects generate and late response cannot overwrite another revision',async()=>{let resolve;const h=harness((path,body)=>path==='sim-publishing/status'?{}:new Promise(r=>resolve=r));h.saved.dirty=true;await h.click('start');assert.equal(h.calls.filter(c=>c.body).length,0);h.saved.dirty=false;const pending=h.click('start');await settle();h.saved.revision=2;h.ui.render();resolve(ready());await pending;assert.equal(h.generated.length,0);assert.doesNotMatch(h.container.innerHTML,/生成完成/);h.ui.destroy();});
test('freeze uncertainty retains original release ID and readback only recovers it',async()=>{const h=harness((path,body)=>{if(path==='sim-publishing/status')return {kernelHash:'hash'};if(path.endsWith('/generations'))return ready();if(path==='sim-publishing/scene-freeze')throw Error('network');if(path.includes('/generations/'))return ready();if(path==='sim-publishing/releases/'+rid)return {releaseId:rid};throw Error(path);});await h.click('start');await h.click('freeze');await h.click('refresh');assert.equal(h.calls.filter(c=>c.path==='sim-publishing/scene-freeze').length,1);assert.equal(h.frozen.at(-1).releaseId,rid);h.ui.destroy();});
test('dictionary topology millimetres and serialNumber spawns render recorded navigation geometry',()=>{const html=UI.previewSVG({...ready().result,requiredTopology:{points:{A:{x:3000,y:6500},B:{x:5000,y:6500}},paths:{AB:['A','B']}},vehicles:[{serialNumber:'LAB-01',spawn:{x:3,y:6.5,yaw:0}}]});assert.match(html,/x1="3" y1="-6.5" x2="5"/);assert.match(html,/LAB-01/);});
test('new attempt after rejection clears old status and timeout preserves the new original intent',async()=>{let posts=0;const h=harness((path,body)=>{if(path==='sim-publishing/status')return {};if(body){if(++posts===1)return {...ready(),status:'REJECTED'};throw Error('lost');}return ready();});await h.click('start');assert.match(h.container.innerHTML,/生成未通过/);await h.click('start');assert.match(h.container.innerHTML,/生成结果待核对/);await h.click('start');assert.equal(posts,2);h.ui.destroy();});
test('freeze rechecks dirty state after awaiting current target hash',async()=>{let resolveStatus;const h=harness((path,body)=>{if(path==='sim-publishing/status')return new Promise(r=>resolveStatus=r);return ready();});await h.click('start');const pending=h.click('freeze');await settle();h.saved.dirty=true;resolveStatus({kernelHash:'hash'});await pending;assert.equal(h.calls.filter(c=>c.path==='sim-publishing/scene-freeze').length,0);h.ui.destroy();});
test('authentication later enables a fresh capability read without any mutation',async()=>{const h=harness(()=>({motionPresets:[{id:'acceptance-v1'}]}));await settle();assert.equal(h.calls.length,0);h.saved.keyRevision++;const apiKey='test';// The harness API is exposed only by mount closure; recreate with explicit authenticated API below.
h.ui.destroy();let count=0;const nodes={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}},api={authorized:false,key:'',request:async()=>{count++;return {motionPresets:[]};}},s={...h.saved};const ui=UI.mount(nodes,api,{getSavedScene:()=>s,storage:h.storage});await settle();assert.equal(count,0);api.authorized=true;api.key=apiKey;s.keyRevision++;ui.render();await settle();assert.equal(count,1);ui.destroy();});
test('definitive protocol freeze rejection allows fresh review while transport uncertainty retries only original body',async()=>{let attempts=0;const bodies=[];const h=harness((path,body)=>{if(path==='sim-publishing/status')return {kernelHash:'hash'};if(path.endsWith('/generations'))return ready();if(path==='sim-publishing/scene-freeze'){bodies.push(body);if(++attempts===1)throw Object.assign(Error('baseline'),{status:409,protocolFault:true});if(attempts===2)throw Error('network');return {releaseId:rid};}throw Error(path);});await h.click('start');await h.click('freeze');assert.match(h.container.innerHTML,/重新审阅/);await h.click('freeze');await h.click('freeze-retry');assert.deepEqual(bodies[1],bodies[2]);assert.equal(h.frozen.length,1);h.ui.destroy();});
test('new generation plan clears only local READY plan and preserves no uncertain freeze intent loss',async()=>{const h=harness((path,body)=>path==='sim-publishing/status'?{}:ready());await h.click('start');assert.equal(h.values.size,1);const count=h.calls.length;await h.click('new');assert.equal(h.values.size,0);assert.equal(h.calls.length,count);assert.doesNotMatch(h.container.innerHTML,/生成完成/);h.ui.destroy();const u=harness((path,body)=>{throw Error('network');});await u.click('start');await u.click('new');assert.equal(u.values.size,1);assert.match(u.container.innerHTML,/结果待核对|核对原生成/);u.ui.destroy();});
test('clearance rejection shows business guidance with object name and retains raw cause only in evidence',async()=>{const cause={code:'SCENE_GENERATION_REJECTED',message:'clearance failed at '+id};const h=harness(()=>({...ready(),status:'REJECTED',error:cause}));h.saved.scene.walls=[{id,name:'北墙'}];await h.click('start');const main=h.container.innerHTML.split('<details class="generation-evidence">')[0];assert.match(main,/验证路线与墙体或障碍太近/);assert.match(main,/北墙/);assert.doesNotMatch(main,/clearance failed/);assert.match(h.container.innerHTML,/clearance failed/);h.ui.destroy();});
test('reload restores the original real intent layout and development preset and locks nonrejected parameters',async()=>{
 const previous=globalThis.MotionPresetUI;globalThis.MotionPresetUI=require('../motion-preset-ui.js');
 const saved={id,revision:5,scene:{site:{x:0,y:-.4,width:14,depth:9}},dirty:false,pending:null,busy:false,scope:'pair',keyRevision:1},original={sceneId:id,body:{generationId:gen,revision:5,layout:{centerX:7,centerY:5.5},motionPresetId:'development-v1'}},values=new Map([['fleet-scene-generation:pair:'+id+':5',JSON.stringify({intent:original,freezeIntent:null})]]),container={innerHTML:'',querySelector(){return null;},querySelectorAll(){return [];}},calls=[];
 const api={authorized:true,key:'key',request:async(path,body)=>{calls.push({path,body});return path==='sim-publishing/status'?{motionPresets:[{id:'acceptance-v1',parameters:{}},{id:'development-v1',parameters:{}}]}:{...ready(),revision:5,layout:original.body.layout,motionPresetId:'development-v1'};}};
 const ui=UI.mount(container,api,{getSavedScene:()=>saved,storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});await settle();await settle();assert.match(container.innerHTML,/data-generation-x value="7" disabled/);assert.match(container.innerHTML,/data-generation-y value="5.5" disabled/);assert.match(container.innerHTML,/value="development-v1" checked disabled/);assert.ok(calls.every(c=>!c.body));ui.destroy();globalThis.MotionPresetUI=previous;
});

test('authored route generation binds null layout and uses its immutable parking preview',async()=>{const h=harness((path,body)=>{if(body){assert.equal(body.layout,null);return ready();}return {};});h.saved.scene.schemaVersion='1.1';h.saved.scene.navigation={points:[],paths:[],stations:[],spawns:[]};h.ui.render();assert.doesNotMatch(h.container.innerHTML,/data-generation-x/);assert.match(h.container.innerHTML,/全网串行通行/);await h.click('start');assert.equal(h.generated.length,1);assert.match(h.container.innerHTML,/规划路线/);h.ui.destroy();const html=UI.previewSVG({...ready().result,navigation:{points:[{id:'P-1',x:3,y:5}],stations:[{name:'取放工位',pointId:'P-1',yaw:0}]}});assert.match(html,/取放工位/);assert.match(html,/x="2.7"/);});
test('terminal reference can generate explicitly and never issues a call or detection request',async()=>{
 const h=harness(()=>ready());h.saved.scene.schemaVersion='1.1';h.saved.scene.navigation={stations:[{name:'取放工位',workcell:{templateId:'lift-table-v1',terminal:{tagId:7,buttonId:'CALL-A'}}}]};
 h.ui.render();assert.match(h.container.innerHTML,/data-generation-start/);await h.click('start');assert.equal(h.calls.filter(c=>c.body).length,1);assert.ok(h.calls.every(c=>c.path.endsWith('/generations')));h.ui.destroy();
});


test('table and buffer without terminals allow an explicit generation and explain navigation-only scope',async()=>{
 const h=harness(()=>ready());h.saved.scene.schemaVersion='1.1';
 h.saved.scene.navigation={stations:[{name:'高桌',workcell:{templateId:'lift-table-v1'}},{name:'缓冲',workcell:{templateId:'buffer-v1'}}]};
 h.ui.render();assert.match(h.container.innerHTML,/data-generation-start/);assert.match(h.container.innerHTML,/尚不执行识别、顶升或搬运/);
 await h.click('start');assert.equal(h.calls.filter(c=>c.body).length,1);assert.equal(h.generated.length,1);h.ui.destroy();
});

test('workcell review presents measured envelope and distinguishes blocked deck from leg-only projection',()=>{
 const html=UI.workcellReview({workcellClearance:{robotHeightM:.6125,sweptRadiusM:.52,workcells:[{templateId:'lift-table-v1',stationName:'<高桌>',clearHeightM:.8,underDeckMarginM:.1875,gapWidthM:1.4,gapDepthM:1.4,tabletopInOccupancy:false}]}});
 assert.match(html,/0.613 m/);assert.match(html,/1.400 m/);assert.match(html,/&lt;高桌&gt;/);assert.match(html,/桌腿计入导航占据/);assert.equal(UI.workcellReview({}),'');
});

test('terminal preview separates generated reference from unavailable recognition and calling',()=>{
 const html=UI.workcellReview({workcellClearance:{robotHeightM:.6125,sweptRadiusM:.511,workcells:[{templateId:'buffer-v1',stationName:'工位',terminal:{tagId:7,buttonId:'<CALL>',markerCenterHeightM:1.1,markerSizeM:.2,baseWidthM:.36,baseDepthM:.42,minimumDistanceM:1.2}}]}});
 assert.match(html,/视觉识别未接入/);assert.match(html,/按钮未接入/);assert.match(html,/&lt;CALL&gt;/);assert.match(html,/0.360 m/);assert.doesNotMatch(html,/<button/);
});

test('terminal route blockage has named Chinese placement guidance',async()=>{
 const h=harness(()=>({...ready(),status:'REJECTED',error:{message:'clearance (stationId=S-3;reason=workcell-terminal-clearance)'}}));h.saved.scene.schemaVersion='1.1';h.saved.scene.navigation={stations:[{id:'a',name:'不是这个工位'},{id:'S-3',name:'高桌工位'}]};h.ui.render();await h.click('start');const main=h.container.innerHTML.split('<details class="generation-evidence">')[0];assert.match(main,/立牌阻挡车辆通行，工位：高桌工位/);assert.doesNotMatch(main,/不是这个工位/);h.ui.destroy();
});

test('unavailable service and historical unknown results offer the workbench and retry the original generation',async()=>{
 for(const status of ['UNAVAILABLE','UNKNOWN']){
  const bodies=[];
  const h=harness((path,body)=>{
   bodies.push(body);
   if(bodies.length===1)return {...ready(),status,error:{code:status==='UNAVAILABLE'?'SCENE_GENERATOR_UNAVAILABLE':'SCENE_GENERATION_UNCERTAIN',message:'service request failed'}};
   return ready();
  });
  h.saved.scene.schemaVersion='1.1';
  assert.doesNotMatch(h.container.innerHTML,/前往仿真工作台/);
  await h.click('start');
  const main=h.container.innerHTML.split('<details class="generation-evidence">')[0];
  assert.match(main,/href="\.\/\?task=scene#\/simulation">前往仿真工作台/);
  assert.match(main,/data-generation-retry/);
  assert.doesNotMatch(main,/路网未通过|净空检查未通过|data-generation-new/);
  assert.equal(bodies.length,1);
  await h.click('retry');
  assert.deepEqual(bodies,[bodies[0],bodies[0]]);
  assert.equal(h.generated.length,1);
  h.ui.destroy();
 }
});
