const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {playerURL, projectedMatrix, registrationMatches, monitorGuest, observationBackground} = require('../src/pages/simulation/overview-video.js');

const origin = 'https://fleet.test';
const location = {origin,href:origin+'/'};
const session = 'a'.repeat(32);
const map = {publicationId:'p1', releaseId:'r1', mapId:'m1', frame:'map', rasterHash:'abc', worldHash:'def'};
const registration = {
  schemaVersion:1, session, releaseId:'r1', mapId:'m1', frame:'map', rasterSha256:'abc', worldHash:'def',
  width:100, height:80, validRect:{x:4,y:6,width:90,height:70},
  pixelToWorld:[0.02,0.01,-3, -0.002,-0.02,3, 0.001,0.0002,1],
};
// Identity from the authored example factory r6, deployed in the fixed pair.
const exampleMap = {
  publicationId: '3b33c0169817ab8a31ad32f41461c946', releaseId: 'b2f3c7e637737caa68dbdd83fab831ea',
  mapId: 'scene-db575bcffa0116a5', frame: 'map',
  rasterHash: '0dd52765c604cddef712ff64d433ce5ab3d66602411437695b32a33ddc1667fa',
  worldHash: '6d62d6043d8f71b35de0fa7a980fa3ea7da7f5fc1e355848810c656465868909',
  modelHash: '90191455c89bbe7ab84ae0fef83624f800fea6befd08772765fa5e60cec2115a',
};
const exampleState = {
  activePublicationId: exampleMap.publicationId, activePublicationStatus: 'READY',
  releaseId: exampleMap.releaseId, map: exampleMap, viewerURL: '/sim-viewer/',
};
const exampleModel = {name:'示例工厂 · 统一仿真', source:'openTCS', units:'m', points:[{id:'P-1',x:3,y:2}], paths:[], stations:[]};
const exampleBackground = {
  source: 'published-scene', releaseId: exampleMap.releaseId,
  imageUrl: `/api/v1/map-background/image.png?releaseId=${exampleMap.releaseId}`,
};

test('source pixels land at identical screen locations to world coordinates on the map', () => {
  const p = [47,28];
  const m = registration.pixelToWorld;
  const screen = {a:2,b:0,c:0,d:2,e:600,f:430};
  const origin = {left:89,top:105};
  const scale = (x,y) => [60*x,-60*y];
  const result = projectedMatrix(m, screen, origin, scale);
  const w = p[0]*result[3] + p[1]*result[7] + result[15];
  const x = (p[0]*result[0] + p[1]*result[4] + result[12])/w;
  const y = (p[0]*result[1] + p[1]*result[5] + result[13])/w;
  const denominator = m[6]*p[0]+m[7]*p[1]+m[8];
  const [mapX,mapY] = scale((m[0]*p[0]+m[1]*p[1]+m[2])/denominator,(m[3]*p[0]+m[4]*p[1]+m[5])/denominator);
  assert.ok(Math.abs(x - (2*mapX + screen.e - origin.left)) < 1e-8);
  assert.ok(Math.abs(y - (2*mapY + screen.f - origin.top)) < 1e-8);
});

test('registration rejects different maps, identities and invalid camera footprints', () => {
  assert.ok(registrationMatches(registration,map));
  assert.ok(registrationMatches({...registration,publicationId:'p1'},map));
  for (const wrong of [
    {releaseId:'r2'}, {frame:'odom'}, {mapId:'m2'}, {rasterSha256:'changed'}, {worldHash:'other'}, {publicationId:'p2'},
    {validRect:{x:90,y:0,width:20,height:20}}, {pixelToWorld:[1,0,0,0,0,0,0,0,1]},
    {pixelToWorld:[1,0,0,0,1,0,-0.05,0,1]}, {height:0}, {session:''},
  ]) assert.equal(registrationMatches({...registration,...wrong},map),false);
});

test('player modes derive only from the verified same-origin base URL', () => {
  assert.equal(playerURL('/sim-viewer/','side',location),origin+'/sim-viewer/?mode=overhead');
  assert.equal(playerURL('/sim-viewer/','overlay',location),origin+'/sim-viewer/?mode=overlay');
  for (const url of ['http://127.0.0.1:55236/', 'https://evil.test/sim-viewer/', '/sim-viewer/?secret=s', '/sim-viewer/#f', 'https://user@fleet.test/sim-viewer/'])
    assert.equal(playerURL(url,'overlay',location),null);
});

function viewerHarness({authorized = () => true, guestObservation, register = registration, initialMap = map} = {}) {
  const calls=[], childFrames=[], handlers={};
  function element() {
    return {style:{},dataset:{},handlers:{},attrs:{}, addEventListener(k,f){this.handlers[k]=f;},
      setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},
      append(frame){childFrames.push(frame);}, remove(){childFrames.splice(childFrames.indexOf(this),1);},
      getBoundingClientRect(){return {left:50,top:90,width:500,height:400};},
      getScreenCTM(){return {a:1,b:0,c:0,d:1,e:430,f:380};},
    };
  }
  const buttons = ['map','side','overlay'].map(mode=>Object.assign(element(),{dataset:{overviewMode:mode}}));
  const elements = Object.fromEntries(['modes','layout','svg','sidePanel','sideHost','overlayHost','controls','status','access','open','review','stopReview','stopContext','confirm','back','refresh','prepare'].map(k=>[k,element()]));
  elements.modes.querySelectorAll=()=>buttons;
  elements.svg.ownerDocument={createElement:()=>Object.assign(element(),{contentWindow:{}})};
  let currentMap = initialMap;
  const context={location,URL,AbortController, addEventListener(k,f){handlers[k]=f;},
    async fetch(url,options){calls.push({url,options});return {ok:true,json:async()=>register};}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/pages/simulation/overview-video.js'),'utf8'),context);
  let opened=0;
  const view = context.OverviewVideo.mount({elements, mapContext:()=>currentMap, toSVG:(x,y)=>[60*x,-60*y],
    observe(){}, access(){}, open(){opened++;}, review(){}, close(){}, cancel(){}, refresh(){}, onLayoutChange(){}, authorized, guestObservation});
  function message(source,id,isPlaying,from=origin){handlers.message({source,origin:from,data:{type:'fleet-sim-viewer-status',session:id,playing:isPlaying}});}
  return {view, calls, buttons, elements, childFrames, message, mapContext(value){currentMap=value;}, get opened(){return opened;}};
}

