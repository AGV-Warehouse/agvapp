(function(root){
'use strict';
const NS='http://www.w3.org/2000/svg';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kindName={point:'点位',path:'路线',wall:'墙体',obstacle:'障碍物'};
const location=({x,y})=>`(${x.toFixed(3)}, ${y.toFixed(3)})`;

function mount(container, api, {getContext, onSelect, onUpdate}) {
  let context, report=null, active=null, loading=false, error='', edited=false;
  function sync() {
    const next=getContext();
    if (!context || next.scene!==context.scene || next.scope!==context.scope ||
        next.keyRevision!==context.keyRevision) {
      edited=!!(report||loading||edited)&&next.scene!==context?.scene;
      report=null;
      active=null;
      loading=false;
      error='';
      context=next;
    }
  }
  function render() {
    sync();
    const message=loading?'正在检查画布上的点位、路线、墙体和障碍物…':error||
      (report?.issueCount?`发现 ${report.issueCount} 处净空不足。${report.issueCount>report.issues.length?`已列出前 ${report.issues.length} 处。`:''}点选下方对象可在画布定位并修改。`:
        report?.applicable?'当前画布上的点位和路线与墙体、障碍物之间的净空通过。生成时仍会校验停车、占据地图及工位。':
        report?'请先设置场地并放置点位。':edited?'场景已修改，请重新检查净空。':'检查当前画布上的点位和路线是否离墙体或障碍物过近。');
    container.innerHTML=`<p role="status">${esc(message)}</p>`+(report?.issues.length?`<ol class="scene-clearance-issues">${report.issues.map((issue,index)=>{
      const {route,object,distanceM}=issue;
      return `<li><div><button type="button" class="button" data-clearance-index="${index}" data-clearance-side="route" aria-pressed="${index===active?.index&&active.side==='route'}">${kindName[route.kind]} · ${esc(route.name)}</button> <button type="button" class="button" data-clearance-index="${index}" data-clearance-side="object" aria-pressed="${index===active?.index&&active.side==='object'}">${kindName[object.kind]} · ${esc(object.name)}</button></div>
        <span>最近距离 ${distanceM.toFixed(3)} m，须大于 ${report.requiredDistanceM.toFixed(6)} m。</span>
        <small>最近位置 ${kindName[route.kind]} ${location(route.nearest)} · ${kindName[object.kind]} ${location(object.nearest)}（m）</small></li>`;
    }).join('')}</ol>`:'');
  }
  async function check() {
    sync();
    if (loading || getContext().disabled) return;
    const requested=context;
    report=null;
    active=null;
    error='';
    edited=false;
    loading=true;
    onUpdate();
    try {
      const value=await api.request('map-workspace/scene-clearance', requested.scene);
      sync();
      if (context!==requested) return;
      if (!Array.isArray(value?.issues) || !Number.isFinite(value.requiredDistanceM) ||
          !Number.isInteger(value.issueCount)) throw Error('Invalid clearance report');
      report=value;
      active=value.issues.length?{index:0,side:'route'}:null;
    } catch (_) {
      sync();
      if (context!==requested) return;
      error='未能检查净空，请确认已登录后重试。';
    } finally {
      if (context===requested) {
        loading=false;
        onUpdate();
      }
    }
  }
  container.onclick=e=>{
    const button=e.target.closest('[data-clearance-index]');
    if (!button) return;
    sync();
    const index=Number(button.dataset.clearanceIndex),side=button.dataset.clearanceSide;
    const item=report?.issues[index]?.[side];
    if (!item) return;
    const original=context;
    if (!onSelect({kind:item.kind,id:item.id})) return;
    sync();
    if (context!==original) return;
    active={index,side};
    onUpdate();
  };
  function overlay(svg,{scale}) {
    sync();
    const issue=report?.issues[active?.index];
    if (!issue) return;
    const scene=context.scene, unit=px=>px/Math.max(scale,.00001);
    const el=(tag,attrs)=>{const node=svg.ownerDocument.createElementNS(NS,tag);for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);return node;};
    const red='#b42318', layer=el('g',{'data-clearance-overlay':'','pointer-events':'none','aria-hidden':'true'});
    const line=(a,b,attrs)=>el('line',{x1:a.x,y1:-a.y,x2:b.x,y2:-b.y,...attrs});
    const route=issue.route, object=issue.object;
    if (object.kind==='wall') {
      const wall=scene.walls.find(w=>w.id===object.id);
      layer.append(line(wall.start,wall.end,{stroke:red,'stroke-width':wall.thickness+unit(4),'stroke-opacity':.52}));
    } else {
      const box=scene.obstacles.find(o=>o.id===object.id);
      layer.append(el('rect',{x:-box.width/2,y:-box.depth/2,width:box.width,height:box.depth,
        transform:`translate(${box.x} ${-box.y}) rotate(${-box.yaw*180/Math.PI})`,fill:'none',stroke:red,'stroke-width':unit(4)}));
    }
    if (route.kind==='path') {
      const path=scene.navigation.paths.find(p=>p.id===route.id);
      const pts=scene.navigation.points;
      layer.append(line(pts.find(p=>p.id===path.sourcePointId),pts.find(p=>p.id===path.targetPointId),
        {stroke:red,'stroke-width':unit(6),'stroke-opacity':.65}));
    }
    layer.append(line(route.nearest,object.nearest,{stroke:red,'stroke-width':unit(2),'stroke-dasharray':`${unit(4)} ${unit(3)}`}));
    for (const [side,item] of [['object',object],['route',route]]) {
      const {x,y}=item.nearest;
      layer.append(el('circle',{cx:x,cy:-y,r:unit(side===active.side?7:5),fill:'white',stroke:red,'stroke-width':unit(2)}));
    }
    svg.append(layer);
  }
  return {sync,render,check,overlay,loading:()=>loading};
}

root.SceneClearanceUI={mount};
if (typeof module==='object'&&module.exports) module.exports=root.SceneClearanceUI;
})(globalThis);
