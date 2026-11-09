'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '../assets/school-review-ui.js'), 'utf8');

// All names, dates, labels, documents, and claims below are synthetic test data.
// example.invalid is deliberately not a real source or a research claim.
function point(text = '合成摘要重點', pages = '3–4') {
  return { text, sourceUrl: 'https://example.invalid/synthetic-report.pdf', pages };
}

function documentFixture(status = 'verified_full', overrides = {}) {
  return {
    status,
    title: '合成文件標題（僅供測試）',
    period: '2001–2004（合成期間）',
    reportDate: '2002-01-02',
    url: 'https://example.invalid/synthetic-report.pdf?first=1&second=2',
    publisher: '合成發布機構',
    scope: '合成涵蓋範圍',
    summary: [point('合成重點甲'), point('合成重點乙', ['5', '6']), point('合成重點丙', 7)],
    recommendations: [point('合成建議：安排測試活動', '8')],
    latestBasis: '合成版本依據：本次可讀檔案，並非聲稱歷來最新',
    notes: '合成文件備註',
    sources: [{ url: 'https://example.invalid/synthetic-index', title: '合成原文索引', sourceDate: '2002', evidence: '合成索引依據' }],
    ...overrides
  };
}

function rowFixture(id = 'synthetic-one', overrides = {}) {
  return {
    schoolId: id,
    schoolName: '合成測試學校（不是真實學校）',
    reviewedAt: '2026-11-09',
    banding: {
      status: 'reference',
      label: 'Band SYN-A',
      estimates: [{ label: 'Band SYN-A', sourceUrl: 'https://example.invalid/synthetic-banding', sourceTitle: '合成坊間來源', sourceYear: '2024', evidence: '合成估計依據' }],
      notes: '合成 Banding 備註'
    },
    developmentPlan: documentFixture(),
    externalReview: documentFixture('verified_excerpt'),
    researchNotes: '合成整體研究備註',
    resultPath: 'nonexistent-synthetic-research.json',
    ...overrides
  };
}

function load(items, options = {}) {
  const window = {};
  if (items !== undefined) window.SCHOOL_REVIEWS = { reviewedAt: '2026-11-09', items };
  // Explicitly supply the native URL constructor; vm does not provide it itself.
  const context = vm.createContext({ window, URL: options.withoutURL ? undefined : URL });
  vm.runInContext(renderer, context, { filename: 'school-review-ui.js' });
  return { window, ui: window.SchoolReviewUI, context };
}

function escapeExpected(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function assertSafeAnchors(html) {
  const anchors = html.match(/<a\b[^>]*>/g) || [];
  assert.ok(anchors.length > 0);
  for (const anchor of anchors) {
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
    const match = anchor.match(/href="([^"]*)"/);
    assert.ok(match);
    const url = new URL(match[1].replace(/&amp;/g, '&'));
    assert.ok(['http:', 'https:'].includes(url.protocol));
    assert.equal(url.username, '');
    assert.equal(url.password, '');
  }
}

test('exports exactly the six requested methods', () => {
  const { ui } = load();
  assert.deepEqual(Object.keys(ui).sort(), ['bandingHTML', 'bandingLabel', 'cardHTML', 'coverageStats', 'searchText', 'summaryHTML'].sort());
  for (const method of Object.values(ui)) assert.equal(typeof method, 'function');
});

test('looks up string ids at call time before and after data loads or changes', () => {
  const { ui, window } = load();
  assert.match(ui.bandingLabel('synthetic-one'), /未找到/);
  window.SCHOOL_REVIEWS = { reviewedAt: '2026-11-09', items: [rowFixture()] };
  assert.match(ui.bandingLabel('synthetic-one'), /Band SYN-A/);
  window.SCHOOL_REVIEWS.items[0].banding.label = 'Band SYN-CHANGED';
  assert.match(ui.bandingLabel('synthetic-one'), /Band SYN-CHANGED/);
  window.SCHOOL_REVIEWS = { items: [rowFixture('replacement')] };
  assert.match(ui.bandingLabel('synthetic-one'), /未找到/);
  assert.match(ui.bandingLabel('replacement'), /Band SYN-A/);
  window.SCHOOL_REVIEWS.items.push(rowFixture(42));
  assert.match(ui.bandingLabel('42'), /Band SYN-A/);
});

