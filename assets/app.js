(function () {
  const S = window.SCHOOLS || [];
  const reviewUI = window.SchoolReviewUI;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const aided = S.filter(s => !s.dss);
  const dss = S.filter(s => s.dss);
  const sum = (a, f) => a.reduce((x, y) => x + (f(y) || 0), 0);
  const nf = n => (n == null ? '—' : n.toLocaleString('en-HK'));
  const platformLabels = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', xiaohongshu: '小紅書' };
  const roleLabels = { school: '學校官方', department: '校方部門', alumni: '校友會', student: '學生組織', uncertain: '來源未核實' };
  const accountMeta = (s, url) => (s.socialMeta || {})[url] || { ownership: s.alumniOnly ? 'alumni' : 'uncertain', verified: false };
  const officialAccount = (s, url) => {
    const meta = accountMeta(s, url);
    return meta.verified && ['school', 'department'].includes(meta.ownership);
  };

  /* ---------- KPI ---------- */
  const withSocial = S.filter(s => s.channels > 0).length;
  const kpis = [
    { n: S.length, l: '西貢區中學（官立／資助／直資）' },
    { n: nf(sum(aided, s => s.s1total)), l: '官津中一學額（2026/27 公布）' },
    { n: dss.length, l: '直資學校（自訂收生）' },
    { n: withSocial, l: '已核實至少一個官方平台' },
    { n: S.length - withSocial, l: '尚未核實官方社交帳號' }
  ];
  $('#kpis').innerHTML = kpis.map(k => `<div class="kpi"><div class="n">${k.n}</div><div class="l">${k.l}</div></div>`).join('');

  /* ---------- chart: S1 places ---------- */
  const maxS1 = Math.max(...aided.map(s => s.s1total || 0));
  $('#chart-s1').innerHTML = aided
    .slice()
    .sort((a, b) => (b.s1total || 0) - (a.s1total || 0))
    .map(s => `<div class="hbar" title="${esc(s.name)}：${s.s1total} 個學額（自行 ${s.s1dp}＋統一 ${s.s1central}）">
      <span class="nm">${esc(s.name)}</span>
      <span class="track"><i class="fill" style="width:${Math.round((s.s1total / maxS1) * 100)}%"></i></span>
      <span class="v">${s.s1total}</span>
    </div>`).join('');

  /* ---------- chart: social ---------- */
  const socialStats = [
    { k: 'facebook', label: 'Facebook' },
    { k: 'instagram', label: 'Instagram' },
    { k: 'youtube', label: 'YouTube' },
    { k: 'xiaohongshu', label: '小紅書' },
    { k: 'none', label: '尚未核實' }
  ].map(o => ({ ...o, n: o.k === 'none' ? S.filter(s => s.channels === 0).length : S.filter(s => (s.social[o.k] || []).some(url => officialAccount(s, url))).length }));
  const maxSoc = Math.max(...socialStats.map(o => o.n), 1);
  $('#chart-social').innerHTML = socialStats.map(o => `<div class="vbar">
      <span class="cnt">${o.n}</span>
      <span class="track"><i class="col" style="height:${Math.max(6, Math.round((o.n / maxSoc) * 100))}%;${o.k === 'none' ? 'background:linear-gradient(180deg,#e8b96a,#b45309)' : ''}"></i></span>
      <span class="cap">${o.label}</span>
    </div>`).join('');
  $('#dss-classes').textContent = sum(dss, s => s.s1Classes);
  $('#aided-places').textContent = nf(sum(aided, s => s.s1total));

  /* ---------- filters ---------- */
  const religions = [...new Set(S.map(s => s.religion))].filter(r => r && r !== '不適用');
  $('#f-religion').innerHTML += religions.map(r => `<option>${esc(r)}</option>`).join('');
  const strategies = [...new Set(S.map(s => s.strategy))];
  $('#f-strategy').innerHTML += strategies.map(r => `<option>${esc(r)}</option>`).join('');

  let state = { q: '', type: '', religion: '', strategy: '', social: false, sort: null, dir: 1 };

  const typeClass = t => (t === '官立' ? 'gov' : t === '直資' ? 'dss' : 'aided');
  const socIcon = (s) => {
    const map = { facebook: ['FB', 'Facebook'], instagram: ['IG', 'Instagram'], youtube: ['YT', 'YouTube'], xiaohongshu: ['紅', '小紅書'] };
    const items = Object.keys(s.social).filter(k => map[k] && s.social[k].length).map(k => {
      const url = s.social[k].find(u => officialAccount(s, u)) || s.social[k][0];
      const meta = accountMeta(s, url);
      const tip = map[k][1] + '（' + (roleLabels[meta.ownership] || '來源未核實') + '）' + (meta.label ? ' · ' + meta.label : '');
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}" aria-label="${esc(tip)}">${map[k][0]}</a>`;
    });
    return items.length ? `<div class="soc">${items.join('')}</div>` : `<span class="none">—</span>`;
  };
  const stackBar = (s) => {
    const ks = ['s1', 's2', 's3', 's4', 's5', 's6'];
    return `<div class="stack" title="中一至中六班數">${ks.map((k, i) => {
      const v = s.classes[k] || 0;
      return `<i class="${i === 0 ? 'first' : 'on'}" style="height:${Math.max(10, v / 5 * 100)}%"></i>`;
    }).join('')}</div>`;
  };

  function filtered() {
    let out = S.filter(s => {
      if (state.type && s.type !== state.type) return false;
      if (state.religion && s.religion !== state.religion) return false;
      if (state.strategy && s.strategy !== state.strategy) return false;
      if (state.social && s.channels === 0) return false;
      if (state.q) {
        const hay = [s.name, s.nameEn, s.religion, s.sponsor, s.type, s.strategy, s.tags.join(' '), s.blurb, s.motto, reviewUI ? reviewUI.searchText(s.id) : ''].join(' ').toLowerCase();
        if (!hay.includes(state.q.toLowerCase())) return false;
      }
      return true;
    });
    if (state.sort) {
      const k = state.sort;
      out.sort((a, b) => {
        let x = a[k], y = b[k];
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * state.dir;
        return String(x).localeCompare(String(y), 'zh-Hant') * state.dir;
      });
    }
    return out;
  }

  function renderTable() {
    const rows = filtered();
    $('#count').textContent = `顯示 ${rows.length} / ${S.length} 間`;
    $('#tbody').innerHTML = rows.map(s => `<tr>
      <td><span class="sch" data-id="${s.id}">${esc(s.name)}<small>${esc(s.nameEn)}</small></span></td>
      <td>${reviewUI ? reviewUI.bandingHTML(s.id) : '<span class="muted">參考資料暫未載入</span>'}</td>
      <td><span class="pill ${typeClass(s.type)}">${esc(s.type)}</span></td>
      <td>${esc(s.religion)}</td>
      <td class="num">${s.s1Classes}</td>
      <td class="num">${s.dss ? '<span class="muted">自訂收生</span>' : nf(s.s1total)}</td>
      <td class="num">${s.totalClasses}</td>
      <td>${stackBar(s)}</td>
      <td>${socIcon(s)}</td>
      <td><span class="pill">${esc(s.strategy)}</span></td>
    </tr>`).join('') || `<tr><td colspan="10" style="padding:28px;text-align:center;color:#8a97a8">沒有符合條件的學校</td></tr>`;
  }

  function renderCards() {
    const rows = filtered();
    $('#cards-grid').innerHTML = rows.map(s => `<article class="card" data-id="${s.id}">
      <div class="top">
        <h4>${esc(s.name)}<small>${esc(s.nameEn)}</small></h4>
        <span class="pill ${typeClass(s.type)}">${esc(s.type)}</span>
      </div>
      <div class="meta">
        <span class="pill">${esc(s.religion)}</span>
        <span class="pill">${esc(s.gender)}</span>
        <span class="pill">${esc(s.founded)} 年創校</span>
      </div>
      <p>${esc(s.blurb)}</p>
      ${reviewUI ? reviewUI.bandingHTML(s.id) + reviewUI.cardHTML(s.id) : ''}
      <div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="kv">
        <div>中一學額<b>${s.dss ? '自訂' : nf(s.s1total)}</b></div>
        <div>中一班數<b>${s.s1Classes}</b></div>
        <div>六級總班<b>${s.totalClasses}</b></div>
      </div>
      <div class="foot">
        ${socIcon(s)}
        <button class="btn" data-open="${s.id}">詳細資料</button>
      </div>
    </article>`).join('');
  }

  function render() { renderTable(); renderCards(); }

  /* ---------- modal ---------- */
  function openModal(id) {
    const s = S.find(x => x.id === id);
    if (!s) return;
    $('#m-title').textContent = s.name;
    $('#m-sub').textContent = `${s.nameEn} ｜ ${s.type} ｜ ${s.gender} ｜ ${s.religion} ｜ ${s.founded} 年創校`;
    const socLinks = Object.entries(s.social).map(([k, v]) => {
      const label = platformLabels[k] || k;
      return v.map(u => {
        const meta = accountMeta(s, u);
        const role = roleLabels[meta.ownership] || '來源未核實';
        return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(meta.label || role)}">${label}（${esc(role)}）${meta.label ? ' · ' + esc(meta.label) : ''}</a>`;
      }).join('');
    }).join('');
    const sources = [...new Set(Object.values(s.socialMeta || {}).filter(m => m.evidenceUrl).map(m => m.evidenceUrl))];
    const auditSources = sources.map((url, i) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">查證來源 ${i + 1}</a>`).join('');
    $('#m-body').innerHTML = `
      <div class="grid2">
        <div><span>辦學團體</span><b>${esc(s.sponsor)}</b></div>
        <div><span>校訓</span><b>${esc(s.motto || '—')}</b></div>
        <div><span>地址</span><b>${esc(s.address)}</b></div>
        <div><span>電話</span><b>${esc(s.phone)}</b></div>
        <div><span>中一自行分配學位</span><b>${s.dss ? '不適用（自訂收生）' : nf(s.s1dp)}</b></div>
        <div><span>統一派位學額</span><b>${s.dss ? '不適用' : nf(s.s1central)}</b></div>
        <div><span>中一學額合計</span><b>${s.dss ? '未統一公布' : nf(s.s1total)}</b></div>
        <div><span>班數（中一至中六）</span><b>${['s1','s2','s3','s4','s5','s6'].map(k => s.classes[k] || 0).join(' / ')}（共 ${s.totalClasses} 班）</b></div>
      </div>
      ${reviewUI ? reviewUI.summaryHTML(s.id) : '<p class="review-note">學校文件資料暫未載入，請稍後重新整理。</p>'}
      <h5>定位摘要</h5><p>${esc(s.blurb)}</p>
      <h5>辦學宗旨</h5><p>${esc(s.mission || '—')}</p>
      ${s.focus ? `<h5>學校關注事項</h5><p>${esc(s.focus)}</p>` : ''}
      <h5>全校語文政策</h5><p>${esc(s.medium || '—')}</p>
      <h5>中一收生準則</h5><p>${esc(s.criteria || '—')}</p>
      ${s.ecurricular ? `<h5>全方位學習</h5><p>${esc(s.ecurricular)}</p>` : ''}
      <h5>宣傳觀察</h5><p>${esc(s.promo)}</p>
      <h5>連結</h5>
      <div class="links">
        <a href="${esc(s.website)}" target="_blank" rel="noopener">學校官網</a>
        <a href="${esc(s.chsc)}" target="_blank" rel="noopener">中學概覽頁面</a>
        ${socLinks}
      </div>
      <h5>社交帳號查證</h5>
      <p>補查日期：${esc(s.socialReviewed || '尚未補查')}。平台數只計已核實的學校／校方部門帳號；校友會、學生組織及未核實的原有連結另行標示。未核實不代表帳號不存在。</p>
      <div class="links">${auditSources || '<span class="muted">尚無可核實的帳號來源。</span>'}</div>`;
    $('#modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() { $('#modal').classList.remove('open'); document.body.style.overflow = ''; }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-open]');
    if (t) { openModal(t.dataset.open); return; }
    const n = e.target.closest('.sch');
    if (n) { openModal(n.dataset.id); return; }
    const card = e.target.closest('.card');
    if (card && !e.target.closest('a')) { openModal(card.dataset.id); return; }
    if (e.target.id === 'modal' || e.target.id === 'm-close') closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ---------- events ---------- */
  $('#q').addEventListener('input', e => { state.q = e.target.value.trim(); render(); });
  $('#f-type').addEventListener('change', e => { state.type = e.target.value; render(); });
  $('#f-religion').addEventListener('change', e => { state.religion = e.target.value; render(); });
  $('#f-strategy').addEventListener('change', e => { state.strategy = e.target.value; render(); });
  $('#f-social').addEventListener('click', e => {
    state.social = !state.social;
    e.currentTarget.setAttribute('aria-pressed', String(state.social));
    render();
  });
  document.querySelectorAll('thead th[data-k]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.sort === k) state.dir *= -1; else { state.sort = k; state.dir = 1; }
    render();
  }));

  /* ---------- analysis numbers ---------- */
  const cnt = n => S.filter(s => s.s1Classes === n).length;
  const tko = S.filter(s => /將軍澳|調景嶺|坑口/.test(s.address)).length;
  const setTxt = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
  setTxt('a1', `${tko} 間學校集中於將軍澳、調景嶺及坑口一帶，形成一個高度密集的「校網內市場」；西貢市中心只有 2 間（西貢崇真、鄭植之），後者更位於清水灣道與西貢公路交界。`);
  setTxt('a1a', nf(sum(aided, s => s.s1total)));
  setTxt('a1b', Math.round(sum(aided, s => s.s1total) / aided.length));
  setTxt('a1c', sum(dss, s => s.s1Classes));
  setTxt('a2', `中一開 4 班是標準配置（${cnt(4)} 間），開 5 班的 ${cnt(5)} 間全部是直資學校；3 班及 2 班各有 ${cnt(3)} 間，多數位於將軍澳南及西貢。班數愈少，對外宣傳的邊際效益愈高。`);
  setTxt('a2a', cnt(4)); setTxt('a2b', cnt(3)); setTxt('a2c', cnt(2)); setTxt('a2d', cnt(5));
  setTxt('a3', '官津 19 校中，只有 3 間在《中學概覽》明確以英語為主要授課語言：迦密主恩、景嶺、將軍澳官立；其餘 16 間以母語授課，再以英語延展活動、英語小組教學或外籍教師補強。7 間直資學校則大多以英語授課（香島、匯知設中英雙軌）。');
  setTxt('a3a', 3);
  setTxt('a4', `${S.length} 間學校中，${withSocial} 間已核實至少一個學校／校方部門社交帳號。數字不含校友會、學生組織及未核實的原有連結；各平台覆蓋反映目前可核實的公開來源，不代表更新頻率或教學質素。`);
  setTxt('a4a', socialStats[0].n); setTxt('a4b', socialStats[1].n);
  setTxt('a4c', socialStats[2].n); setTxt('a4d', socialStats[3].n);
  const unresolved = S.filter(s => s.channels === 0);
  setTxt('a4-none', unresolved.length ? `${unresolved.length} 間學校尚未核實官方社交帳號：${unresolved.map(s => s.name).join('、')}。搜尋或讀取受限不等於帳號不存在；可先參考官網並留意後續公布。` : '本次補查已為全部學校核實至少一個官方社交帳號；其他平台仍可能尚未核實。');
  setTxt('a4-xhs', `目前為 ${socialStats[3].n} 間學校核實小紅書帳號；公開來源可能不完整，未列出不等於未使用。`);

  if (reviewUI) {
    const coverage = reviewUI.coverageStats();
    setTxt('reviews-banding-count', `${coverage.banding} / ${S.length}`);
    setTxt('reviews-plan-count', `${coverage.plans} / ${S.length}`);
    setTxt('reviews-esr-count', `${coverage.externalReviews} / ${S.length}`);
    setTxt('reviews-coverage-note', `另有 ${coverage.overviewPlans} 間只取得官方關注事項參考，並非三年計劃全文；${coverage.conflictingBanding} 間的Banding來源有分歧，詳情保留各來源表述。未取得文件不代表學校未有發展計劃或從未接受外評。`);
    setTxt('reviews-date', window.SCHOOL_REVIEWS && window.SCHOOL_REVIEWS.reviewedAt || '尚未載入');
  }

  render();
})();
