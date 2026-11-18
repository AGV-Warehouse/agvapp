const test=require('node:test'),assert=require('node:assert/strict');
const {Controller,compareScenes,contentHTML,historicalSVG,mount}=require('../src/pages/maps/scene-history-ui.js');
const {previewSVG}=require('../src/pages/maps/scene-library.js');
const A='a'.repeat(32),B='b'.repeat(32),R='c'.repeat(32);
const copy=x=>JSON.parse(JSON.stringify(x));
const draft=()=>({schemaVersion:'1.1',name:'旧场景',frame:'map',unit:'m',site:{x:0,y:0,width:12,depth:8},walls:[{id:'wall',name:'东墙',start:{x:1,y:2},end:{x:1,y:7},height:3,thickness:.2}],obstacles:[{id:'box',name:'设备箱',templateId:'equipment-box-v1',x:3,y:4,width:1,depth:2,height:1.5,yaw:0}],navigation:{points:[{id:'P1',name:'停靠点',x:2,y:3},{id:'P2',name:'通行点',x:4,y:3}],paths:[{id:'R1',name:'进料路线',sourcePointId:'P1',targetPointId:'P2',direction:'bidirectional',maxVelocity:.05}],stations:[{id:'S1',name:'进料站',pointId:'P1',yaw:0}],spawns:[{vehicleName:'LAB-01',pointId:'P1',yaw:0}]}});
test('a moved terminal is visible in the station revision diff without moving the high table',()=>{
 const before=draft();before.navigation.stations[0].workcell={templateId:'lift-table-v1',footprint:{x:3,y:3,yaw:0,width:1.2,depth:.8},table:{clearHeight:.6,topThickness:.08,legWidth:.08},terminal:{x:4,y:3,yaw:0,height:1.1,tagId:0,buttonId:'CALL-1'}};
 const after=structuredClone(before);after.navigation.stations[0].workcell.terminal.y=5;
 const [change]=compareScenes(before,after);
 assert.deepEqual(change.fields.map(f=>f.key),['workcell.terminal.y']);
 assert.match(change.text,/立牌 Y（m） 3 → 5/);
});
const snapshot=(id=A,revision=1)=>({id,revision,updatedAt:'2026-11-10T00:00:00Z',scene:{...draft(),name:revision===1?'旧场景':'新场景'},warnings:[]});
const history=(id=A)=>({sceneId:id,name:'新场景',headRevision:2,revisions:[{revision:1,name:'旧场景',summary:{width:12,depth:8,walls:1,obstacles:1,points:2,paths:1,stations:1,spawns:1}},{revision:2,name:'新场景'}],generations:[],versions:[],coverage:['仅当前部署保留记录']});
function storage(){const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),values};}
function harness(request,store=storage()){
 const calls=[],api={apiBase:'https://example.test/api/v1/?token=NEVER_STORE',scope:'https://example.test/api/v1/#deployment=A',key:'memory-secret',keyRevision:1,authorized:true,deploymentConfirmed:true,request:async(path,body)=>{calls.push({path,body});return request(path,body);}};
 return {api,calls,store,c:new Controller(api,{storage:store})};
}
const responder=async path=>path.endsWith('/history')?history(path.split('/')[2]):snapshot(path.split('/')[2],Number(path.split('/').at(-1)));
const tick=()=>new Promise(setImmediate);

test('history is invisible by default; selected visible scene issues only GET, revisions load on demand',async()=>{
 const h=harness(responder);await h.c.selectScene(A);assert.equal(h.calls.length,0);
 await h.c.setVisible(true);assert.equal(h.calls.length,1);assert.equal(h.c.tab,'versions');assert.equal(h.c.history.sceneId,A);
 await h.c.selectTab('revisions');assert.equal(h.c.snapshots.size,2);const count=h.calls.length;
 await h.c.selectTab('versions');await h.c.selectTab('revisions');assert.equal(h.calls.length,count);
 await h.c.selectCompare(1,1);assert.equal(h.calls.length,count);assert.deepEqual(compareScenes(h.c.snapshots.get(1).scene,h.c.snapshots.get(1).scene),[]);
 assert.ok(h.calls.every(c=>c.body===undefined&&/^map-workspace\/scenes\/[a-f0-9]{32}\/(?:history|revisions\/[12])$/.test(c.path)));
 await h.c.selectScene(null);assert.equal(h.c.history,null);assert.equal(h.c.snapshots.size,0);assert.equal(h.calls.length,count);
});

test('comparison detects coordinates orientation height thickness dimensions name route station and spawn changes',()=>{
 const a=draft(),b=copy(a);b.name='新名称';Object.assign(b.site,{x:1,width:14});Object.assign(b.walls[0],{name:'改名墙',height:4,thickness:.3});b.walls[0].end.y=6;
 Object.assign(b.obstacles[0],{x:5,y:6,width:2,depth:3,height:2,yaw:1});b.navigation.points[0].x=3;
 Object.assign(b.navigation.paths[0],{sourcePointId:'P2',targetPointId:'P1',direction:'forward',maxVelocity:.1});b.navigation.stations[0].yaw=.5;Object.assign(b.navigation.spawns[0],{pointId:'P2',yaw:1});
 const changes=compareScenes(a,b),fields=kind=>changes.find(c=>c.kind===kind).fields.map(f=>f.key);
 assert.equal(changes.length,8);assert.deepEqual(fields('walls'),['name','end.y','thickness','height']);assert.deepEqual(fields('obstacles'),['x','y','width','depth','height','yaw']);assert.deepEqual(fields('paths'),['sourcePointId','targetPointId','direction','maxVelocity']);assert.deepEqual(fields('stations'),['yaw']);assert.deepEqual(fields('spawns'),['pointId','yaw']);assert.deepEqual(a,draft());
});

