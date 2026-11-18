(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
  const authorized=api=>!!(api.authorized&&api.deploymentConfirmed);
  const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'更新时间未提供';
  class Controller {
    constructor(api,onChange=()=>{}){this.api=api;this.onChange=onChange;this.scope=null;this.keyRevision=null;this.sequence=0;this.destroyed=false;this.visible=false;this.query='';this.reset();}
    reset(){this.rows=[];this.selected=null;this.preview=null;this.loaded=false;this.loading=false;this.previewLoading=false;this.error='';this.previewError='';}
    bind(){if(this.scope===this.api.scope&&this.keyRevision===this.api.keyRevision)return false;this.sequence++;this.scope=this.api.scope;this.keyRevision=this.api.keyRevision;this.reset();this.query='';return true;}
    context(){return {scope:this.api.scope,key:this.api.keyRevision,sequence:this.sequence};}
    current(c){return !this.destroyed&&authorized(this.api)&&c.scope===this.api.scope&&c.key===this.api.keyRevision&&c.sequence===this.sequence;}
    emit(){if(!this.destroyed)this.onChange(this);}
    filtered(){const q=this.query.trim().toLocaleLowerCase();return this.rows.filter(r=>r.name.toLocaleLowerCase().includes(q));}
    search(value){this.query=value;this.emit();}
    async refresh(){
      this.bind();if(this.destroyed||!authorized(this.api)||this.loading)return;
      const selected=this.selected;this.sequence++;const c=this.context();this.loading=true;this.previewLoading=false;this.error='';this.emit();
      try{
        const value=await this.api.request('map-workspace/scenes');if(!this.current(c))return;
        if(!Array.isArray(value.scenes)||value.scenes.some(r=>!validId(r.id)||typeof r.name!=='string'||!Number.isInteger(r.revision)||r.revision<1))throw Error('invalid catalog');
        this.rows=value.scenes;this.loaded=true;this.selected=this.rows.some(r=>r.id===selected)?selected:this.rows[0]?.id||null;this.preview=null;
      }catch(_){if(this.current(c)){this.rows=[];this.preview=null;this.selected=null;this.loaded=false;this.error='场景库暂时无法读取。请检查本页权限或连接，再刷新列表。';}}
      finally{if(this.current(c)){this.loading=false;this.emit();}}
      if(this.current(c)&&this.selected)await this.select(this.selected);
    }
    async select(id){
      this.bind();if(!authorized(this.api)||this.loading||!this.rows.some(r=>r.id===id))return;
      this.selected=id;this.preview=null;this.previewError='';this.previewLoading=true;this.sequence++;const c=this.context();this.emit();
      try{
        const value=await this.api.request('map-workspace/scenes/'+encodeURIComponent(id));if(!this.current(c))return;
        if(value.id!==id||!Number.isInteger(value.revision)||value.revision<1||value.scene?.frame!=='map'||value.scene?.unit!=='m'||typeof value.scene.name!=='string'||!Array.isArray(value.scene.walls)||!Array.isArray(value.scene.obstacles))throw Error('invalid scene');
        this.preview=value;
        // A concurrent edit can advance the head after the catalog GET. Show the
        // returned revision and name, rather than labeling it with the older row.
        this.rows=this.rows.map(r=>r.id===id?{...r,name:value.scene.name,revision:value.revision,updatedAt:value.updatedAt}:r);
      }catch(_){if(this.current(c))this.previewError='此场景尚未读取成功，请重新选择或刷新。未打开其他场景代替。';}
      finally{if(this.current(c)){this.previewLoading=false;this.emit();}}
    }
    authorizationChanged(){const changed=this.bind();if(!authorized(this.api)){this.sequence++;this.reset();this.emit();return;}if(changed)this.emit();if(this.visible&&!this.loaded&&!this.loading)return this.refresh();}
    setVisible(value){const entered=value&&!this.visible;this.visible=value;this.bind();if(entered)return this.refresh();}
    destroy(){this.destroyed=true;this.sequence++;}
  }
  function previewSVG(scene){
    const site=scene?.site,finite=v=>Number.isFinite(v)&&Math.abs(v)<=100000,point=p=>p&&finite(p.x)&&finite(p.y);
    if(!point(site)||!finite(site.width)||!finite(site.depth)||site.width<=0||site.depth<=0)return '<p class="scene-library-empty">尚未画出场地。打开后可按尺寸建立。</p>';
    const pad=Math.max(site.width,site.depth)*.07,size=Math.max(site.width,site.depth),stroke=size*.004;
    const walls=(scene.walls||[]).filter(w=>point(w.start)&&point(w.end)&&finite(w.thickness)).map(w=>`<line x1="${w.start.x}" y1="${-w.start.y}" x2="${w.end.x}" y2="${-w.end.y}" stroke="#33465e" stroke-width="${w.thickness}"/>`).join('');
    const obstacles=(scene.obstacles||[]).filter(o=>point(o)&&[o.width,o.depth,o.yaw].every(finite)).map(o=>`<rect x="${o.x-o.width/2}" y="${-o.y-o.depth/2}" width="${o.width}" height="${o.depth}" transform="rotate(${-o.yaw*180/Math.PI} ${o.x} ${-o.y})" fill="${o.templateId==='bumper-v1'?'#be8532':'#91a3b8'}"/>`).join('');
    const points=new Map((scene.navigation?.points||[]).filter(point).map(p=>[p.id,p]));
    const paths=(scene.navigation?.paths||[]).map(p=>{const a=points.get(p.sourcePointId),b=points.get(p.targetPointId);return a&&b?`<line x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}" stroke="#4d7bd2" stroke-width="${stroke*1.5}"/>`:'';}).join('');
    const stations=(scene.navigation?.stations||[]).map(s=>{const p=points.get(s.pointId);return p?`<circle cx="${p.x}" cy="${-p.y}" r="${size*.013}" fill="#278467" stroke="white" stroke-width="${stroke}"/>`:'';}).join('');
    const workcells=root.SceneWorkcellModel?.overlaySVG(scene,300/size)||'';
    return `<svg viewBox="${site.x-pad} ${-site.y-site.depth-pad} ${site.width+2*pad} ${site.depth+2*pad}" role="img" aria-label="已保存场景的二维草稿预览，非运行地图"><rect x="${site.x}" y="${-site.y-site.depth}" width="${site.width}" height="${site.depth}" fill="#f3f6fa" stroke="#cbd5e1" stroke-width="${stroke}"/>${walls}${obstacles}${workcells}${paths}${[...points.values()].map(p=>`<circle cx="${p.x}" cy="${-p.y}" r="${size*.007}" fill="#4d7bd2"/>`).join('')}${stations}</svg>`;
  }
  function mount(container,api,options={}){
    container.innerHTML='<section class="scene-library" aria-labelledby="sceneLibraryTitle"><div class="scene-library-heading"><div><p class="eyebrow">场地规划</p><h2 id="sceneLibraryTitle">我的场景</h2><p>打开已保存的场地继续规划，或从空场地开始。</p></div><div class="scene-library-entry-actions"><a class="button" href="example.html">示例工厂 · 上手练习</a><a class="button" href="editor.html">导入 ROS 地图</a><a class="button button-primary" href="scene-builder.html">新建场景</a></div></div><p class="scene-library-note">ROS 地图使用 YAML + PGM/PNG。厂房平面图可在场景搭建器导入 PNG/JPG 并校准比例。</p><div class="scene-library-tools"><label>搜索场景<input type="search" data-scene-search placeholder="按场景名称查找" autocomplete="off"></label><button class="button" data-scene-refresh>刷新列表</button></div><p class="scene-library-note">这里是规划草稿。打开、查看与保存不会更改运行地图；进入仿真前仍须校验并明确发布。</p><div data-scene-library-content></div></section>';
    const content=container.querySelector('[data-scene-library-content]'),input=container.querySelector('[data-scene-search]'),refresh=container.querySelector('[data-scene-refresh]');
    const controller=new Controller(api,render);
    function render(s){
      options.onSelectScene?.(s.filtered().some(r=>r.id===s.selected)&&s.preview?.id===s.selected?s.selected:null);
      input.disabled=!authorized(api);if(input.value!==s.query)input.value=s.query;refresh.disabled=!authorized(api)||s.loading;
      if(!authorized(api)){content.innerHTML='<div class="scene-library-empty"><h3>连接你的场景库</h3><p>请使用右上角“操作员登录”读取已保存的场景。也可先在编辑器中搭建，保存时登录。</p></div>';return;}
      if(s.error){content.innerHTML=`<p class="release-error" role="alert">${esc(s.error)}</p>`;return;}
      if(!s.loaded){content.innerHTML=`<p class="scene-library-empty" role="status">${s.loading?'正在读取已保存的场景…':'准备读取场景库…'}</p>`;return;}
      if(!s.rows.length){content.innerHTML='<div class="scene-library-empty"><h3>从第一块场地开始</h3><p>新建场景后，画场地、拉墙和放设备，再规划路线与停车工位。保存后即可在这里重开。</p><a class="button" href="scene-builder.html">建立第一个场景</a></div>';return;}
      const rows=s.filtered(),selectedVisible=rows.some(r=>r.id===s.selected),p=selectedVisible?s.preview:null,scene=p?.scene,nav=scene?.navigation;
      content.innerHTML=`<div class="scene-library-grid" ${s.loading?'aria-busy="true"':''}><section class="scene-library-list" aria-label="已保存的场景"><p class="scene-library-count">${rows.length} 个场景${s.loading?' · 正在刷新':''}</p>${rows.map(r=>`<button type="button" class="scene-library-row ${r.id===s.selected?'selected':''}" data-scene-select="${esc(r.id)}" aria-pressed="${r.id===s.selected}" ${s.loading?'disabled':''}><strong>${esc(r.name)}</strong><span>修订 ${r.revision} · 已保存草稿</span><small>${esc(date(r.updatedAt))}</small></button>`).join('')||'<p class="scene-library-empty">没有找到匹配的场景。请修改搜索内容。</p>'}</section><section class="scene-library-preview" aria-label="所选场景预览">${selectedVisible&&s.previewLoading?'<p role="status">正在读取所选场景…</p>':selectedVisible&&s.previewError?`<p class="release-error" role="alert">${esc(s.previewError)}</p>`:p?`<div class="scene-library-preview-heading"><h3>${esc(scene.name)}</h3><span>草稿 · 修订 ${p.revision}</span></div><div class="scene-library-map">${previewSVG(scene)}</div><p class="scene-library-legend">深色：墙和设备 · 蓝色：路线 · 绿色：停车点${root.SceneWorkcellModel?.list(scene).length?' · 虚线：规划工位':''}</p><dl class="scene-library-facts"><div><dt>场地尺寸</dt><dd>${scene.site?esc(scene.site.width)+' × '+esc(scene.site.depth)+' m':'尚未建立'}</dd></div><div><dt>墙体 / 障碍</dt><dd>${scene.walls?.length||0} / ${scene.obstacles?.length||0}</dd></div><div><dt>路线 / 停车工位</dt><dd>${nav?.paths?.length||0} / ${nav?.stations?.length||0}</dd></div></dl><p class="scene-library-note">预览不代表净空或车辆准入已通过。继续编辑将打开服务器上的最新修订；已有发布和运行保留原版本。</p><a class="button button-primary" href="scene-builder.html?sceneId=${esc(p.id)}">打开场景继续编辑</a>${options.onOpenHistory?'<button type="button" class="button" data-scene-history-open>查看修订与使用记录</button>':''}`:'<p>选择左侧场景查看预览。</p>'}</section></div>`;
      content.querySelector('[data-scene-history-open]')?.addEventListener('click',()=>options.onOpenHistory?.());
      for(const button of content.querySelectorAll('[data-scene-select]'))button.addEventListener('click',()=>controller.select(button.dataset.sceneSelect));
    }
    input.addEventListener('input',()=>controller.search(input.value));refresh.addEventListener('click',()=>controller.refresh());controller.bind();render(controller);
    return {controller,authorizationChanged:()=>controller.authorizationChanged(),setVisible:value=>controller.setVisible(value),destroy(){controller.destroy();container.replaceChildren();}};
  }
  root.SceneLibraryUI={Controller,mount,previewSVG};if(typeof module==='object'&&module.exports)module.exports=root.SceneLibraryUI;
})(typeof window==='undefined'?globalThis:window);
