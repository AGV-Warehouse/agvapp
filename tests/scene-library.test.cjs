const test=require('node:test');
const assert=require('node:assert/strict');
const {Controller,previewSVG}=require('../src/pages/maps/scene-library.js');
const A='a'.repeat(32),B='b'.repeat(32);
const row=(id,name='场景')=>({id,name,revision:1,updatedAt:'2026-11-09T23:00:00Z'});
const scene=id=>({id,revision:1,updatedAt:'2026-11-09T23:00:00Z',scene:{name:'场景',frame:'map',unit:'m',site:{x:0,y:0,width:12,depth:8},walls:[],obstacles:[]}});
function harness(request){const calls=[];const api={scope:'origin#deployment=A',keyRevision:1,key:'memory-secret',authorized:true,deploymentConfirmed:true,request:async(path,body)=>{calls.push({path,body});return request(path,body);}};return {api,calls,c:new Controller(api)};}

test('enter, search, refresh and second controller only GET saved drafts and never start runtime',async()=>{
 const h=harness(async path=>path==='map-workspace/scenes'?{scenes:[row(A,'Fab 北区'),row(B,'Fab 南区')]}:scene(path.split('/').at(-1)));
 await h.c.setVisible(true);assert.equal(h.c.preview.id,A);
 const before=h.calls.length;h.c.search('南区');assert.equal(h.c.filtered()[0].id,B);assert.equal(h.calls.length,before);
 await h.c.select(B);await h.c.refresh();assert.equal(h.c.preview.id,B);
 const second=new Controller(h.api);await second.setVisible(true);
 assert.ok(h.calls.every(call=>call.body===undefined&&call.path.startsWith('map-workspace/scenes')));
});

test('late preview from another deployment or another selection is discarded',async()=>{
 const pending=[];
 const h=harness(path=>path==='map-workspace/scenes'?Promise.resolve({scenes:[row(A),row(B)]}):new Promise(resolve=>pending.push({path,resolve})));
 const first=h.c.setVisible(true);await new Promise(setImmediate);
 const later=h.c.select(B);pending[1].resolve(scene(B));await later;pending[0].resolve(scene(A));await first;
 assert.equal(h.c.preview.id,B);
 const old=h.c.select(A);h.api.scope='origin#deployment=B';h.api.keyRevision++;h.c.bind();pending[2].resolve(scene(A));await old;
 assert.equal(h.c.preview,null);assert.equal(h.c.rows.length,0);assert.equal(h.c.loaded,false);
});

test('permission loss clears scene data and performs no follow-up GET',async()=>{
 const h=harness(async path=>path==='map-workspace/scenes'?{scenes:[row(A)]}:scene(A));await h.c.setVisible(true);
 const before=h.calls.length;h.api.authorized=false;h.c.authorizationChanged();await h.c.refresh();
 assert.equal(h.c.preview,null);assert.equal(h.c.rows.length,0);assert.equal(h.calls.length,before);
});

test('failed list, mismatched identity and concurrent head changes are explicit',async()=>{
 let fail=false,mismatch=false;
 const h=harness(async path=>{if(fail)throw Error('offline');if(path==='map-workspace/scenes')return {scenes:[row(A)]};return {...scene(mismatch?B:A),revision:2,scene:{...scene(A).scene,name:'新修订'}};});
 await h.c.setVisible(true);assert.equal(h.c.rows[0].revision,2);assert.equal(h.c.rows[0].name,'新修订');
 mismatch=true;await h.c.select(A);assert.equal(h.c.preview,null);assert.match(h.c.previewError,/尚未读取成功/);
 fail=true;await h.c.refresh();assert.equal(h.c.rows.length,0);assert.match(h.c.error,/暂时无法读取/);
});

test('invalid catalog cannot become an editor URL, and SVG has numeric geometry only',async()=>{
 const h=harness(async()=>({scenes:[row('javascript:alert(1)')]}));await h.c.setVisible(true);assert.equal(h.c.rows.length,0);assert.ok(h.c.error);
 const draft=scene(A).scene;draft.obstacles=[{x:1,y:2,width:1,depth:2,yaw:0,templateId:'<script>',name:'<img onerror=alert(1)>'},{x:'1" onload="bad',y:1,width:1,depth:2,yaw:0}];
 const html=previewSVG(draft);assert.match(html,/viewBox/);assert.doesNotMatch(html,/<script|onerror|onload|NaN|undefined/);
 assert.match(previewSVG({...draft,site:null}),/尚未画出场地/);
});