test('unknown rows produce honest missing states and no undefined or null artifacts', () => {
  const { ui } = load([rowFixture()]);
  for (const id of ['absent', '', null, undefined, {}]) {
    assert.match(ui.bandingLabel(id), /未找到/);
    assert.doesNotMatch(ui.bandingHTML(id), /Band SYN/);
    assert.match(ui.cardHTML(id), /未找到可核實公開文件/);
    assert.match(ui.summaryHTML(id), /沒有可提供的正式摘要/);
    assert.doesNotMatch(ui.summaryHTML(id), /\b(?:undefined|null)\b/);
    assert.equal(ui.searchText(id), '');
  }
});

test('every known band pill visibly declares its nonofficial reference status', () => {
  const { ui } = load([rowFixture()]);
  assert.match(ui.bandingHTML('synthetic-one'), /Band SYN-A（非官方坊間參考）/);
  assert.match(ui.bandingLabel('synthetic-one'), /非官方/);
  assert.doesNotMatch(ui.bandingHTML('synthetic-one'), /<a\b|<button\b|<details\b/);
  assert.match(ui.summaryHTML('synthetic-one'), /並非教育局（EDB）的學校評級/);
});

test('conflicts say 來源分歧 and preserve each estimate, source, year, and evidence', () => {
  const banding = {
    status: 'conflicting', label: '合成彙整：SYN-A / SYN-B', notes: '合成分歧備註',
    estimates: [
      { label: 'Band SYN-A', sourceTitle: '合成來源甲', sourceYear: '2021', sourceUrl: 'https://example.invalid/a', evidence: '合成證據甲' },
      { label: 'Band SYN-B', sourceTitle: '合成來源乙', sourceYear: '2025', sourceUrl: 'https://example.invalid/b', evidence: '合成證據乙' }
    ]
  };
  const { ui } = load([rowFixture('conflict', { banding })]);
  assert.match(ui.bandingHTML('conflict'), /來源分歧・非官方坊間參考/);
  assert.ok(ui.bandingHTML('conflict').includes(banding.label));
  const html = ui.summaryHTML('conflict');
  for (const content of ['Band SYN-A', 'Band SYN-B', '合成來源甲', '合成來源乙', '2021', '2025', '合成證據甲', '合成證據乙', banding.label, banding.notes]) assert.ok(html.includes(content));
  assert.match(html, /不合併成單一確定 Band/);
});

test('not_found and unrecognized band states cannot masquerade as supplied band labels', () => {
  const { ui } = load([
    rowFixture('missing', { banding: { status: 'not_found', label: 'Band SYN-FORGED', estimates: [{ label: 'Band SYN-FORGED' }] } }),
    rowFixture('bad-status', { banding: { status: 'invented', label: 'Band SYN-FORGED' } }),
    rowFixture('blank', { banding: { status: 'reference', label: '', estimates: [] } })
  ]);
  for (const id of ['missing', 'bad-status', 'blank']) {
    assert.match(ui.bandingLabel(id), /未找到/);
    assert.doesNotMatch(ui.bandingHTML(id), /SYN-FORGED/);
    assert.doesNotMatch(ui.summaryHTML(id), /SYN-FORGED/);
  }
});

test('card metadata is compact and noninteractive, with statuses and periods only', () => {
  const { ui } = load([rowFixture()]);
  const html = ui.cardHTML('synthetic-one');
  assert.match(html, /class="review-card-meta"/);
  assert.match(html, /review-status/);
  assert.match(html, /2001–2004（合成期間）/);
  assert.match(html, /2002-01-02/);
  assert.doesNotMatch(html, /合成重點|合成建議|<a\b|<details\b|<button\b|<ul\b/);
});

