const test=require('node:test'),assert=require('node:assert/strict');
const N=require('../src/pages/maps/scene-builder/network-model.js'),G=require('../src/pages/maps/scene-builder/model.js');
const fresh=()=>G.fresh();
function points(){return N.addPoint(N.addPoint(fresh(),{x:0,y:0,name:'入口'}),{x:2,y:0,name:'出口'});}
test('viewing legacy scene does not migrate its schema or add navigation',()=>{const s=fresh(),before=JSON.stringify(s);assert.deepEqual(N.read(s),{points:[],paths:[],stations:[],spawns:[]});assert.deepEqual(N.validate(s),[]);N.summary(s);assert.equal(JSON.stringify(s),before);const edited=N.addPoint(s,{x:1,y:2});assert.equal(edited.schemaVersion,'1.1');assert.equal(edited.navigation.points[0].id,'P-1');assert.equal(s.schemaVersion,'1.0');assert.equal(s.navigation,undefined);});
test('point route station and two spawns edit one immutable scene with shared coordinates',()=>{const original=points();let s=N.addPath(original,{sourcePointId:'P-1',targetPointId:'P-2'});s=N.addStation(s,{name:'入口停车位',pointId:'P-1',yaw:Math.PI});s=N.setSpawn(s,{vehicleName:'LAB-01',pointId:'P-1'});s=N.setSpawn(s,{vehicleName:'LAB-02',pointId:'P-2',yaw:-Math.PI});assert.deepEqual(N.validate(s),[]);assert.equal(s.navigation.paths[0].direction,'bidirectional');assert.equal(s.navigation.paths[0].maxVelocity,.05);assert.equal(original.navigation.paths.length,0);const moved=N.update(s,{kind:'point',id:'P-1'},{x:3,name:' 新入口 '});assert.equal(moved.navigation.points[0].x,3);assert.equal(moved.navigation.points[0].name,'新入口');assert.equal(moved.navigation.stations[0].pointId,'P-1');assert.equal(s.navigation.points[0].x,0);const turn=N.update(moved,{kind:'path',id:'R-1'},{direction:'forward',maxVelocity:.03});assert.equal(turn.navigation.paths[0].maxVelocity,.03);assert.equal(N.find(turn,{kind:'station',id:'S-1'}).name,'入口停车位');});
test('deleting a point atomically removes its incident routes station and spawn only',()=>{let s=N.addPath(points(),{sourcePointId:'P-1',targetPointId:'P-2'});s=N.addStation(s,{pointId:'P-1'});s=N.setSpawn(s,{vehicleName:'LAB-01',pointId:'P-1'});s=N.setSpawn(s,{vehicleName:'LAB-02',pointId:'P-2'});const next=N.remove(s,{kind:'point',id:'P-1'});assert.equal(next.navigation.points.length,1);assert.deepEqual(next.navigation.paths,[]);assert.deepEqual(next.navigation.stations,[]);assert.equal(next.navigation.spawns.length,1);assert.equal(next.navigation.spawns[0].vehicleName,'LAB-02');assert.equal(s.navigation.points.length,2);assert.deepEqual(N.validate(next),[]);assert.equal(N.remove(next,{kind:'point',id:'P-2'}).schemaVersion,'1.1');});
test('route references self loops duplicate directions and degenerate segments are rejected',()=>{const s=points();for(const params of [{sourcePointId:'missing',targetPointId:'P-2'},{sourcePointId:'P-1',targetPointId:'P-1'},{sourcePointId:'P-1',targetPointId:'P-2',direction:'curve'},{sourcePointId:'P-1',targetPointId:'P-2',maxVelocity:.06}])assert.throws(()=>N.addPath(s,params));const bidirectional=N.addPath(s,{sourcePointId:'P-1',targetPointId:'P-2'});assert.throws(()=>N.addPath(bidirectional,{sourcePointId:'P-2',targetPointId:'P-1',direction:'forward'}));const forward=N.addPath(s,{sourcePointId:'P-1',targetPointId:'P-2',direction:'forward'});assert.deepEqual(N.validate(N.addPath(forward,{sourcePointId:'P-2',targetPointId:'P-1',direction:'forward'})),[]);assert.throws(()=>N.update(bidirectional,{kind:'point',id:'P-2'},{x:.0001}));});
test('station and spawn references and angles are validated while incomplete drafts remain valid',()=>{let s=points();assert.throws(()=>N.addStation(s,{pointId:'missing'}));assert.throws(()=>N.addStation(s,{pointId:'P-1',yaw:4}));s=N.addStation(s,{pointId:'P-1'});assert.throws(()=>N.addStation(s,{pointId:'P-1'}));assert.throws(()=>N.setSpawn(s,{vehicleName:'REAL-01',pointId:'P-1'}));assert.throws(()=>N.setSpawn(s,{vehicleName:'LAB-01',pointId:'missing'}));s=N.setSpawn(s,{vehicleName:'LAB-01',pointId:'P-1',yaw:1});s=N.setSpawn(s,{vehicleName:'LAB-01',pointId:'P-2',yaw:2});assert.equal(s.navigation.spawns.length,1);assert.equal(s.navigation.spawns[0].yaw,2);s=N.setSpawn(s,{vehicleName:'LAB-01',pointId:''});assert.deepEqual(s.navigation.spawns,[]);assert.deepEqual(N.validate({...fresh(),schemaVersion:'1.1',navigation:{points:[],paths:[],stations:[],spawns:[]}}),[]);});
test('finite coordinates labels stable identity and bounded list sizes prevent malformed drafts',()=>{for(const x of [NaN,Infinity,'1',100001])assert.throws(()=>N.addPoint(fresh(),{x,y:0}));for(const name of ['<bad>','a/b','a'.repeat(81),'bad\nname'])assert.throws(()=>N.addPoint(fresh(),{x:0,y:0,name}));let s=points();assert.throws(()=>N.update(s,{kind:'point',id:'P-1'},{id:'other'}));assert.throws(()=>N.update(s,{kind:'point',id:'missing'},{x:1}));const many={...s,navigation:{...s.navigation,points:Array.from({length:101},(_,i)=>({id:'P-'+i,name:'点位 '+i,x:i,y:0}))}};assert.ok(N.validate(many).some(e=>e.includes('100')));assert.ok(N.validate({...s,schemaVersion:'1.0'}).length);assert.ok(N.validate({...fresh(),schemaVersion:'1.1'}).length);assert.ok(N.validate({...s,navigation:null}).length);const duplicate=structuredClone(s);duplicate.navigation.points[1].id='P-1';assert.ok(N.validate(duplicate).some(e=>e.includes('重复')));});
test('unsupported schema keys reserved kernel identities and invalid identity types fail with readable errors',()=>{const s=points();for(const where of ['nav','point','spawn']){const next=structuredClone(s);if(where==='nav')next.navigation.surprise=true;else if(where==='point')next.navigation.points[0].templateId='unknown';else next.navigation.spawns=[{vehicleName:'LAB-01',pointId:'P-1',yaw:0,extra:true}];assert.ok(N.validate(next).some(e=>e.includes('不支持')));}for(const id of [5,'SCENE-TRAFFIC','SCENE-PARKING','LAB-01','R-1:reverse']){const next=structuredClone(s);next.navigation.points[0].id=id;assert.ok(N.validate(next).length);}const tiny=N.update(s,{kind:'point',id:'P-2'},{x:.001});assert.equal(N.addPath(tiny,{sourcePointId:'P-1',targetPointId:'P-2'}).navigation.paths.length,1);});
test('existing controller undo redo CAS save and reopen retain the exact authored navigation',async()=>{const {Controller}=require('../src/pages/maps/scene-builder/controller.js');let server=null;const values=new Map(),requests=[],storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},api={authorized:true,deploymentConfirmed:true,key:'test-only',scope:'test-authored',keyRevision:1,async request(path,body){requests.push({path,body:structuredClone(body)});if(!body)return structuredClone(server);if(server&&body.expectedRevision!==server.revision)throw Object.assign(Error('newer revision'),{status:409});server={id:body.id,revision:body.expectedRevision+1,scene:structuredClone(body.scene),warnings:[]};return structuredClone(server);}};const c=new Controller(api,{storage});let authored=N.addPath(points(),{sourcePointId:'P-1',targetPointId:'P-2'});authored=N.addStation(authored,{pointId:'P-1',yaw:Math.PI});authored=N.setSpawn(authored,{vehicleName:'LAB-01',pointId:'P-1',yaw:Math.PI});authored=N.setSpawn(authored,{vehicleName:'LAB-02',pointId:'P-2',yaw:0});c.change(authored);c.history('undo');assert.equal(c.scene.schemaVersion,'1.0');assert.equal(c.scene.navigation,undefined);c.history('redo');assert.deepEqual(c.scene.navigation,authored.navigation);await c.save();assert.equal(c.revision,1);assert.equal(c.dirty,false);assert.deepEqual(requests[0].body.scene.navigation,authored.navigation);const reopened=new Controller(api,{storage});await reopened.open(c.id);assert.deepEqual(reopened.scene.navigation,authored.navigation);assert.equal(requests.filter(r=>r.body).length,1);const moved=N.update(c.scene,{kind:'point',id:'P-2'},{x:4.125,y:1});c.change(moved);c.history('undo');assert.deepEqual(c.scene.navigation,authored.navigation);c.history('redo');assert.deepEqual(c.scene.navigation,moved.navigation);server.revision=2;await assert.rejects(c.save(),error=>error.status===409);assert.equal(c.conflict,true);assert.equal(c.dirty,true);assert.equal(c.revision,1);assert.deepEqual(c.scene.navigation,moved.navigation);assert.deepEqual(server.scene.navigation,authored.navigation);assert.equal(requests.filter(r=>r.body).length,2);});


