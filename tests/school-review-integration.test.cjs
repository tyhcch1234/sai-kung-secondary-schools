'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function render(withUI = true) {
  const elements = new Map(), events = new Map();
  const get = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, { innerHTML: '', textContent: '', value: '', dataset: {}, events: new Map(),
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        addEventListener: function (name, fn) { this.events.set(name, fn); },
        setAttribute: function (name, value) { this[name] = value; } });
    }
    return elements.get(selector);
  };
  const document = { body: { style: {} }, querySelector: get, querySelectorAll: () => [],
    addEventListener: (name, fn) => events.set(name, fn) };
  const context = vm.createContext({ window: {}, document, URL });
  vm.runInContext(read('assets/data.js'), context);
  const first = context.window.SCHOOLS[0];
  // Clearly synthetic in-memory research; never exported as real school facts.
  const doc = { status: 'verified_full', title: '整合測試合成計劃', period: '2000–2003（合成）', reportDate: '2000-09',
    url: 'https://example.invalid/synthetic.pdf', publisher: '合成發布者', scope: '合成測試',
    summary: [{ text: '整合測試唯一合成關鍵字', sourceUrl: 'https://example.invalid/synthetic.pdf', pages: '合成第1頁' }],
    recommendations: [], latestBasis: '合成測試版本依據', notes: '此資料僅測試', sources: [] };
  context.window.SCHOOL_REVIEWS = { reviewedAt: '2026-11-09', items: [{ schoolId: first.id, schoolName: first.name,
    reviewedAt: '2026-11-09', banding: { status: 'reference', label: 'Band SYNTHETIC', notes: '合成參考',
      estimates: [{ label: 'Band SYNTHETIC', sourceTitle: '合成來源', sourceYear: '2000', sourceUrl: 'https://example.invalid/band', evidence: '合成' }] },
    developmentPlan: doc, externalReview: { ...doc, status: 'verified_excerpt' } }] };
  if (withUI) vm.runInContext(read('assets/school-review-ui.js'), context);
  vm.runInContext(read('assets/app.js'), context);
  return { get, events, first, context };
}

test('all original schools render in ten-column table and cards', () => {
  const app = render();
  const table = app.get('#tbody').innerHTML;
  assert.equal((table.match(/<tr>/g) || []).length, 26);
  assert.equal((table.match(/<td(?:\s|>)/g) || []).length, 260);
  assert.equal((app.get('#cards-grid').innerHTML.match(/<article/g) || []).length, 26);
  assert.match(table, /Band SYNTHETIC（非官方坊間參考）/);
  assert.match(app.get('#cards-grid').innerHTML, /三年發展計劃/);
  assert.equal(app.get('#reviews-plan-count').textContent, '1 / 26');
  assert.equal(app.get('#reviews-esr-count').textContent, '1 / 26');
});

test('new summary search finds the correct school and empty state spans ten cells', () => {
  const app = render();
  app.get('#q').events.get('input')({ target: { value: '整合測試唯一合成關鍵字' } });
  assert.equal(app.get('#count').textContent, '顯示 1 / 26 間');
  assert.ok(app.get('#tbody').innerHTML.includes(app.first.name));
  app.get('#q').events.get('input')({ target: { value: '完全不存在的整合測試字詞' } });
  assert.equal(app.get('#count').textContent, '顯示 0 / 26 間');
  assert.match(app.get('#tbody').innerHTML, /colspan="10"/);
});

test('actual detail event shows all three review sections and original school links', () => {
  const app = render();
  app.events.get('click')({ target: { closest: selector => selector === '[data-open]' ? { dataset: { open: app.first.id } } : null } });
  const html = app.get('#m-body').innerHTML;
  for (const title of ['Banding（坊間參考）', '三年發展計劃摘要', '校外評核（外評）摘要']) assert.ok(html.includes(title));
  assert.match(html, /整合測試唯一合成關鍵字/);
  assert.match(html, /href="https:\/\/example.invalid\/synthetic.pdf"/);
  assert.ok(html.includes(app.first.website));
  assert.ok(app.get('#modal').classList.contains('open'));
  app.events.get('keydown')({ key: 'Escape' });
  assert.ok(!app.get('#modal').classList.contains('open'));
});

test('missing review script does not break existing admissions or social directory', () => {
  const app = render(false);
  assert.equal(app.get('#count').textContent, '顯示 26 / 26 間');
  assert.equal(app.get('#aided-places').textContent, '1,991');
  assert.match(app.get('#tbody').innerHTML, /參考資料暫未載入/);
});

test('HTML loads data and renderer before app and declares versioned assets', () => {
  const html = read('index.html');
  const names = ['assets/data.js?v=20261109-social', 'assets/school-reviews.js?v=20261109-reviews',
    'assets/school-review-ui.js?v=20261109-reviews', 'assets/app.js?v=20261109-reviews'];
  const positions = names.map(name => html.indexOf(name));
  assert.ok(positions.every(pos => pos >= 0));
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions);
  assert.ok(html.includes('data/school-reviews.json'));
  assert.ok(html.includes('data/school-reviews.csv'));
  assert.ok(html.includes('assets/style.css?v=20261109-reviews'));
});
