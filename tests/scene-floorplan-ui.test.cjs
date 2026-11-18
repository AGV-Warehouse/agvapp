const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../src/pages/maps/scene-builder/floorplan-ui.js');

function fixture() {
  const elements = new Map();
  function node(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const listeners = {};
    const element = {
      value:'', validity:{badInput:false},
      get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
      addEventListener(type, listener) { listeners[type] = listener; },
      emit(type) { listeners[type]({preventDefault(){}, currentTarget:this}); },
      setAttribute(name, value) { this[name] = value; },
      querySelector:node
    };
    elements.set(selector, element);
    return element;
  }
  return {container:{querySelector:node}, control:name=>node(`[data-floorplan-${name}]`)};
}

test('canvas picks preserve unsaved distance and position, then apply image and world coordinates', () => {
  const {container, control} = fixture();
  const applied = [];
  const picks = [];
  const ui = UI.mount(container, {onApply:value=>applied.push(value), onPick:point=>picks.push(point)});
  const draft = {name:'厂房.jpg', width:500, height:200};
  ui.render({draft, authorized:true});
  control('pick-a').emit('click');
  assert.deepEqual(picks, ['A']);
  control('distance').value = '12.5';
  control('origin-x').value = '-3.75';
  const anchorA = {u:0,v:5};
  const anchorB = {u:500,v:200};
  ui.render({draft:{...draft, anchorA}, picking:'B', authorized:true});
  assert.equal(control('pick-b')['aria-pressed'], 'true');
  ui.render({draft:{...draft, anchorA, anchorB}, authorized:true});
  control('form').emit('submit');
  assert.deepEqual(applied, [{...draft, anchorA, anchorB, distanceM:12.5, origin:{x:-3.75,y:0}, headingDeg:0}]);
});

test('connection, bounds, and coincident anchors gate apply and manual entry supplies the same pixel coordinates', () => {
  const {container, control} = fixture();
  const applied = [];
  const manual = [];
  const draft = {name:'厂房.png', width:200, height:100, anchorA:{u:20,v:30}, anchorB:{u:20,v:30}};
  const ui = UI.mount(container, {onApply:value=>applied.push(value), onAnchor:(...args)=>manual.push(args)});
  ui.render({draft, authorized:false});
  assert.equal(control('apply').disabled, true);
  assert.equal(control('choose').hidden, true);
  control('distance').value = '5';
  control('form').emit('submit');
  assert.equal(applied.length, 0);
  ui.render({draft, authorized:true});
  control('form').emit('submit');
  assert.match(control('error').textContent, /不同位置/);
  control('b-u').value = '250';
  control('form').emit('submit');
  assert.match(control('error').textContent, /底图内/);
  assert.equal(applied.length, 0);
  control('b-u').value = '120';
  control('b-u').emit('change');
  control('form').emit('submit');
  assert.deepEqual(manual, [['B',{u:120,v:30}]]);
  assert.deepEqual(applied[0].anchorB, {u:120,v:30});
});
