const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.value='';this.attributes={};}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(key,value){this.attributes[key]=value;}
 contains(node){return this===node || this.children.some(child=>child.contains?.(node));}
 set innerHTML(value){throw Error('HTML interpolation is forbidden');}
}
const walk=node=>[node,...node.children.flatMap(walk)];
const text=node=>walk(node).map(n=>n.textContent).join(' ');
function setup(snapshot){
 const document={activeElement:null,createElement:tag=>new Element(tag)},calls=[];
 const scope={document};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../command-receipts.js'),'utf8'),scope);
 const api={receiptSnapshot:()=>snapshot,queryReceipt:async id=>{calls.push(id);}};
 const container=new Element('section'),view=scope.CommandReceipts.mount(container,api);
 return {container,view,calls,document};
}
const snapshot=()=>({records:[],scope:'https://fleet.test/api/v1/',authorized:true,canWrite:true,queryPersistence:true});
test('mount/render never queries or posts and preserves manual ID across updates',async()=>{
 const state=snapshot(),ui=setup(state);assert.equal(ui.calls.length,0);
 let input=walk(ui.container).find(n=>n.tag==='input');input.value='A.b:c-1';input.oninput();ui.view.render();input=walk(ui.container).find(n=>n.tag==='input');assert.equal(input.value,'A.b:c-1');
 await walk(ui.container).find(n=>n.tag==='form').onsubmit({preventDefault(){}});assert.deepEqual(ui.calls,['A.b:c-1']);assert.match(text(ui.container),/不等于物理停稳/);
});
test('unauthorized query controls are disabled and local index scope is explicit',()=>{
 const state=snapshot();state.authorized=false;const ui=setup(state);assert.ok(walk(ui.container).filter(n=>n.tag==='button').every(n=>n.disabled));assert.match(text(ui.container),/不是全站审计/);assert.match(text(ui.container),/操作员登录后可查询回执/);
});
test('backend receipt reason, query errors and historical submit error remain distinct safe text',()=>{
 const state=snapshot();state.records=[{envelope:{requestId:'original',command:{type:'create_order',robotId:'R1',destination:'A'}},status:'REJECTED',receipt:{confirmation:'not a physical result',error:{code:'DENIED',message:'<img src=x onerror=bad>'},resource:{type:'transport_order',id:'fleet-order'}},queryError:{code:'QUERY_ERROR',message:'receipt unavailable'},orderError:{code:'ORDER_ERROR',message:'order unavailable'},lastError:{code:'TIMEOUT',message:'old timeout'}}];
 const ui=setup(state),shown=text(ui.container);for(const label of ['服务端回执原因','回执查询错误','订单查询错误','提交时错误（历史）','DENIED','<img src=x onerror=bad>','not a physical result'])assert.ok(shown.includes(label));assert.equal(walk(ui.container).some(n=>n.tag==='img'),false);
 assert.equal(walk(ui.container).filter(n=>n.tag==='button').length,2);assert.ok(!shown.includes('清除不确定'));
});
test('no-lock page-only query persistence limitation is visible',()=>{
 const state=snapshot();state.queryPersistence=false;state.canWrite=false;state.writeBlockedReason='缺少安全请求锁';const ui=setup(state);assert.match(text(ui.container),/只保留在本页内存/);assert.match(text(ui.container),/HTTPS/);
});
test('historical deployment records remain visible with no query buttons',()=>{
 const state=snapshot();state.legacyRecords=[{scope:'old-deployment',envelope:{requestId:'old-fixture'},status:'UNKNOWN'}];
 const ui=setup(state);assert.match(text(ui.container),/历史连接请求/);assert.match(text(ui.container),/old-fixture/);
 assert.equal(walk(ui.container).filter(n=>n.tag==='button').length,1);
 assert.equal(ui.calls.length,0);
});

test('business history can filter without a network intent and raw identity stays inside evidence',()=>{
 const state=snapshot();state.records=['LAB-01','LAB-02'].map(robotId=>({envelope:{requestId:'original-'+robotId,command:{type:'create_order',robotId,destination:'Station'}},status:'ACCEPTED',order:{state:'FINISHED'}}));const ui=setup(state);
 const articles=walk(ui.container).filter(n=>n.tag==='article');assert.equal(articles.length,2);assert.ok(articles[0].children.some(n=>n.tag==='details'));assert.ok(!articles[0].children.filter(n=>n.tag==='h3').some(n=>n.textContent.includes('original-')));
 const search=walk(ui.container).find(n=>n.attributes['aria-label']==='搜索任务记录');search.value='LAB-02';search.oninput();assert.equal(walk(ui.container).filter(n=>n.tag==='article').length,1);assert.equal(ui.calls.length,0);
});
