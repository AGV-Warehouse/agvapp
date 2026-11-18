const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {Controller,pinnedURL,updatedURL,consumeUpdateNotice,apiBlocker}=require('../portal-update.js');
const A='a'.repeat(64),B='b'.repeat(64);
function setup({blockers=()=>[],request}={}){
 const calls=[],navigations=[],worker={id:'waiting'};
 const c=new Controller({release:A,getWorker:()=>worker,blockers,navigate:r=>navigations.push(r),
  request:request|| (async(w,data)=>{calls.push(data.type);return {ok:true,protocol:1,release:B};})});
 return {c,calls,navigations};
}
test('inspection only offers a fully verified different release and does not activate or reload',async()=>{
 const h=setup();await h.c.inspect();assert.equal(h.c.state.available.release,B);
 assert.deepEqual(h.calls,['PORTAL_STATUS']);assert.deepEqual(h.navigations,[]);
 for(const reply of [{ok:false,protocol:1,release:B},{ok:true,protocol:1,release:A},{ok:true,protocol:0,release:B},{ok:true,protocol:1,release:'bad'}]){
  const h=setup({request:async()=>reply});await h.c.inspect();assert.equal(h.c.state.available,null);
 }
});
test('one explicit update requests activation then reloads only this page',async()=>{
 const h=setup();await h.c.inspect();assert.equal(await h.c.update(),true);
 assert.deepEqual(h.calls,['PORTAL_STATUS','PORTAL_ACTIVATE']);assert.deepEqual(h.navigations,[B]);
});
test('unsaved editor, pending request, or loading frame blocks activation and preserves page',async()=>{
 for(const reason of ['场景未保存','原请求待核对','编辑器加载中']){
  const h=setup({blockers:()=>[reason]});await h.c.inspect();assert.equal(await h.c.update(),false);
  assert.deepEqual(h.calls,['PORTAL_STATUS']);assert.deepEqual(h.navigations,[]);assert.equal(h.c.state.message,reason);
 }
});
test('new edit during cross-tab handshake prevents reload even after worker activation',async()=>{
 let dirty=false;
 const h=setup({blockers:()=>dirty?['未保存']:[],request:async(_,data)=>{if(data.type==='PORTAL_ACTIVATE')dirty=true;return {ok:true,protocol:1,release:B};}});
 await h.c.inspect();assert.equal(await h.c.update(),false);assert.deepEqual(h.navigations,[]);
 assert.match(h.c.state.message,/保留原版本和编辑/);
});
test('legacy tab and install/offline failures leave the old page and offer understandable recovery',async()=>{
 for(const code of ['LEGACY_PAGE','PROBE_TIMEOUT','PAGE_UNAVAILABLE','RELEASE_MISMATCH','CACHE_UNAVAILABLE','RECOVERY_REQUIRED','PAGE_CHANGED','INCOMPLETE','UNAVAILABLE']){
  const h=setup({request:async(_,data)=>data.type==='PORTAL_STATUS'?{ok:true,protocol:1,release:B}:{ok:false,code}});
  await h.c.inspect();assert.equal(await h.c.update(),false);assert.deepEqual(h.navigations,[]);
  assert.match(h.c.state.message,/页面|版本|核对/);
 }
});
test('update preserves path, scenario selection, replay route and seek time',()=>{
 const url=new URL(pinnedURL('https://fleet.example/scene-builder.html?sceneId=123&step=simulation&portalRelease='+A+'#/simulation?kind=run&id=run42&at=31.7',B));
 assert.equal(url.searchParams.get('sceneId'),'123');assert.equal(url.searchParams.get('step'),'simulation');
 assert.equal(url.hash,'#/simulation?kind=run&id=run42&at=31.7');assert.equal(url.searchParams.get('portalRelease'),B);
});
test('receipt guards protect pending work without copying keys or dispatching requests',()=>{
 assert.match(apiBlocker({inFlight:new Map([['x',1]])}),/原请求/);
 assert.equal(apiBlocker({scopeBoundRequests:3,receiptOperations:1,requestCount:4}),'');
 assert.match(apiBlocker({mutationRequests:1}),/提交业务操作/);
 assert.match(apiBlocker({records:[{status:'UNKNOWN'}]}),/不会重发/);
 assert.equal(apiBlocker({records:[{status:'ACCEPTED'}]}),'');
});
function browser(frames=[]){
 const listeners={},swListeners={},location=new URL('https://fleet.example/?sceneId=42#/maps');
 const document={readyState:'loading',querySelector:q=>q==='meta[name="portal-release"]'?{content:A}:null,
  querySelectorAll:()=>frames,addEventListener:(name,fn)=>listeners[name]=fn};
 const context={URL,document,location,navigator:{serviceWorker:{addEventListener:(name,fn)=>swListeners[name]=fn}},
  history:{state:{preserved:true},replaceState:(state,title,url)=>{location.href=url;}},
  localStorage:{getItem(){assert.fail('update must not read credential storage');},setItem(){assert.fail('update must not write storage');}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../portal-update.js'),'utf8'),context);
 return {api:context.PortalUpdates,location,listeners,swListeners,context};
}
test('boot pins actual page URL before lazy resources, preserving route and query',()=>{
 const h=browser();assert.equal(h.location.searchParams.get('portalRelease'),A);
 assert.equal(h.location.searchParams.get('sceneId'),'42');assert.equal(h.location.hash,'#/maps');
 assert.match(h.api.blockers()[0],/仍在加载/);h.api.ready();assert.equal(h.api.blockers().length,0);
});
test('iframe dirty and unknown protocol block only their owning page; unrelated tabs are untouched',()=>{
 const child={location:new URL('https://fleet.example/scene-builder.html'),PortalUpdates:{release:A,blockers:()=>['工位尚未应用']}};
 const h=browser([{src:child.location.href,contentWindow:child}]);h.api.ready();
 assert.equal(h.api.blockers()[0],'工位尚未应用');
 child.PortalUpdates={release:A,blockers:()=>[]};assert.equal(h.api.blockers().length,0);
 child.PortalUpdates=null;assert.match(h.api.blockers()[0],/编辑器仍在加载/);
});
test('version probe accepts only a same-origin SW source and returns no auth or edit data',()=>{
 const h=browser(),replies=[],port={postMessage:reply=>replies.push(reply)};
 for(const source of ['https://evil.example/sw.js','https://fleet.example/other.js'])
  h.swListeners.message({data:{type:'PORTAL_VERSION_PROBE'},ports:[port],source:{scriptURL:source}});
 assert.equal(replies.length,0);
 h.swListeners.message({data:{type:'PORTAL_VERSION_PROBE'},ports:[port],source:{scriptURL:'https://fleet.example/sw.js'}});
 assert.deepEqual(Object.keys(replies[0]).sort(),['bootstrapping','protocol','release']);assert.equal(replies[0].release,A);
 h.location.searchParams.set('portalRelease',B);
 h.swListeners.message({data:{type:'PORTAL_VERSION_PROBE'},ports:[port],source:{scriptURL:'https://fleet.example/sw.js'}});
 assert.equal(replies[1].release,null);
});
test('guard errors and mismatched frame versions fail closed',()=>{
 const h=browser([{src:'https://fleet.example/editor.html',contentWindow:{location:new URL('https://fleet.example/editor.html'),PortalUpdates:{release:B,blockers:()=>[]}}}]);
 h.api.ready();h.api.addGuard('failing',()=>{throw Error('unknown');});
 assert.equal(h.api.blockers().length,2);
});

function lifecycleBrowser({controlled=false,updated=false}={}){
 const listeners={},swListeners={},created=[],requests=[],navigations=[];
 const location=new URL('https://fleet.example/?sceneId=42'+(updated?'&portalRelease='+A+'&portalUpdatedFrom='+B:'')+'#/maps');
 location.replace=url=>navigations.push(url);
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.fields=new Map();this.children=[];this.disabled=false;}
  querySelector(selector){if(!this.fields.has(selector)){const child=new Element('button');child.parent=this;this.fields.set(selector,child);}return this.fields.get(selector);}
  querySelectorAll(){return [];}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  contains(node){return node===this||node?.parent===this;}
  setAttribute(){}
  addEventListener(type,fn){this[type]=fn;}
  showModal(){this.open=true;}
  focus(){this.focused=true;}
 }
 const document={readyState:'loading',hidden:false,body:new Element('body'),assetError:null,
  querySelector:q=>q==='meta[name="portal-release"]'?{content:A}:null,
  querySelectorAll:()=>[],getElementById:id=>id==='portalAssetError'?document.assetError:null,
  createElement:tag=>{const e=new Element(tag);created.push(e);return e;},
  addEventListener:(name,fn)=>(listeners[name]||=[]).push(fn)};
 const worker={state:'activated',postMessage(data,ports){requests.push(data.type);ports[0].postMessage({ok:true,protocol:1,release:A});ports[0].close();}};
 const registration={active:worker,waiting:null,installing:null,update:async()=>{},addEventListener(){}};
 const context={URL,document,location,MessageChannel:require('node:worker_threads').MessageChannel,setTimeout,clearTimeout,setInterval(){},addEventListener(){},
  navigator:{serviceWorker:{controller:controlled?worker:null,register:async()=>registration,addEventListener:(name,fn)=>swListeners[name]=fn}},
  history:{state:null,replaceState:(state,title,url)=>location.href=url}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../portal-update.js'),'utf8'),context);
 return {context,document,listeners,swListeners,created,requests,navigations,Element};
}
test('first uncontrolled load blocks business interaction until explicit entry into a verified generation',async()=>{
 const h=lifecycleBrowser();let prevented=false,stopped=false;
 h.listeners.click[0]({target:{},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
 assert.equal(prevented,true);assert.equal(stopped,true);
 await h.listeners.DOMContentLoaded[0]();
 const dialog=h.created.find(e=>e.className==='portal-first-load');
 assert.equal(dialog.open,true);assert.equal(dialog.querySelector('button').disabled,false);
 assert.deepEqual(h.navigations,[]);assert(h.requests.every(type=>type==='PORTAL_STATUS'));
 await dialog.querySelector('button').onclick();
 assert.equal(h.navigations.length,1);
 const next=new URL(h.navigations[0]);assert.equal(next.searchParams.get('sceneId'),'42');assert.equal(next.hash,'#/maps');assert.equal(next.searchParams.get('portalRelease'),A);
});
test('late SRI error recovery dialog remains usable above bootstrap dialog',async()=>{
 const h=lifecycleBrowser();await h.listeners.DOMContentLoaded[0]();
 const error=new h.Element('dialog'),button=error.querySelector('button');h.document.assetError=error;
 h.listeners.click[0]({target:button,preventDefault(){assert.fail('recovery must be clickable');},stopImmediatePropagation(){assert.fail('recovery must not be swallowed');}});
});
test('controller changes in an already controlled old page never reload or activate automatically',async()=>{
 const h=lifecycleBrowser({controlled:true});await h.listeners.DOMContentLoaded[0]();
 assert.equal(h.created.some(e=>e.className==='portal-first-load'),false);
 await h.swListeners.controllerchange();
 assert.deepEqual(h.navigations,[]);assert(h.requests.every(type=>type==='PORTAL_STATUS'));
});

test('successful update notice is consumed once while preserving the original route and scene',()=>{
 const next=updatedURL('https://fleet.example/scene-builder.html?sceneId=42&step=simulation#/maps',B,A);
 const first=consumeUpdateNotice(next,B);assert.equal(first.updated,true);
 const url=new URL(first.href);assert.equal(url.searchParams.get('sceneId'),'42');assert.equal(url.hash,'#/maps');assert.equal(url.searchParams.has('portalUpdatedFrom'),false);
 assert.equal(consumeUpdateNotice(first.href,B).updated,false);
 for(const previous of ['bad',B])assert.equal(consumeUpdateNotice(updatedURL(next,B,previous),B).updated,false);
 assert.equal(consumeUpdateNotice(next,A).updated,false);
});
test('updated page focuses the completion notice and explains that a valid login remains usable',async()=>{
 const h=lifecycleBrowser({controlled:true,updated:true});await h.listeners.DOMContentLoaded[0]();
 const panel=h.created.find(e=>e.className==='portal-update-panel');
 assert.equal(panel.open,true);assert.match(panel.querySelector('[data-update-message]').textContent,/网页已更新.*有效的操作员登录可继续使用.*原请求不会自动重发/);
 assert.equal(panel.querySelector('summary').focused,true);
 assert.match(panel.querySelector('[data-update-version]').textContent,/已更新/);
 assert.equal(new URL(h.context.location.href).searchParams.has('portalUpdatedFrom'),false);
 assert.deepEqual(h.navigations,[]);assert(h.requests.every(type=>type==='PORTAL_STATUS'));
});

test('ordinary old links and old referrers never claim an explicit update completed',async()=>{
 assert.equal(consumeUpdateNotice('https://fleet.example/?portalRelease='+A+'#/maps',A).updated,false);
 const h=lifecycleBrowser({controlled:true});h.document.referrer='https://fleet.example/?portalRelease='+B+'#/maps';
 await h.listeners.DOMContentLoaded[0]();
 const panel=h.created.find(e=>e.className==='portal-update-panel');
 assert.doesNotMatch(panel.querySelector('[data-update-message]').textContent,/更新完成/);
 assert.equal(panel.querySelector('summary').focused,undefined);
});
test('a blocked update exposes a concrete read-only review entry without activating or navigating the version',async()=>{
 const h=lifecycleBrowser({controlled:true});let reviewed=0;
 h.context.PortalUpdates.addGuard('original',()=> '原发布待核对');h.context.PortalUpdates.ready();
 h.context.PortalUpdates.addReviewAction('original',()=>({label:'前往核对原发布',go(){reviewed++;return '已打开原发布，仅核对。';}}));
 await h.listeners.DOMContentLoaded[0]();const panel=h.created.find(e=>e.className==='portal-update-panel');
 await panel.querySelector('[data-update-apply]').onclick();
 const review=panel.querySelector('[data-update-review]');assert.equal(review.hidden,false);assert.equal(review.textContent,'前往核对原发布');
 review.onclick();assert.equal(reviewed,1);assert.match(panel.querySelector('[data-update-message]').textContent,/仅核对/);
 assert.deepEqual(h.navigations,[]);assert(h.requests.every(type=>type==='PORTAL_STATUS'));
});
test('manual update check exposes preparation blockers and review navigation without a newer release',async()=>{
 const h=lifecycleBrowser({controlled:true});h.context.PortalUpdates.ready();
 h.context.PortalUpdates.addGuard('original',()=> '原发布待核对');
 let reviewed=0;h.context.PortalUpdates.addReviewAction('original',()=>({label:'前往核对原发布',go(){reviewed++;return '原发布页面';}}));
 await h.listeners.DOMContentLoaded[0]();
 const panel=h.created.find(e=>e.className==='portal-update-panel');
 for(let i=0;i<20&&panel.querySelector('[data-update-check]').disabled;i++)await new Promise(setImmediate);
 assert.equal(panel.querySelector('[data-update-check]').disabled,false);
 await panel.querySelector('[data-update-check]').onclick();
 assert.match(panel.querySelector('[data-update-message]').textContent,/没有已校验的新版本.*更新前需先核对.*原发布/);
 assert.equal(panel.querySelector('[data-update-review]').hidden,false);panel.querySelector('[data-update-review]').onclick();assert.equal(reviewed,1);
 assert.equal(panel.querySelector('[data-update-apply]').hidden,true);
 assert.deepEqual(h.navigations,[]);assert(h.requests.every(type=>type==='PORTAL_STATUS'));
});