test('stable IDs ignore order, preserve rename, and distinguish replacement from same-name identity',()=>{
 const a=draft(),b=copy(a);b.navigation.points.reverse();assert.deepEqual(compareScenes(a,b),[]);
 b.walls[0].name='更名';assert.equal(compareScenes(a,b)[0].action,'changed');
 b.walls[0]={...a.walls[0],id:'new-wall'};const changes=compareScenes(a,b).filter(c=>c.kind==='walls');assert.equal(changes.length,2);assert.deepEqual(changes.map(c=>c.action).sort(),['added','removed']);
 b.navigation.spawns=[];assert.ok(compareScenes(a,b).some(c=>c.kind==='spawns'&&c.action==='removed'));
 const noSite={...a,site:null};assert.equal(compareScenes(a,noSite).find(c=>c.kind==='site').action,'removed');assert.equal(compareScenes(noSite,a).find(c=>c.kind==='site').action,'added');
});

test('out-of-order scene history and compare snapshots cannot replace a later selection',async()=>{
 const pending=[];const h=harness(path=>new Promise(resolve=>pending.push({path,resolve})));
 await h.c.selectScene(A);const old=h.c.setVisible(true);const later=h.c.selectScene(B);
 pending[1].resolve(history(B));await later;pending[0].resolve(history(A));await old;assert.equal(h.c.history.sceneId,B);
 const first=h.c.selectTab('revisions');await tick();const second=h.c.selectCompare(1,1);await tick();
 for(const p of pending.slice(4))p.resolve(snapshot(B,Number(p.path.split('/').at(-1))));await second;
 for(const p of pending.slice(2,4))p.resolve(snapshot(B,Number(p.path.split('/').at(-1))));await first;
 assert.equal(h.c.compareFrom,1);assert.equal(h.c.compareTo,1);assert.equal(h.c.snapshots.size,2);assert.equal(h.c.snapshots.get(1).id,B);
});

test('authorization, session revision, target scope and destroyed state invalidate late reads',async()=>{
 for(const mutate of [api=>{api.authorized=false;},api=>{api.keyRevision++;},api=>{api.scope='https://other.test/api/#deployment=B';},api=>{api.deploymentConfirmed=false;}]){
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));await h.c.selectScene(A);const pending=h.c.setVisible(true);mutate(h.api);resolve(history());await pending;assert.equal(h.c.history,null);assert.equal(h.c.snapshots.size,0);
 }
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));await h.c.selectScene(A);const pending=h.c.setVisible(true);h.c.destroy();resolve(history());await pending;assert.equal(h.c.history,null);
});

test('logout, hidden route and selection clear prevent queries and discard inflight previews',async()=>{
 const h=harness(responder);await h.c.selectScene(A);await h.c.setVisible(true);await h.c.selectTab('revisions');
 const count=h.calls.length;h.api.authorized=false;await h.c.authorizationChanged();await h.c.refresh();assert.equal(h.c.history,null);assert.equal(h.calls.length,count);
 h.api.authorized=true;await h.c.setVisible(false);await h.c.selectScene(B);await h.c.refresh();assert.equal(h.calls.length,count);
 h.api.authorized=false;await h.c.setVisible(true);assert.equal(h.calls.length,count);
 const waiting=[];const second=harness(path=>path.endsWith('/history')?history():new Promise(resolve=>waiting.push(resolve)));await second.c.selectScene(A);await second.c.setVisible(true);const previews=second.c.selectTab('revisions');await second.c.selectScene(null);waiting.forEach(r=>r(snapshot()));await previews;assert.equal(second.c.snapshots.size,0);assert.equal(second.c.history,null);
});

test('session storage restores valid revision selections within sanitized deployment and stores no payload or key',async()=>{
 const store=storage(),h=harness(responder,store);await h.c.selectScene(A);await h.c.setVisible(true);await h.c.selectTab('revisions');await h.c.selectRevision(1);await h.c.selectCompare(2,1);
 const saved=[...store.values.entries()];assert.equal(saved.length,1);assert.doesNotMatch(JSON.stringify(saved),/memory-secret|NEVER_STORE|墙体|sceneHash|sceneSource/);assert.deepEqual(Object.keys(JSON.parse(saved[0][1])).sort(),['compareFrom','compareTo','revision','version']);
 const second=new Controller(h.api,{storage:store});await second.selectScene(A);await second.setVisible(true);assert.equal(second.revision,1);assert.equal(second.compareFrom,2);assert.equal(second.compareTo,1);
 const other=harness(responder,store);other.api.scope='https://example.test/api/v1/#deployment=B';await other.c.selectScene(A);await other.c.setVisible(true);assert.equal(other.c.revision,2);
 const removed=harness(async()=>({...history(),headRevision:3,revisions:[{revision:3,name:'新头'}]}),store);await removed.c.selectScene(A);await removed.c.setVisible(true);assert.equal(removed.c.revision,3);assert.equal(removed.c.compareFrom,3);assert.equal(removed.c.compareTo,3);
});