test('view changes are read-only and an overlay appears only for the matching live player frame', async () => {
  const harness = viewerHarness();
  const {view,calls,buttons,childFrames,message} = harness;
  view.setActive(true);
  view.setObservation({authorized:true,viewerURL:'/sim-viewer/',state:{activePublicationStatus:'READY'}});
  assert.equal(childFrames.length,0);
  buttons[1].handlers.click();
  assert.equal(childFrames.length,1);
  assert.equal(childFrames[0].getAttribute('src'),origin+'/sim-viewer/?mode=overhead');
  buttons[2].handlers.click();
  await new Promise(setImmediate);
  assert.equal(childFrames.length,1);
  const frame=childFrames[0];
  assert.equal(frame.getAttribute('src'),origin+'/sim-viewer/?mode=overlay');
  assert.equal(frame.style.opacity,'0');
  message({},session,true);
  message(frame.contentWindow,session,true,'https://different.test');
  message(frame.contentWindow,'b'.repeat(32),true);
  assert.equal(frame.style.opacity,'0');
  message(frame.contentWindow,session,true);
  assert.equal(frame.style.opacity,'');
  assert.match(frame.style.transform,/^matrix3d\(/);
  assert.equal(frame.style.clipPath,'inset(6px 6px 4px 4px)');
  harness.mapContext({...map,releaseId:'r2'});
  assert.equal(view.project(),false);
  assert.equal(frame.style.opacity,'0');
  harness.mapContext(map);
  message(frame.contentWindow,session,false);
  assert.equal(frame.style.opacity,'0');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,origin+'/sim-viewer/registration.json');
  assert.equal(calls[0].options.method,undefined);
  assert.equal(harness.opened,0);
  view.setActive(false);
  assert.equal(childFrames.length,0);
});

test('a guest sees an already running viewer in either mode and only sees the login action when video is unavailable', async () => {
  let observation = {guest:true, state: exampleState, viewerURL: '/sim-viewer/'};
  const harness = viewerHarness({authorized:()=>false, guestObservation:()=>observation, initialMap:null,
    register:{...registration, releaseId:exampleMap.releaseId, mapId:exampleMap.mapId,
      worldHash:exampleMap.worldHash, rasterSha256:exampleMap.rasterHash}});
  const {view,buttons,elements,childFrames,message} = harness;
  view.setActive(true);
  assert.equal(childFrames.length,0);
  buttons[1].handlers.click();
  assert.equal(elements.sidePanel.hidden,false);
  assert.equal(elements.access.hidden,true);
  assert.equal(elements.open.hidden,true);
  assert.equal(elements.review.hidden,true);

  buttons[2].handlers.click();
  await new Promise(setImmediate);
  const frame = childFrames[0];
  message(frame.contentWindow,session,true);
  assert.equal(observationBackground({...exampleBackground,source:'bundled'},exampleMap),false);
  assert.equal(frame.style.opacity,'0');
  assert.equal(observationBackground(exampleBackground,exampleMap),true);
  harness.mapContext(exampleMap);
  assert.equal(view.project(),true);
  harness.mapContext({...exampleMap,worldHash:'a'.repeat(64)});
  assert.equal(view.project(),false);

  observation = {...observation, viewerURL:null};
  view.render();
  assert.equal(childFrames.length,0);
  assert.equal(elements.access.hidden,false);
  assert.equal(elements.access.textContent,'登录以开启直播');
  assert.equal(harness.opened,0);
});

test('guest map polling withdraws the model on publication change and discards late results', async () => {
  let time = 0, active = 'fixed-pair', state = exampleState;
  let resolveModel, modelSignal;
  const monitor = monitorGuest({active:()=>active, now:()=>time, onChange(){}, request(path,signal){
    if (!path) return Promise.resolve(state);
    assert.equal(path,`/model?releaseId=${exampleMap.releaseId}`);
    modelSignal = signal;
    return new Promise(resolve=>{resolveModel=resolve;});
  }});
  monitor.tick();
  await new Promise(setImmediate);
  assert.deepEqual(monitor.snapshot().map,exampleMap);
  assert.equal(monitor.snapshot().model,null);
  monitor.tick();
  resolveModel({releaseId:exampleMap.releaseId,model:exampleModel});
  await new Promise(setImmediate);
  assert.equal(monitor.snapshot().model,exampleModel);

  time = 1800;
  monitor.tick();
  await new Promise(setImmediate);
  time = 2500;
  monitor.tick();
  assert.equal(modelSignal.aborted,false);
  time = 3600;
  state = {...exampleState,activePublicationStatus:'RETIRED',map:null,viewerURL:null};
  monitor.tick();
  await new Promise(setImmediate);
  assert.equal(modelSignal.aborted,true);
  resolveModel({releaseId:exampleMap.releaseId,model:exampleModel});
  await new Promise(setImmediate);
  assert.equal(monitor.snapshot().map,null);
  assert.equal(monitor.snapshot().model,null);
  active = null;
  monitor.tick();
  assert.equal(monitor.snapshot(),null);
});
