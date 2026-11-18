const test = require('node:test');
const assert = require('node:assert/strict');
const portal = require('../portal-state.js');
test('six hash routes restore directly and unknown paths fall back safely', () => {
  for (const value of portal.routes) assert.equal(portal.route('#/' + value), value);
  assert.equal(portal.route('#/unexpected'), 'operations');
  assert.equal(portal.route(''), 'operations');
});
test('restored unknown intent blocks a new intent across vehicle selections', () => {
  const record = (status, type='create_order') => ({ status, envelope: { requestId:status, command:{type,robotId:'A'} } });
  const snapshot = {records:[record('UNKNOWN'),record('DISPATCHING'),record('ACCEPTED'),record('REJECTED'),record('UNKNOWN','pause')]};
  assert.deepEqual(portal.unresolved(snapshot).map(x=>x.status), ['UNKNOWN','DISPATCHING']);
  const items = portal.attention({received:true,connected:true,modelFresh:true,stationCount:1,snapshot,robots:[]});
  assert.equal(items.length,2);
  assert.ok(items.every(x=>x.route==='events'));
});
test('absence and stale data stay distinct from healthy connected empty fleet', () => {
  assert.match(portal.attention({received:false,modelFresh:false})[0].text,/尚未收到/);
  const healthy = portal.attention({received:true,connected:true,modelFresh:true,stationCount:1,robots:[]});
  assert.deepEqual(healthy,[]);
});
test('live admission overrides historical READY and selecting history never clears the gate',()=>{
  const state={status:{enabled:true,currentAdmission:{ready:false}},statusFresh:true,activePublication:{status:'READY'},publication:{status:'REJECTED'}};
  assert.match(portal.publicationBlock(state),/当前准入未通过/);
  state.status.currentAdmission.ready=true;
  assert.equal(portal.publicationBlock(state),'');
  state.activePublication.status='UNKNOWN';
  assert.match(portal.publicationBlock(state),/发布尚未确认/);
  assert.equal(portal.publicationBlock({status:{enabled:false}}),'');
});

test('replay deep links retain the simulation workspace without interpreting query as a new route',()=>{assert.equal(require('../portal-state.js').route('#/simulation?kind=run&id=original&at=383.1'),'simulation');});
