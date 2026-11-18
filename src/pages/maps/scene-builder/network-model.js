(function(root){
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
const finite=n=>typeof n==='number'&&Number.isFinite(n),idOK=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(id);
const nameOK=name=>typeof name==='string'&&name.trim().length>0&&name.length<=80&&!/[\x00-\x1f\x7f<>/\\]/.test(name);
const range=(n,min,max)=>finite(n)&&n>=min&&n<=max,vehicles=['LAB-01','LAB-02','LAB-03','LAB-04'];
const workcells=root.SceneWorkcellModel||(typeof require==='function'?require('./workcell-model.js'):null);
function read(scene){return scene?.navigation||{points:[],paths:[],stations:[],spawns:[]};}
function validate(scene){
 const errors=[],nav=scene?.navigation;if(nav===undefined){if(scene?.schemaVersion==='1.1')errors.push('新版场景缺少路网内容');return errors;}
 if(scene.schemaVersion!=='1.1')errors.push('路网修改需使用新版场景格式');
 if(!nav||typeof nav!=='object'||Array.isArray(nav))return [...errors,'路网内容无效'];
 const unknown=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).some(key=>!keys.includes(key));
 if(unknown(nav,['points','paths','stations','spawns']))errors.push('路网包含不支持的属性');
 for(const key of ['points','paths','stations','spawns'])if(!Array.isArray(nav[key]))errors.push('点位、路线、停车位与车辆起点必须为列表');
 if(errors.length)return errors;
 for(const [key,limit,label]of [['points',100,'点位'],['paths',200,'路线'],['stations',50,'停车位'],['spawns',vehicles.length,'车辆起点']])if(nav[key].length>limit)errors.push(`${label}最多${limit}项`);
 const identities=new Set(),pointIds=new Set(nav.points.map(p=>p?.id));
 const fields={points:['id','name','x','y'],paths:['id','name','sourcePointId','targetPointId','direction','maxVelocity'],stations:['id','name','pointId','yaw','workcell'],spawns:['vehicleName','pointId','yaw']};
 for(const [key,label]of [['points','点位'],['paths','路线'],['stations','停车位']])for(const item of nav[key]){if(!idOK(item?.id)||identities.has(item.id))errors.push(label+'标识无效或重复');if([...vehicles,'SCENE-TRAFFIC','SCENE-PARKING'].includes(item?.id)||typeof item?.id==='string'&&item.id.endsWith(':reverse'))errors.push(label+'标识与生成资源保留名称冲突');identities.add(item?.id);if(!nameOK(item?.name))errors.push(label+'名称不能为空，且最多80字');}
 for(const key of Object.keys(fields))for(const item of nav[key])if(unknown(item,fields[key]))errors.push('路网对象包含不支持的属性');
 for(const p of nav.points)if(!range(p?.x,-100000,100000)||!range(p?.y,-100000,100000))errors.push('点位坐标无效');
 const directions=new Set();for(const p of nav.paths){if(!pointIds.has(p?.sourcePointId)||!pointIds.has(p?.targetPointId)||p.sourcePointId===p.targetPointId)errors.push('路线必须连接两个不同的现有点位');if(!['forward','bidirectional'].includes(p?.direction))errors.push('请选择单向或双向路线');if(!range(p?.maxVelocity,.01,.05))errors.push('路线速度应在0.01至0.05米每秒之间');const a=nav.points.find(n=>n?.id===p?.sourcePointId),b=nav.points.find(n=>n?.id===p?.targetPointId);if(a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<.001)errors.push('路线两端至少相距0.001米');if(['forward','bidirectional'].includes(p?.direction)){const pairs=[[p.sourcePointId,p.targetPointId],...(p.direction==='bidirectional'?[[p.targetPointId,p.sourcePointId]]:[])];for(const pair of pairs){const key=pair.join('\u0000');if(directions.has(key))errors.push('相同方向的路线已存在');directions.add(key);}}}
 const stationPoints=new Set(), tags=new Set(), buttons=new Set();
 for(const s of nav.stations){
  if(!pointIds.has(s?.pointId))errors.push('停车位必须关联现有点位');
  if(stationPoints.has(s?.pointId))errors.push('同一点位只能放一个停车位');
  stationPoints.add(s?.pointId);
  if(!range(s?.yaw,-Math.PI,Math.PI))errors.push('停车位朝向无效');
  if(s?.workcell===undefined)continue;
  const problem=workcells?workcells.validate(s.workcell):'工位组件尚未载入。';
  if(problem){errors.push(problem);continue;}
  const terminal=s.workcell.terminal;
  if(!terminal)continue;
  const button=terminal.buttonId.toLowerCase();
  if(tags.has(terminal.tagId))errors.push(`Tag ${terminal.tagId} 已被另一工位使用。`);
  if(buttons.has(button))errors.push(`按钮 ${terminal.buttonId} 已被另一工位使用。`);
  tags.add(terminal.tagId);buttons.add(button);
 }
 const assigned=new Set();for(const s of nav.spawns){if(!vehicles.includes(s?.vehicleName)||assigned.has(s.vehicleName))errors.push('每辆车（LAB-01 至 LAB-04）最多设置一个起点');assigned.add(s?.vehicleName);if(!pointIds.has(s?.pointId))errors.push('车辆起点必须关联现有点位');if(!range(s?.yaw,-Math.PI,Math.PI))errors.push('车辆起点朝向无效');}
 return [...new Set(errors)];
}
function checked(scene){const errors=validate(scene);if(errors.length)throw Error(errors[0]);return scene;}
function editable(scene){const next=copy(scene);next.schemaVersion='1.1';next.navigation=copy(read(scene));return next;}
function nextId(nav,prefix){const ids=new Set([...nav.points,...nav.paths,...nav.stations].map(o=>o.id));let i=1;while(ids.has(prefix+'-'+i))i++;return prefix+'-'+i;}
function find(scene,selection){const key={point:'points',path:'paths',station:'stations'}[selection?.kind];return key?read(scene)[key].find(item=>item.id===selection.id):null;}
function addPoint(scene,{name,x,y}){const next=editable(scene),n=next.navigation;n.points.push({id:nextId(n,'P'),name:(name||'点位 '+(n.points.length+1)).trim(),x,y});return checked(next);}
function addPath(scene,{name,sourcePointId,targetPointId,direction='bidirectional',maxVelocity=.05}){const next=editable(scene),n=next.navigation;n.paths.push({id:nextId(n,'R'),name:(name||'路线 '+(n.paths.length+1)).trim(),sourcePointId,targetPointId,direction,maxVelocity});return checked(next);}
function addStation(scene,{name,pointId,yaw=0}){const next=editable(scene),n=next.navigation;n.stations.push({id:nextId(n,'S'),name:(name||'停车位 '+(n.stations.length+1)).trim(),pointId,yaw});return checked(next);}
function setWorkcell(scene,stationId,plan){
 const next=editable(scene),station=next.navigation.stations.find(s=>s.id===stationId);
 if(!station)throw Error('请先选择停车工位。');
 if(plan===null)delete station.workcell;
 else station.workcell=copy(plan);
 return checked(next);
}
function update(scene,selection,patch){const next=editable(scene),item=find(next,selection);if(!item)throw Error('路网对象不存在');const allowed={point:['name','x','y'],path:['name','sourcePointId','targetPointId','direction','maxVelocity'],station:['name','pointId','yaw']}[selection.kind];for(const key of Object.keys(patch))if(!allowed.includes(key))throw Error('此属性不能修改');Object.assign(item,copy(patch));if(typeof item.name==='string')item.name=item.name.trim();return checked(next);}
function remove(scene,selection){const next=editable(scene),n=next.navigation;if(!find(next,selection))throw Error('路网对象不存在');if(selection.kind==='point'){n.points=n.points.filter(p=>p.id!==selection.id);n.paths=n.paths.filter(p=>p.sourcePointId!==selection.id&&p.targetPointId!==selection.id);n.stations=n.stations.filter(p=>p.pointId!==selection.id);n.spawns=n.spawns.filter(p=>p.pointId!==selection.id);}else if(selection.kind==='path')n.paths=n.paths.filter(p=>p.id!==selection.id);else n.stations=n.stations.filter(p=>p.id!==selection.id);return checked(next);}
function setSpawn(scene,{vehicleName,pointId,yaw=0}){if(!vehicles.includes(vehicleName))throw Error('请选择支持的车辆');const next=editable(scene),n=next.navigation;n.spawns=n.spawns.filter(s=>s.vehicleName!==vehicleName);if(pointId)n.spawns.push({vehicleName,pointId,yaw});return checked(next);}
function summary(scene){const n=read(scene);return `点位 ${n.points.length} · 路线 ${n.paths.length} · 停车位 ${n.stations.length} · 参与车辆 ${n.spawns.length}/${vehicles.length}`;}
const api={read,validate,find,addPoint,addPath,addStation,setWorkcell,update,remove,setSpawn,summary,vehicles,idOK};root.SceneNetworkModel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