test('mismatched identities and unavailable revisions show explicit errors without substituting latest',async()=>{
 const h=harness(async path=>path.endsWith('/history')?history(B):snapshot());await h.c.selectScene(A);await h.c.setVisible(true);assert.equal(h.c.history,null);assert.match(h.c.error,/无法读取/);
 const bad=harness(async path=>path.endsWith('/history')?history():snapshot(B));await bad.c.selectScene(A);await bad.c.setVisible(true);await bad.c.selectTab('revisions');assert.equal(bad.c.snapshots.size,0);assert.match(bad.c.previewError,/身份不符/);assert.doesNotMatch(contentHTML(bad.c),/未发现变化/);
});

test('Chinese presentation escapes stored names, labels historical READY honestly, hides IDs within evidence',async()=>{
 const v=history();v.name='<img src=x>';v.versions=[{releaseId:R,sceneRevision:1,sceneName:'历史场景',motionPreset:'acceptance-v1',publications:[{requestId:'secret-publication-id',status:'READY',stage:'READY'}],runs:[{runId:'secret-run-id',robotId:'robot-internal-id',label:'进料任务',outcome:'ACCEPTED'}]}];
 const h=harness(async path=>path.endsWith('/history')?v:snapshot(A,Number(path.split('/').at(-1))));await h.c.selectScene(A);await h.c.setVisible(true);await h.c.selectTab('revisions');await h.c.selectRevision(1);
 h.c.snapshots.get(1).scene.obstacles[0].name='<svg onload=evil>';h.c.snapshots.get(2).scene.obstacles[0].height=2;
 const html=contentHTML(h.c,{previewSVG,onReplay(){},onTasks(){}});assert.match(html,/发布核对曾完成，当前可用性另查/);assert.match(html,/工况验收档/);assert.match(html,/已受理，执行结果待核实/);assert.match(html,/<h3>旧场景 · 修订 1<\/h3>/);assert.match(html,/编辑最新草稿/);assert.match(html,/最高速度单位为 m\/s/);assert.doesNotMatch(html,/<img|<svg onload/);
 const visible=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');assert.doesNotMatch(visible,/secret-publication-id|secret-run-id|robot-internal-id|cccccccccccc/);assert.match(html,/data-scene-history-replay="0:0"/);assert.match(html,/data-scene-history-tasks="0"/);
 const nullable=harness(async()=>({...history(),name:null,headRevision:null}));await nullable.c.selectScene(A);await nullable.c.setVisible(true);const missing=contentHTML(nullable.c);assert.match(missing,/当前草稿缺失/);assert.doesNotMatch(missing,/href="scene-builder.html/);
});

test('historical SVG shows recorded spawn orientation and escapes names',()=>{
 const scene=draft();scene.navigation.spawns[0].vehicleName='<bad>';const html=historicalSVG(scene,previewSVG);assert.match(html,/&lt;bad&gt;/);assert.match(html,/fill="#d68631"/);assert.match(html,/stroke="#7c4615"/);assert.doesNotMatch(html,/<bad>/);
});

test('mounted action callbacks navigate only to recorded task or replay, then destroy removes listeners',async()=>{
 const nodes=new Map();class Node{constructor(){this.innerHTML='';this.handlers={};this.dataset={};}querySelector(s){if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);}addEventListener(k,f){this.handlers[k]=f;}removeEventListener(k){delete this.handlers[k];}contains(){return true;}replaceChildren(){this.innerHTML='';}}
 const h=harness(async()=>({...history(),versions:[{releaseId:R,sceneRevision:1,publications:[],runs:[{runId:'run-id',outcome:'UNKNOWN'}]}]}));const events=[],container=new Node(),ui=mount(container,h.api,{storage:h.store,onReplay:v=>events.push(['replay',v]),onTasks:v=>events.push(['tasks',v])});await ui.selectScene(A);await ui.setVisible(true);
 const content=nodes.get('[data-scene-history-content]');function click(dataset){const target={dataset,closest:s=>s.includes('tab')?null:target};content.handlers.click({target});}
 click({sceneHistoryReplay:'0:0'});click({sceneHistoryTasks:'0:0'});click({sceneHistoryTasks:'0'});assert.deepEqual(events,[['replay',{kind:'run',id:'run-id'}],['tasks',{q:'run-id'}],['tasks',{q:R}]]);
 assert.equal(h.calls.length,1);h.api.authorized=false;click({sceneHistoryReplay:'0:0'});assert.equal(events.length,3);assert.equal(ui.controller.history,null);ui.destroy();assert.deepEqual(content.handlers,{});assert.equal(container.innerHTML,'');
});
