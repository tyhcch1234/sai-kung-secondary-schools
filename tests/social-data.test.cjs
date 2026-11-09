const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function readData(source) {
  const context = { window: {} };
  vm.runInNewContext(source, context, { timeout: 2000 });
  return JSON.parse(JSON.stringify(context.window));
}
const current = readData(fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8'));
const original = readData(execFileSync('git', ['show', 'c686587:assets/data.js'], { cwd: root, encoding: 'utf8' }));
const audit = JSON.parse(fs.readFileSync(path.join(root, 'data/social-link-audit.json'), 'utf8'));
const official = (school, url) => school.socialMeta[url].verified && ['school', 'department'].includes(school.socialMeta[url].ownership);

function renderApp() {
  const elements = new Map();
  const documentEvents = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        innerHTML: '', textContent: '', value: '', dataset: {}, events: new Map(),
        classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
        addEventListener(name, callback) { this.events.set(name, callback); },
        setAttribute(name, value) { this[name] = value; }
      });
    }
    return elements.get(selector);
  }
  const headers = ['name', 'type', 'religion', 's1Classes', 's1total', 'totalClasses', 'channels', 'strategy'].map(key => {
    const el = element('header-' + key); el.dataset.k = key; return el;
  });
  const document = {
    body: { style: {} },
    querySelector: selector => element(selector),
    querySelectorAll: selector => selector === 'thead th[data-k]' ? headers : [],
    addEventListener: (name, callback) => documentEvents.set(name, callback)
  };
  const context = { window: JSON.parse(JSON.stringify(current)), document };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/app.js'), 'utf8'), context, { timeout: 3000 });
  return { element, documentEvents, document };
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

test('all 26 schools retain their original non-social information', () => {
  assert.equal(current.SCHOOLS.length, 26);
  const mutable = new Set(['social', 'channels', 'video', 'xhs', 'alumniOnly', 'promo', 'strategy']);
  for (const before of original.SCHOOLS) {
    const after = current.SCHOOLS.find(s => s.id === before.id);
    assert.ok(after, before.name);
    for (const key of Object.keys(before)) {
      if (!mutable.has(key)) assert.deepEqual(after[key], before[key], before.name + ': ' + key);
    }
  }
  assert.equal(current.META.generated, '2026-11-01');
  assert.equal(current.META.socialReviewed, '2026-11-09');
});

test('every school has four platform checks and account-level provenance', () => {
  const platforms = ['facebook', 'instagram', 'youtube', 'xiaohongshu'].sort();
  for (const school of current.SCHOOLS) {
    assert.equal(school.socialReviewed, '2026-11-09');
    assert.deepEqual(Object.keys(school.socialChecks).sort(), platforms);
    for (const urls of Object.values(school.social)) {
      assert.ok(urls.length > 0);
      assert.equal(new Set(urls).size, urls.length);
      for (const url of urls) {
        assert.match(url, /^https?:\/\//);
        const info = school.socialMeta[url];
        assert.ok(info, school.name + ': ' + url);
        if (info.verified) {
          assert.match(info.evidenceUrl, /^https?:\/\//);
          assert.ok(info.evidenceText.length > 0);
        }
      }
    }
  }
  assert.equal(audit.items.length, 26);
  assert.equal(new Set(audit.items.map(x => x.school_id)).size, 26);
});

test('official counts exclude alumni, students and unverified legacy links', () => {
  for (const school of current.SCHOOLS) {
    const count = Object.values(school.social).filter(urls => urls.some(url => official(school, url))).length;
    assert.equal(school.channels, count, school.name);
    assert.equal(school.xhs, (school.social.xiaohongshu || []).some(url => official(school, url)));
    const strategy = count >= 3 ? '多渠道影音型' : count === 2 ? '雙平台活動型' : count === 1 ? '單一平台型' : '未核實官方帳號';
    assert.equal(school.strategy, strategy);
  }
});

test('the original admissions totals and rendered directory still work', () => {
  assert.equal(current.SCHOOLS.filter(s => !s.dss).reduce((sum, s) => sum + s.s1total, 0), 1991);
  assert.equal(current.SCHOOLS.filter(s => s.dss).length, 7);
  const app = renderApp();
  assert.equal(app.element('#count').textContent, '顯示 26 / 26 間');
  assert.equal((app.element('#tbody').innerHTML.match(/<tr>/g) || []).length, 26);
  assert.equal((app.element('#cards-grid').innerHTML.match(/<article/g) || []).length, 26);
  assert.equal(app.element('#aided-places').textContent, '1,991');
});

test('search, school-type and official-social filters retain their behavior', () => {
  const app = renderApp();
  app.element('#q').events.get('input')({ target: { value: '不可能存在的測試校名' } });
  assert.equal(app.element('#count').textContent, '顯示 0 / 26 間');
  assert.match(app.element('#tbody').innerHTML, /沒有符合條件的學校/);
  app.element('#q').events.get('input')({ target: { value: '' } });
  app.element('#f-type').events.get('change')({ target: { value: '直資' } });
  assert.equal(app.element('#count').textContent, '顯示 7 / 26 間');
  app.element('#f-type').events.get('change')({ target: { value: '' } });
  const control = app.element('#f-social');
  control.events.get('click')({ currentTarget: control });
  const expected = current.SCHOOLS.filter(s => s.channels > 0).length;
  assert.equal(app.element('#count').textContent, `顯示 ${expected} / 26 間`);
  assert.equal(control['aria-pressed'], 'true');
});

test('every school detail displays all recorded links, ownership and evidence sources', () => {
  const app = renderApp();
  for (const school of current.SCHOOLS) {
    app.documentEvents.get('click')({ target: { closest: selector => selector === '[data-open]' ? { dataset: { open: school.id } } : null } });
    const html = app.element('#m-body').innerHTML;
    assert.equal(app.element('#m-title').textContent, school.name);
    assert.match(html, /2026-11-09/);
    for (const urls of Object.values(school.social)) {
      for (const url of urls) assert.ok(html.includes(`href="${esc(url)}"`), school.name + ': ' + url);
    }
    for (const meta of Object.values(school.socialMeta)) {
      if (meta.verified && meta.evidenceUrl) assert.ok(html.includes(`href="${esc(meta.evidenceUrl)}"`));
    }
    assert.ok(app.element('#modal').classList.contains('open'));
  }
  app.documentEvents.get('keydown')({ key: 'Escape' });
  assert.equal(app.element('#modal').classList.contains('open'), false);
});

test('page copy no longer mistakes unverified accounts for nonexistence', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!html.includes('<b>5</b> 間學校'));
  assert.ok(!html.includes('完全不做社交'));
  assert.ok(html.includes('data/social-link-audit.json'));
  assert.ok(html.includes('data.js?v=20261109-social'));
  for (const id of ['kpis', 'chart-s1', 'chart-social', 'q', 'f-type', 'f-religion', 'f-strategy', 'f-social', 'count', 'tbody', 'cards-grid', 'modal', 'm-title', 'm-sub', 'm-body', 'a4-none', 'a4-xhs']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});