test('full, excerpt, overview, missing, and inaccessible documents remain distinct', () => {
  const statuses = ['verified_full', 'verified_excerpt', 'overview_only', 'not_found', 'inaccessible'];
  const { ui } = load(statuses.map(status => rowFixture(status, { developmentPlan: documentFixture(status), externalReview: documentFixture(status) })));
  assert.match(ui.summaryHTML('verified_full'), /最新可讀公開版本 · 已核實全文/);
  assert.match(ui.summaryHTML('verified_excerpt'), /最新可讀公開版本 · 已核實正式節錄/);
  assert.match(ui.summaryHTML('verified_excerpt'), /最新可讀公開版本 · 已核實總結章節/);
  assert.match(ui.summaryHTML('verified_excerpt'), /僅涵蓋已核實的正式節錄，並非全文摘要/);
  assert.match(ui.summaryHTML('verified_excerpt'), /僅涵蓋已核實的總結章節，並非全文摘要/);
  assert.match(ui.summaryHTML('overview_only'), /僅校務概覽（非正式發展計劃摘要）/);
  assert.match(ui.summaryHTML('overview_only'), /並非正式校外評核報告（ESR）/);
  assert.match(ui.summaryHTML('not_found'), /未找到可核實公開文件/);
  assert.match(ui.summaryHTML('inaccessible'), /已找到來源，但未能讀取/);
  for (const status of statuses) assert.match(ui.cardHTML(status), new RegExp('review-status-' + status));
});