test('terminal footprint bounds hit tests and site checks use the rotated physical base',()=>{
 const W=require('../src/pages/maps/scene-builder/workcell-model.js');
 const scene={site:{x:0,y:0,width:10,depth:10},navigation:{stations:[{id:'s',name:'工位',workcell:{templateId:'buffer-v1',footprint:{x:5,y:5,yaw:0,width:1,depth:1},terminal:{x:.2,y:2,yaw:Math.PI/2,height:1.1,tagId:7,buttonId:'CALL'}}}]}};
 assert.ok(W.outside(scene).some(x=>x.includes('立牌')));assert.equal(W.hitAt(scene,{x:.4,y:2},0).id,'s');assert.equal(W.hitAt(scene,{x:.4,y:2.2},0),null);assert.ok(Math.min(...W.bounds(scene).map(p=>p.x))<0);
 const svg=W.overlaySVG(scene,50);assert.match(svg,/width=".36" height=".42"/);assert.match(svg,/Tag 7/);assert.match(svg,/rotate\(-90\)/);
});
test('scenes may place any of the four pool robots and leave the rest out',()=>{
 assert.deepEqual(N.vehicles,['LAB-01','LAB-02','LAB-03','LAB-04']);
 let scene=N.addPoint(G.fresh(),{x:0,y:0});scene=N.addPoint(scene,{x:2,y:0});scene=N.addPoint(scene,{x:4,y:0});
 scene=N.setSpawn(scene,{vehicleName:'LAB-03',pointId:'P-1'});scene=N.setSpawn(scene,{vehicleName:'LAB-04',pointId:'P-3'});
 assert.deepEqual(scene.navigation.spawns.map(s=>s.vehicleName),['LAB-03','LAB-04']);
 assert.match(N.summary(scene),/参与车辆 2\/4/);
 scene=N.setSpawn(scene,{vehicleName:'LAB-03',pointId:''});
 assert.deepEqual(scene.navigation.spawns.map(s=>s.vehicleName),['LAB-04']);
 assert.throws(()=>N.setSpawn(scene,{vehicleName:'LAB-05',pointId:'P-1'}));
 const bad=JSON.parse(JSON.stringify(scene));bad.navigation.points[0].id='LAB-03';
 assert.ok(N.validate(bad).some(e=>/保留名称/.test(e)));
});
test('traffic zones are an opt-in navigation field',()=>{
 let scene=N.addPoint(G.fresh(),{x:0,y:0});
 assert.equal(N.zoned(scene),false);
 scene=N.setZoned(scene,true);assert.deepEqual(scene.navigation.traffic,{policy:'zones-v1'});assert.equal(N.zoned(scene),true);
 scene=N.setZoned(scene,false);assert.equal('traffic' in scene.navigation,false);
 const bad=JSON.parse(JSON.stringify(scene));bad.navigation.traffic={policy:'free'};
 assert.ok(N.validate(bad).includes('交通方式无效'));
});

test('station work is an opt-in task policy with chargers that follow the stations', () => {
  const M = require('../src/pages/maps/scene-builder/network-model.js');
  let scene = { schemaVersion: '1.1', navigation: { points: [], paths: [], stations: [], spawns: [] } };
  scene = M.addPoint(scene, { x: 0, y: 0 });
  scene = M.addStation(scene, { pointId: scene.navigation.points[0].id });
  const id = scene.navigation.stations[0].id;
  assert.equal(M.stationTasks(scene), false);
  assert.throws(() => M.setCharger(scene, id, true), /站点作业/);
  scene = M.setStationTasks(scene, true);
  assert.deepEqual(scene.navigation.tasks, { policy: 'station-actions-v1', chargers: [] });
  scene = M.setCharger(scene, id, true);
  assert.equal(M.isCharger(scene, id), true);
  assert.deepEqual(M.validate({ ...scene, navigation: { ...scene.navigation, tasks: { policy: 'other', chargers: [] } } }), ['站点作业设置无效']);
  scene = M.remove(scene, { kind: 'station', id });
  assert.deepEqual(scene.navigation.tasks.chargers, []);
  scene = M.setStationTasks(scene, false);
  assert.equal('tasks' in scene.navigation, false);
});
