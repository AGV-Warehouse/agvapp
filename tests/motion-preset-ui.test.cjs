const test=require('node:test');
const assert=require('node:assert/strict');
const UI=require('../motion-preset-ui.js');
const presets=[{id:'acceptance-v1',parameters:{linearVelocityMps:.05,angularVelocityRadps:.25,pathVelocityScale:1}},{id:'development-v1',parameters:{linearVelocityMps:.15,angularVelocityRadps:.75,pathVelocityScale:3}}];
test('motion preset cards use the approved copy and only server offered capabilities',()=>{
 const html=UI.cards(presets,'acceptance-v1');
 assert.match(html,/工况验收档/);assert.match(html,/快速开发档/);assert.match(html,/最高0.15 m\/s · 转向0.75 rad\/s · 路段限速×3/);
 assert.match(html,/value="acceptance-v1" checked/);assert.match(html,/确认版本时锁定/);assert.match(html,/当前世界倍率1×/);
 assert.equal(UI.cards([], 'acceptance-v1'),'');assert.doesNotMatch(UI.cards(presets.slice(0,1),'acceptance-v1'),/快速开发档/);
 assert.match(UI.cards(presets,'development-v1',true),/disabled/);
});
test('recorded preset display never fills missing historical configuration from defaults',()=>{
 assert.equal(UI.recorded(null),'历史记录未记录档位');assert.match(UI.recorded(presets[1]),/快速开发档.*0.15/);
 assert.match(UI.recorded({id:'future',parameters:{}}),/已记录运行档位.*未知/);
 assert.doesNotMatch(UI.recordedHTML({id:'<bad>',parameters:{linearVelocityMps:'<script>'}}),/<script>/);
});
