(function(root){
  'use strict';
  const Model=root.SceneBuilderModel||(typeof require==='function'?require('./model.js'):null);
  const copy=v=>JSON.parse(JSON.stringify(v));
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  const normalize=scene=>{const value=copy(scene);value.name=value.name.trim();for(const item of [...value.walls,...value.obstacles])item.name=item.name.trim();return value;};
  class Controller {
    constructor(api,options={}) {
      this.api=api;this.options=options;this.storage=options.storage;this.scene=Model.fresh();this.baseline=copy(this.scene);this.id=null;this.revision=0;this.dirty=false;
      this.busy=false;this.pending=null;this.pendingScope=null;this.sceneScope=null;this.canRetry=false;this.conflict=false;this.warnings=[];this.undo=[];this.redo=[];this.generation=0;this.catalog=[];
    }
    emit(){this.options.onChange?.(this);}
    requireAccess(){if(!this.api.authorized||!this.api.deploymentConfirmed)throw Error('请先登录操作员会话。');if((this.pendingScope&&this.pendingScope!==this.api.scope)||(this.sceneScope&&this.sceneScope!==this.api.scope))throw Error('场景属于原服务器连接，请返回原连接核对，不能跨服务器保存。');}
    pendingKey(){return 'fleet-scene-save:'+this.api.scope;}
    remember(value){if(!this.storage)throw Error('本页无法保留保存请求，请检查浏览器存储后重试。');this.storage.setItem(this.pendingKey(),JSON.stringify(value));}
    forget(){try{this.storage?.removeItem(this.pendingKey());}catch(_){}this.pending=null;this.pendingScope=null;this.canRetry=false;}
    change(scene){if(this.busy||this.pending)throw Error('请先核对当前保存结果，再继续编辑。');const errors=Model.validate(scene);if(errors.length)throw Error(errors[0]);if(equal(scene,this.scene))return;this.undo.push(copy(this.scene));if(this.undo.length>80)this.undo.shift();this.redo=[];this.scene=copy(scene);this.dirty=!equal(normalize(this.scene),normalize(this.baseline));this.emit();}
    history(direction){if(this.busy||this.pending)return;const from=direction==='undo'?this.undo:this.redo,to=direction==='undo'?this.redo:this.undo;if(!from.length)return;to.push(copy(this.scene));this.scene=from.pop();this.dirty=!equal(normalize(this.scene),normalize(this.baseline));this.emit();}
    fresh(){if(this.busy||this.pending)throw Error('请先核对当前保存结果。');this.scene=Model.fresh();this.baseline=copy(this.scene);this.id=null;this.revision=0;this.sceneScope=null;this.dirty=false;this.conflict=false;this.warnings=[];this.undo=[];this.redo=[];this.generation++;this.options.onIdentity?.(null);this.emit();}
    context(){return {scope:this.api.scope,keyRevision:this.api.keyRevision,generation:this.generation};}
    current(c){return this.api.scope===c.scope&&this.api.keyRevision===c.keyRevision&&this.generation===c.generation;}
    async task(action){this.requireAccess();if(this.busy)throw Error('正在读取或保存，请稍候。');this.busy=true;const c=this.context();this.emit();try{return await action(c);}finally{this.busy=false;this.emit();}}
    check(value,id){if(value?.id!==id||!Number.isInteger(value.revision)||value.revision<1||!value.scene||Model.validate(value.scene).length)throw Error('服务器返回的场景内容无效，保留本页修改。');return value;}
    adopt(value){this.id=value.id;this.revision=value.revision;this.sceneScope=this.api.scope;this.scene=copy(value.scene);this.baseline=copy(this.scene);this.dirty=false;this.conflict=false;this.warnings=value.warnings||[];this.undo=[];this.redo=[];this.options.onIdentity?.(this.id);}
    async list(){return this.task(async c=>{const value=await this.api.request('map-workspace/scenes');if(!this.current(c))throw Error('连接已变化，请重新读取场景列表。');if(!Array.isArray(value.scenes))throw Error('场景列表读取失败。');this.catalog=value.scenes;return value.scenes;});}
    async open(id){if(this.pending)throw Error('请先核对原保存请求。');return this.task(async c=>{const value=this.check(await this.api.request('map-workspace/scenes/'+encodeURIComponent(id)),id);if(!this.current(c))throw Error('连接已变化，未载入旧连接的场景。');this.adopt(value);return value;});}
    restorePending(){const text=this.storage?.getItem(this.pendingKey());if(!text)return false;let value;try{value=JSON.parse(text);}catch(_){throw Error('本页保存索引无法读取，请保留当前页面并核对服务器记录。');}if(!/^[a-f0-9]{32}$/.test(value?.id)||!Number.isInteger(value.expectedRevision)||value.expectedRevision<0||!value.scene||Model.validate(value.scene).length)throw Error('本页保存索引无效，请核对原场景记录。');this.pending=value;this.pendingScope=this.api.scope;this.sceneScope=this.api.scope;this.scene=copy(value.scene);this.id=value.id;this.revision=value.expectedRevision;this.dirty=true;this.options.onIdentity?.(value.id);this.emit();return true;}
    async save(asCopy=false){if(this.pending)throw Error('上次保存结果尚待核对，请先查询原场景。');return this.task(async c=>{
      const payload={id:asCopy||!this.id?Model.id():this.id,expectedRevision:asCopy?0:this.revision,scene:normalize(this.scene)};
      const errors=Model.validate(payload.scene);if(errors.length)throw Error(errors[0]);this.remember(payload);this.pending=copy(payload);this.pendingScope=c.scope;this.options.onIdentity?.(payload.id);this.emit();
      try{const value=this.check(await this.api.request('map-workspace/scenes',payload),payload.id);if(!this.current(c))throw Error('连接已变化，请在原连接核对保存结果。');if(value.revision!==payload.expectedRevision+1||!equal(value.scene,payload.scene))throw Error('保存回读与本次修改不一致，请核对原场景。');this.adopt(value);this.forget();return value;}
      catch(error){if(this.current(c)&&error.status>=400&&error.status<500&&![408,429].includes(error.status)){this.forget();this.conflict=error.status===409;}throw error;}
    });}
    async reconcile(){if(!this.pending)throw Error('没有待核对的保存请求。');return this.task(async c=>{const p=copy(this.pending);let value;try{value=this.check(await this.api.request('map-workspace/scenes/'+p.id+'/revisions/'+(p.expectedRevision+1)),p.id);}catch(error){if(error.status===404&&this.current(c))this.canRetry=true;throw error;}if(!this.current(c))throw Error('连接已变化，未采用旧连接的保存结果。');if(value.revision===p.expectedRevision+1&&equal(value.scene,p.scene)){this.adopt(value);this.forget();const head=this.check(await this.api.request('map-workspace/scenes/'+p.id),p.id);if(!this.current(c))throw Error('连接已变化，请重新读取当前版本。');this.conflict=head.revision>value.revision;return value;}this.id=p.id;this.revision=p.expectedRevision;this.sceneScope=c.scope;this.conflict=true;this.forget();throw Error('服务器原修订与本页内容不同，本页修改保留，可另存为新场景。');});}
    async retryPending(){if(!this.pending||!this.canRetry)throw Error('请先核对原保存请求。');return this.task(async c=>{const p=copy(this.pending);let value;try{value=this.check(await this.api.request('map-workspace/scenes',p),p.id);}catch(error){if(error.status===409)throw Error('原保存可能已经完成，请再次核对原场景。');throw error;}if(!this.current(c))throw Error('连接已变化，请在原连接核对。');if(value.revision!==p.expectedRevision+1||!equal(value.scene,p.scene))throw Error('保存回读尚未匹配，请核对原请求。');this.adopt(value);this.forget();return value;});}
  }
  root.SceneBuilderController={Controller};if(typeof module==='object'&&module.exports)module.exports={Controller};
})(typeof window==='undefined'?globalThis:window);
