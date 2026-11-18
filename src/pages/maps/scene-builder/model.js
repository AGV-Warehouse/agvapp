(function(root){
'use strict';
const presets={'equipment-box-v1':{name:'设备箱体',width:1.2,depth:.8,height:1.5},'rect-column-v1':{name:'立柱',width:.4,depth:.4,height:3},'bumper-v1':{name:'防撞挡块',width:1.5,depth:.15,height:.15}};
const finite=n=>typeof n==='number'&&Number.isFinite(n),positive=n=>finite(n)&&n>0,idOK=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const copy=value=>JSON.parse(JSON.stringify(value));
const floorplanGeometry=root.SceneFloorplanGeometry||(typeof require==='function'?require('./floorplan-geometry.js'):null);
function id(){if(root.crypto?.randomUUID)return root.crypto.randomUUID().replaceAll('-','');throw Error('安全随机标识不可用');}
function fresh(name='新场景'){return {schemaVersion:'1.0',name,frame:'map',unit:'m',site:null,walls:[],obstacles:[]};}
function validate(scene){const errors=[],nameOK=n=>typeof n==='string'&&n.trim().length>=1&&n.length<=80&&!/[\x00-\x1f\x7f<>/\\]/.test(n),range=(n,min,max)=>finite(n)&&n>=min&&n<=max;if(!scene||!['1.0','1.1'].includes(scene.schemaVersion)||scene.frame!=='map'||scene.unit!=='m')errors.push('场景必须使用支持的版本 / map / m');if(!nameOK(scene?.name))errors.push('场景名称不能为空');
const point=p=>p&&range(p.x,-100000,100000)&&range(p.y,-100000,100000),box=b=>point(b)&&range(b.width,.01,1000)&&range(b.depth,.01,1000);
if(scene?.site!==null&&!box(scene?.site))errors.push('场地坐标与尺寸无效');
if(scene?.floorplan!==undefined){const error=floorplanGeometry?.validate(scene.floorplan)||(!floorplanGeometry?'底图组件尚未载入':'');if(error)errors.push(error);}
if(!Array.isArray(scene?.walls)||!Array.isArray(scene?.obstacles)){errors.push('墙体与障碍物必须为列表');return errors;}
if(scene.walls.length>500||scene.obstacles.length>500)errors.push('墙体与障碍物分别最多500项');const ids=new Set();for(const [kind,list]of [['墙体',scene.walls],['障碍物',scene.obstacles]])for(const o of list){if(!idOK(o?.id)||ids.has(o.id))errors.push(kind+'标识无效或重复');ids.add(o?.id);if(!nameOK(o?.name))errors.push(kind+'名称不能为空');if(kind==='墙体'){if(!point(o?.start)||!point(o?.end)||Math.hypot(o.end.x-o.start.x,o.end.y-o.start.y)<.01||!range(o.thickness,.01,10)||!range(o.height,.01,100))errors.push('墙体端点、厚度或高度无效');}else if(!presets[o?.templateId]||!box(o)||!range(o.yaw,-Math.PI,Math.PI)||!range(o.height,.01,100))errors.push('障碍物模板、坐标或尺寸无效');}if(scene.schemaVersion==='1.1'){const N=root.SceneNetworkModel||(typeof require==='function'?require('./network-model.js'):null);if(!N)errors.push('路网组件尚未载入');else errors.push(...N.validate(scene));}else if(scene.navigation!==undefined)errors.push('旧版场景不能包含路网字段');return errors;}
function checked(scene){const errors=validate(scene);if(errors.length)throw Error(errors.join('；'));return scene;}
function find(scene,selection){return selection?.kind==='site'?scene.site:selection?.kind==='wall'?scene.walls.find(o=>o.id===selection.id):selection?.kind==='obstacle'?scene.obstacles.find(o=>o.id===selection.id):null;}
function update(scene,selection,patch){const next=copy(scene),o=find(next,selection);if(!o)throw Error('对象不存在');Object.assign(o,copy(patch));return checked(next);}
function remove(scene,selection){const next=copy(scene);if(selection?.kind==='site')next.site=null;else if(selection?.kind==='wall')next.walls=next.walls.filter(o=>o.id!==selection.id);else if(selection?.kind==='obstacle')next.obstacles=next.obstacles.filter(o=>o.id!==selection.id);return checked(next);}
function duplicate(scene,selection,newId=id()){if(!idOK(newId))throw Error('标识无效');const o=find(scene,selection);if(!o||selection.kind==='site')throw Error('只能复制墙体或障碍物');const next=copy(scene),item=copy(o);item.id=newId;item.name+=' 副本';if(selection.kind==='wall'){item.start.x+=.1;item.start.y+=.1;item.end.x+=.1;item.end.y+=.1;next.walls.push(item);}else{item.x+=.1;item.y+=.1;next.obstacles.push(item);}return checked(next);}
function addObstacle(scene,templateId,x,y,newId=id()){if(!presets[templateId])throw Error('未知模板');const next=copy(scene);next.obstacles.push({id:newId,templateId,...presets[templateId],x,y,yaw:0});return checked(next);}
const api={presets,fresh,validate,find,update,remove,duplicate,addObstacle,id,snap:n=>Math.round(n*10)/10};root.SceneBuilderModel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
