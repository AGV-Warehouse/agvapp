const test=require('node:test'),assert=require('node:assert/strict');
const UI=require('../src/pages/maps/scene-builder/clearance-ui.js');

class Node {
  constructor(tag='svg') {
    this.tag=tag;
    this.attrs={};
    this.children=[];
    this.ownerDocument={createElementNS:(_,tag)=>new Node(tag)};
  }
  setAttribute(key,value){this.attrs[key]=value;}
  append(node){this.children.push(node);}
}

const point={kind:'point',id:'P-6',name:'点位 6',nearest:{x:5.7,y:.8}};
const wall={kind:'wall',id:'wall',name:'墙体',nearest:{x:5.7,y:.475}};
const issue={route:point,object:wall,distanceM:.325};
const rejected={applicable:true,requiredDistanceM:.511085288557374,issueCount:1,issues:[issue]};
const clear={...rejected,issueCount:0,issues:[]};

function harness(request) {
  let scene={walls:[{...wall,start:{x:.6,y:.4},end:{x:11.4,y:.4},thickness:.15}],obstacles:[]};
  const calls=[],selections=[],container={};
  const ui=UI.mount(container,{request(path,body){calls.push({path,body});return request();}},{
    getContext:()=>({scene,scope:'same',keyRevision:1,disabled:false}),
    onSelect(selection){selections.push(selection);return true;},
    onUpdate(){ui.render();},
  });
  ui.render();
  return {ui,calls,selections,container,get scene(){return scene;},edit(){scene={...scene};ui.render();}};
}

test('shows exact measurements, highlights both nearest locations and selects the real map object',async()=>{
  const h=harness(()=>Promise.resolve(rejected));
  assert.deepEqual(h.calls,[]);
  await h.ui.check();
  assert.deepEqual(h.calls,[{path:'map-workspace/scene-clearance',body:h.scene}]);
  assert.match(h.container.innerHTML,/点位 6/);
  assert.match(h.container.innerHTML,/0\.325 m，须大于 0\.511085 m/);
  assert.match(h.container.innerHTML,/\(5\.700, 0\.475\)/);
  const svg=new Node();
  h.ui.overlay(svg,{scale:50});
  const layer=svg.children[0];
  assert.equal(layer.attrs['pointer-events'],'none');
  assert.deepEqual(layer.children.filter(n=>n.tag==='circle').map(n=>[n.attrs.cx,n.attrs.cy]),[[5.7,-.475],[5.7,-.8]]);
  h.container.onclick({target:{closest:()=>({dataset:{clearanceIndex:'0',clearanceSide:'object'}})}});
  assert.deepEqual(h.selections,[{kind:'wall',id:'wall'}]);
  assert.match(h.container.innerHTML,/data-clearance-side="object" aria-pressed="true"/);
});

test('edits remove markers immediately, ignore in-flight old geometry, and recheck the current draft only',async()=>{
  let complete,next=Promise.resolve(rejected);
  const h=harness(()=>next);
  await h.ui.check();
  h.edit();
  const svg=new Node();
  h.ui.overlay(svg,{scale:50});
  assert.equal(svg.children.length,0);
  assert.match(h.container.innerHTML,/场景已修改/);
  next=new Promise(resolve=>{complete=resolve;});
  const old=h.ui.check();
  h.edit();
  complete(rejected);
  await old;
  assert.doesNotMatch(h.container.innerHTML,/0\.325 m/);
  next=Promise.resolve(clear);
  await h.ui.check();
  assert.equal(h.calls.at(-1).body,h.scene);
  assert.match(h.container.innerHTML,/净空通过/);
});
