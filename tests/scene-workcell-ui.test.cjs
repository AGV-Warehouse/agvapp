const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('../src/pages/maps/scene-builder/workcell-ui.js');

function fixture() {
  let form;
  function element() {
    const listeners = {};
    return {
      addEventListener(type, callback) { listeners[type] = callback; },
      emit(type, target) { listeners[type]({ target, preventDefault() {} }); },
      focus() {},
    };
  }
  const container = {
    set innerHTML(value) {
      this.html = value;
      const nodes = new Map();
      form = Object.assign(element(), {
        querySelector(selector) {
          if (!nodes.has(selector)) nodes.set(selector, element());
          return nodes.get(selector);
        },
        querySelectorAll() { return []; },
      });
    },
    replaceChildren() { form = undefined; this.html = ''; },
    querySelector(selector) {
      if (selector === '[data-workcell-form]') return form;
      return form?.querySelector(selector);
    },
  };
  const point = { id: 'p', x: 3, y: 4 };
  const station = { id: 's', name: '工位一', pointId: point.id, yaw: 0 };
  const scene = { navigation: { points: [point], stations: [station] } };
  let selection = { kind: 'station', id: station.id };
  const applied = [];
  const ui = mount(container, {
    getScene: () => scene,
    getSelection: () => selection,
    onChange(workcell) {
      applied.push(workcell);
      if (workcell) station.workcell = workcell;
      else delete station.workcell;
    },
  });
  return {
    container, ui, applied, station,
    select(next) { selection = next; ui.render(); },
    input(name, value) { form.emit('input', { name, value }); },
    change(name, value, checked) { form.emit('change', { name, value, checked }); },
    submit() { form.emit('submit'); },
    form: () => form,
  };
}

test('workcell edits survive rerender and only apply explicitly to the selected station', () => {
  const view = fixture();
  assert.match(view.container.html, /普通停车位/);
  view.change('templateId', 'lift-table-v1');
  view.input('width', '2.5');
  const form = view.form();
  view.ui.render();
  assert.equal(view.form(), form);
  assert.equal(view.ui.hasUnapplied(), true);
  assert.deepEqual(view.applied, []);
  view.submit();
  assert.equal(view.ui.hasUnapplied(), false);
  assert.deepEqual(view.station.workcell, {
    templateId: 'lift-table-v1',
    footprint: { x: 3, y: 4, yaw: 0, width: 2.5, depth: 1.6 },
    table: { clearHeight: 0.8, topThickness: 0.08, legWidth: 0.08 },
  });
  view.change('templateId', 'parking');
  view.submit();
  assert.equal(view.applied.at(-1), null);
  view.select({ kind: 'point', id: 'p' });
  assert.equal(view.form(), undefined);
});

test('invalid terminal fields keep the draft and discard restores the committed settings', () => {
  const view = fixture();
  view.change('templateId', 'buffer-v1');
  view.change('terminalEnabled', 'on', true);
  view.input('tagId', '50');
  view.input('buttonId', 'Button-1');
  view.submit();
  assert.deepEqual(view.applied, []);
  assert.match(view.form().querySelector('[data-workcell-error]').textContent, /Tag/);
  assert.equal(view.ui.hasUnapplied(), true);
  view.ui.discard();
  assert.equal(view.ui.hasUnapplied(), false);
  assert.doesNotMatch(view.container.html, /name="tagId"/);
});
