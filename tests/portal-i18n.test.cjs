const test = require('node:test');
const assert = require('node:assert/strict');
require('../portal-i18n-en.js');
const i18n = require('../portal-i18n.js');
const { missing } = require('../tools/i18n-check.cjs');

test('every Chinese UI string in the portal source has an English entry', () => {
  const rows = missing();
  assert.deepEqual(rows.map((r) => `${r.files.join(',')}: ${r.text}`), []);
});

test('exact strings translate and keep surrounding whitespace', () => {
  assert.equal(i18n.toEnglish('运行总览'), 'Overview');
  assert.equal(i18n.toEnglish('  搬运任务\n'), '  Transport tasks\n');
});

test('composed strings translate piece by piece and keep dynamic values', () => {
  assert.equal(i18n.toEnglish('前往 P-4'), 'Go to P-4');
  assert.equal(i18n.toEnglish('目的站与车辆报告起点相同，请选择其他目的站。'), "Destination equals the vehicle's reported start; choose another destination.");
  const mixed = i18n.toEnglish('LAB-01 · 等待通行');
  assert.equal(mixed, 'LAB-01 · Waiting for traffic');
});

test('wrapped HTML text matches its single-line dictionary key', () => {
  assert.equal(i18n.toEnglish('防碰撞净空、车辆外廓、转弯和实地\n          调试需单独检查。'), 'Collision clearance, vehicle outline, turning and on-site commissioning need separate checks.');
});

test('text without Chinese is left alone in English mode', () => {
  assert.equal(i18n.toEnglish('LAB-02'), 'LAB-02');
  assert.equal(i18n.toEnglish('0.05 m/s'), '0.05 m/s');
});

test('Chinese mode translates English leftovers but leaves ids and Chinese alone', () => {
  assert.equal(i18n.toChinese('Points'), '点位');
  assert.equal(i18n.toChinese('3 reported'), '3 台已报告');
  assert.equal(i18n.toChinese('LAB-01'), 'LAB-01');
  assert.equal(i18n.toChinese('运行总览'), '运行总览');
});