test('complete semantic sections show actual document metadata and original sources', () => {
  const { ui } = load([rowFixture()]);
  const html = ui.summaryHTML('synthetic-one');
  for (const heading of ['Banding（坊間參考）', '三年發展計劃摘要', '校外評核（外評）摘要']) assert.ok(html.includes('<h3>' + heading + '</h3>'));
  for (const content of ['合成文件標題（僅供測試）', '2001–2004（合成期間）', '2002-01-02', '合成發布機構', '合成涵蓋範圍', '合成原文索引', '合成索引依據']) assert.ok(html.includes(content));
  for (const css of ['review-block', 'review-doc-meta', 'review-points', 'review-note', 'review-sources', 'review-status']) assert.ok(html.includes(css));
  assert.match(html, /<dl>/);
  assert.match(html, /<details class="review-note"><summary>版本選取依據（latestBasis）<\/summary>/);
  assert.match(html, /合成版本依據/);
  assert.match(html, /合成文件備註/);
  assert.match(html, /合成整體研究備註/);
  assert.doesNotMatch(html, /href="nonexistent-synthetic-research/);
  assertSafeAnchors(html);
});

test('every supplied summary point and recommendation has its own citation and pages', () => {
  const summary = Array.from({ length: 5 }, (_, index) => ({ text: '合成獨立重點' + index, sourceUrl: 'https://example.invalid/point-' + index, pages: '合成頁' + index }));
  const recommendations = [{ text: '合成獨立建議', sourceUrl: 'http://example.invalid/recommendation', pages: ['附錄A', '附錄B'] }];
  const { ui } = load([rowFixture('points', { developmentPlan: documentFixture('verified_full', { summary, recommendations }), externalReview: null })]);
  const html = ui.summaryHTML('points');
  for (let index = 0; index < 5; index++) {
    const li = html.match(new RegExp('<li><p>合成獨立重點' + index + '</p>[\\s\\S]*?</li>'));
    assert.ok(li, 'actual supplied point ' + index + ' is retained');
    assert.ok(li[0].includes('href="https://example.invalid/point-' + index + '"'));
    assert.ok(li[0].includes('頁碼：合成頁' + index));
  }
  assert.match(html, /文件所載建議/);
  assert.match(html, /合成獨立建議/);
  assert.match(html, /href="http:\/\/example.invalid\/recommendation"/);
  assert.match(html, /頁碼：附錄A、附錄B/);
});

test('missing per-point source and pages are explicitly marked unavailable', () => {
  const { ui } = load([rowFixture('no-citation', { developmentPlan: documentFixture('verified_full', { summary: [{ text: '合成無出處重點' }], recommendations: [] }), externalReview: null })]);
  const html = ui.summaryHTML('no-citation');
  assert.match(html, /原文出處：連結不可用（未提供有效 HTTP\(S\) 網址）/);
  assert.match(html, /頁碼：未提供/);
});

test('old and missing dates are visible with a caveat on each document', () => {
  const { ui } = load([rowFixture('dates', { developmentPlan: documentFixture('verified_full', { period: '', reportDate: '' }), externalReview: documentFixture('verified_excerpt', { reportDate: '1999-01-01' }) })]);
  const html = ui.summaryHTML('dates');
  assert.match(html, /<dt>報告日期<\/dt><dd>未提供<\/dd>/);
  assert.match(html, /1999-01-01/);
  assert.equal((html.match(/資料核對日期：2026-11-09/g) || []).length, 2);
  assert.equal((html.match(/不保證是歷來最新報告/g) || []).length, 2);
  assert.equal((html.match(/較早日期的文件只反映當時資料/g) || []).length, 2);
  const missing = load([rowFixture('no-date', { reviewedAt: '', developmentPlan: null, externalReview: null })]);
  missing.window.SCHOOL_REVIEWS.reviewedAt = '';
  assert.equal((missing.ui.summaryHTML('no-date').match(/資料核對日期：未提供核對日期/g) || []).length, 2);
});

test('external reviews are expressly historical, not current ratings or comparison scores', () => {
  const { ui } = load([rowFixture()]);
  assert.match(ui.summaryHTML('synthetic-one'), /只代表所評核期間的情況，不是學校現時質素評級，亦不作比較評分/);
});

test('missing or inaccessible documents do not render supplied unverified summaries or recommendations', () => {
  const { ui } = load(['not_found', 'inaccessible'].map(status => rowFixture(status, {
    developmentPlan: documentFixture(status, { summary: [point('禁止顯示的合成未核實摘要')], recommendations: [point('禁止顯示的合成未核實建議')] }),
    externalReview: null
  })));
  for (const status of ['not_found', 'inaccessible']) assert.doesNotMatch(ui.summaryHTML(status), /禁止顯示/);
  const empty = load([rowFixture('empty-full', { developmentPlan: documentFixture('verified_full', { summary: [], recommendations: [] }) })]);
  assert.match(empty.ui.summaryHTML('empty-full'), /未提供可核實的摘要重點/);
});

test('overview-only content and recommendations are explicitly non-formal', () => {
  const { ui } = load([rowFixture('overview', { developmentPlan: documentFixture('overview_only'), externalReview: documentFixture('overview_only') })]);
  const html = ui.summaryHTML('overview');
  assert.match(html, /概覽資料重點（非正式文件摘要）/);
  assert.match(html, /概覽資料所載建議（非正式報告建議）/);
  assert.match(html, /合成重點甲/);
  assert.match(html, /合成建議：安排測試活動/);
  assert.doesNotMatch(html, /<h4>文件重點<\/h4>|<h4>文件所載建議<\/h4>/);
});

test('escapes all interpolated text in band labels, document metadata, notes, citations and sources', () => {
  const payload = '<img src=x onerror="synthetic()">&\'合成';
  const encoded = escapeExpected(payload);
  const maliciousDoc = documentFixture('verified_full', {
    title: payload, period: payload, reportDate: payload, publisher: payload, scope: payload,
    summary: [{ text: payload, sourceUrl: 'https://example.invalid/safe', pages: payload }],
    recommendations: [{ text: payload, sourceUrl: 'https://example.invalid/safe', pages: [payload] }],
    latestBasis: payload, notes: payload,
    sources: [{ title: payload, url: 'https://example.invalid/source', sourceDate: payload, evidence: payload }]
  });
  const { ui } = load([rowFixture('escape', {
    reviewedAt: payload, researchNotes: payload,
    banding: { status: 'reference', label: payload, estimates: [{ label: payload, sourceUrl: 'https://example.invalid/band', sourceTitle: payload, sourceYear: payload, evidence: payload }], notes: payload },
    developmentPlan: maliciousDoc, externalReview: maliciousDoc
  })]);
  for (const html of [ui.bandingHTML('escape'), ui.cardHTML('escape'), ui.summaryHTML('escape')]) {
    assert.ok(html.includes(encoded));
    assert.doesNotMatch(html, /<img\b|<script\b|onerror="synthetic\(\)"/);
    assert.doesNotMatch(html, /&'合成/);
  }
  // The same payload appears in each field; its count detects fields that were dropped or unescaped.
  assert.ok((ui.summaryHTML('escape').split(encoded).length - 1) >= 35);
  assertSafeAnchors(ui.summaryHTML('escape'));
});

test('blocks javascript, data, credentials, relative, malformed and other non-HTTP source URLs everywhere', () => {
  const unsafe = ['javascript:alert(1)', 'data:text/html,<script>synthetic()</script>', 'https://user:pass@example.invalid/private', 'http://user@example.invalid/private', 'https://:pass@example.invalid/private', '/relative.pdf', '//example.invalid/relative', 'not a URL', 'file:///etc/passwd', 'ftp://example.invalid/file', '', 'https://', null, {}];
  for (const url of unsafe) {
    const { ui } = load([rowFixture('unsafe', {
      banding: { status: 'reference', label: 'Band SYN-A', estimates: [{ label: 'Band SYN-A', sourceUrl: url }] },
      developmentPlan: documentFixture('verified_full', {
        url, summary: [{ text: '合成重點', sourceUrl: url }], recommendations: [{ text: '合成建議', sourceUrl: url }],
        sources: [{ title: '合成來源', url }]
      }),
      externalReview: null
    })]);
    const html = ui.summaryHTML('unsafe');
    assert.doesNotMatch(html, /<a\b/, 'unsafe URL must not create href: ' + String(url));
    assert.ok((html.match(/連結不可用/g) || []).length >= 5);
  }
});

test('safe HTTP(S) links are canonicalized and attribute-escaped with safe target and rel', () => {
  const { ui } = load([rowFixture('safe', { developmentPlan: documentFixture('verified_full', { url: 'HTTPS://EXAMPLE.INVALID/synthetic?a=1&b=2', summary: [point()], recommendations: [] }) })]);
  const html = ui.summaryHTML('safe');
  assert.match(html, /href="https:\/\/example.invalid\/synthetic\?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"/);
  assertSafeAnchors(html);
});

test('missing native URL support degrades gracefully and fails closed without any hrefs', () => {
  const { ui } = load([rowFixture()], { withoutURL: true });
  const html = ui.summaryHTML('synthetic-one');
  assert.match(html, /連結不可用/);
  assert.doesNotMatch(html, /<a\b|href=/);
});

test('coverage counts only usable estimates and verified documents with summary points', () => {
  const { ui } = load([
    rowFixture('verified'),
    rowFixture('conflicting', { banding: { status: 'conflicting', estimates: [{ label: 'Band SYN-B' }] }, developmentPlan: documentFixture('verified_excerpt'), externalReview: documentFixture('verified_full') }),
    rowFixture('overview', { banding: { status: 'reference', label: 'Band SYN-C', estimates: [] }, developmentPlan: documentFixture('overview_only'), externalReview: documentFixture('overview_only') }),
    rowFixture('empty', { banding: { status: 'conflicting', estimates: [] }, developmentPlan: documentFixture('verified_full', { summary: [] }), externalReview: documentFixture('verified_excerpt', { summary: [{ text: '' }, null] }) }),
    rowFixture('missing', { banding: { status: 'not_found', estimates: [{ label: 'ignored' }] }, developmentPlan: documentFixture('not_found'), externalReview: documentFixture('inaccessible') }),
    rowFixture('invalid', { banding: { status: 'reference', estimates: [null, 'bad', {}, { label: '' }] }, developmentPlan: null, externalReview: null }),
    null, {}, 'not a row'
  ]);
  assert.deepEqual({ ...ui.coverageStats() }, { total: 6, banding: 2, plans: 2, externalReviews: 2, overviewPlans: 1, conflictingBanding: 1 });
});

test('searchText contains plain searchable labels, estimates, document fields, summaries and recommendations', () => {
  const { ui } = load([rowFixture()]);
  const output = ui.searchText('synthetic-one');
  for (const content of ['Band SYN-A', '合成坊間來源', '2024', '合成估計依據', '合成文件標題', '2001–2004', '2002-01-02', '合成發布機構', '合成涵蓋範圍', '合成重點甲', '合成建議：安排測試活動', '合成版本依據', '合成文件備註', '合成原文索引', '合成索引依據', '合成整體研究備註', 'https://example.invalid/synthetic-report.pdf', '5、6']) assert.ok(output.includes(content), content);
  assert.doesNotMatch(output, /<section\b|<a\b|&amp;/);
  const literal = load([rowFixture('literal', { developmentPlan: documentFixture('verified_full', { summary: [point('合成文字 <純文字> & 測試')] }) })]);
  assert.ok(literal.ui.searchText('literal').includes('合成文字 <純文字> & 測試'));
});

test('null, missing, malformed and circular records never crash or synthesize null/undefined strings', () => {
  const { ui, window } = load();
  const malformedRow = {
    schoolId: 'malformed', schoolName: {}, reviewedAt: null, researchNotes: [{}, undefined, null],
    banding: { status: [], label: {}, estimates: [null, 4, {}, { label: undefined }], notes: {} },
    developmentPlan: { status: 'verified_full', title: {}, period: null, reportDate: undefined, publisher: [], scope: true, summary: [null, false, {}, { text: undefined }], recommendations: 'wrong type', notes: {}, sources: [null, 2, {}] },
    externalReview: { status: 'overview_only', summary: [undefined, [], { text: {} }], sources: 'wrong type' }
  };
  const circular = rowFixture('circular', { developmentPlan: null, externalReview: null });
  circular.researchNotes = [circular];
  for (const data of [undefined, null, [], false, 'bad', {}, { items: null }, { items: {} }, { items: [null, undefined, [], false, {}, malformedRow, circular] }]) {
    window.SCHOOL_REVIEWS = data;
    for (const id of ['malformed', 'circular', 'unknown']) {
      for (const method of ['bandingLabel', 'bandingHTML', 'cardHTML', 'summaryHTML', 'searchText']) {
        let output;
        assert.doesNotThrow(() => { output = ui[method](id); });
        assert.equal(typeof output, 'string');
        assert.doesNotMatch(output, /\b(?:undefined|null)\b|\[object Object\]/);
      }
    }
    assert.doesNotThrow(() => ui.coverageStats());
  }
});

test('renderer does not access storage, register handlers, or require network globals', () => {
  const { ui, window } = load([rowFixture()]);
  for (const key of ['localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'addEventListener']) {
    Object.defineProperty(window, key, { get() { throw new Error('Forbidden access: ' + key); } });
  }
  for (const method of ['bandingLabel', 'bandingHTML', 'cardHTML', 'summaryHTML', 'searchText']) assert.doesNotThrow(() => ui[method]('synthetic-one'));
  assert.doesNotThrow(() => ui.coverageStats());
  assert.doesNotMatch(ui.summaryHTML('synthetic-one'), /\son(?:click|load|error|submit|change)\s*=/i);
});
