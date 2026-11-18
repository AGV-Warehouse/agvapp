(function(root){
  "use strict";
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy={
    'acceptance-v1':{label:'工况验收档',description:'沿用当前低速基线，供工况验证；实车参数仍需标定'},
    'development-v1':{label:'快速开发档',description:'提高导航与路段限速，缩短开发等待；不作为实车工况结论'}
  };
  function summary(preset){const p=preset?.parameters;if(!p)return '参数未记录';return `最高${p.linearVelocityMps??'未知'} m/s · 转向${p.angularVelocityRadps??'未知'} rad/s${p.pathVelocityScale===3?' · 路段限速×3':''}`;}
  function recorded(preset){return preset?`${copy[preset.id]?.label||'已记录运行档位'} · ${summary(preset)}`:'历史记录未记录档位';}
  function recordedHTML(preset){return `<p class="motion-preset-record">${escape(recorded(preset))}</p>`;}
  function cards(presets,selected,disabled=false){const offered=(presets||[]).filter(p=>copy[p.id]);if(!offered.length)return '';return `<fieldset class="motion-presets"><legend>运行档位</legend><div class="motion-preset-grid">${offered.map(p=>`<label class="motion-preset-card"><input type="radio" name="motion-preset" value="${escape(p.id)}" ${p.id===selected?'checked':''} ${disabled?'disabled':''}><span><strong>${copy[p.id].label}</strong><small>${copy[p.id].description}</small><span>${escape(summary(p))}</span></span></label>`).join('')}</div><p>确认版本时锁定，运行中不能切换。当前世界倍率1×。</p><details><summary>高级参数与档位标识</summary><pre>${escape(JSON.stringify(offered,null,2))}</pre></details></fieldset>`;}
  const api={summary,recorded,recordedHTML,cards};root.MotionPresetUI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
