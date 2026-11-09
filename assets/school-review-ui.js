/* Standalone school review rendering. No network, event handlers, or storage. */
(function (root) {
  'use strict';

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function record(value) {
    return isRecord(value) ? value : {};
  }

  function text(value) {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function fieldText(value) {
    return Array.isArray(value) ? value.map(text).filter(Boolean).join('、') : text(value);
  }

  function escapeHTML(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function reviews() {
    return record(root.SCHOOL_REVIEWS);
  }

  function rows() {
    return list(reviews().items).filter(function (row) {
      return isRecord(row) && text(row.schoolId) !== '';
    });
  }

  function findRow(id) {
    var key = text(id);
    if (!key) return {};
    return rows().find(function (row) { return text(row.schoolId) === key; }) || {};
  }

  function safeURL(value) {
    var raw = text(value);
    if (!raw || typeof URL !== 'function') return '';
    try {
      var parsed = new URL(raw);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.username || parsed.password || !parsed.hostname) return '';
      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function sourceLink(url, label) {
    var href = safeURL(url);
    if (!href) return '<span class="review-note review-source-unavailable">' +
      escapeHTML(label || '來源') + '：連結不可用（未提供有效 HTTP(S) 網址）</span>';
    return '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHTML(label || '原始來源') + '</a>';
  }

  function estimates(banding) {
    return list(banding.estimates).filter(function (estimate) {
      return isRecord(estimate) && text(estimate.label) !== '';
    });
  }

  function bandingState(row) {
    var banding = record(row.banding);
    var entries = estimates(banding);
    var known = banding.status === 'reference' || banding.status === 'conflicting';
    var label = text(banding.label) || entries.map(function (entry) { return text(entry.label); }).join(' / ');
    if (!known || (!label && !entries.length)) {
      return { banding: banding, entries: entries, status: 'not_found', label: '未找到可靠坊間參考（非官方）' };
    }
    return {
      banding: banding,
      entries: entries,
      status: banding.status,
      label: label + (banding.status === 'conflicting' ? '（來源分歧・非官方坊間參考）' : '（非官方坊間參考）')
    };
  }

  function bandingLabel(id) {
    return bandingState(findRow(id)).label;
  }

  function bandingHTML(id) {
    var state = bandingState(findRow(id));
    return '<span class="review-status review-banding review-banding-' + state.status + '">' +
      escapeHTML(state.label) + '</span>';
  }

  function docStatus(doc) {
    var status = doc.status;
    return ['verified_full', 'verified_excerpt', 'overview_only', 'not_found', 'inaccessible'].indexOf(status) >= 0 ? status : 'not_found';
  }

  function statusLabel(doc, kind) {
    switch (docStatus(doc)) {
      case 'verified_full': return '最新可讀公開版本 · 已核實全文';
      case 'verified_excerpt': return kind === 'plan' ? '最新可讀公開版本 · 已核實正式節錄' : '最新可讀公開版本 · 已核實總結章節';
      case 'overview_only': return kind === 'plan' ? '僅校務概覽（非正式發展計劃摘要）' : '僅概覽資料（非正式外評報告摘要）';
      case 'inaccessible': return '已找到來源，但未能讀取';
      default: return '未找到可核實公開文件';
    }
  }

  function statusHTML(doc, kind) {
    return '<span class="review-status review-status-' + docStatus(doc) + '">' + escapeHTML(statusLabel(doc, kind)) + '</span>';
  }

  function compactDoc(value, kind) {
    var doc = record(value);
    var date = kind === 'plan' ? '計劃期間：' + (text(doc.period) || '未提供') : '外評日期：' + (text(doc.reportDate) || '未提供');
    return '<div class="review-doc-meta"><span>' + (kind === 'plan' ? '三年發展計劃' : '校外評核（外評）') +
      '</span> ' + statusHTML(doc, kind) + ' <span>' + escapeHTML(date) + '</span></div>';
  }

  function cardHTML(id) {
    var row = findRow(id);
    return '<div class="review-card-meta">' + compactDoc(row.developmentPlan, 'plan') +
      compactDoc(row.externalReview, 'external') + '</div>';
  }

  function detailDisclosure(title, value) {
    var content = fieldText(value);
    if (!content) return '';
    return '<details class="review-note"><summary>' + escapeHTML(title) + '</summary><p>' + escapeHTML(content) + '</p></details>';
  }

  function bandingSection(row) {
    var state = bandingState(row);
    var html = '<section class="review-block review-banding-block"><h3>Banding（坊間參考）</h3>' +
      '<p class="review-note">Banding 屬非官方坊間參考，並非教育局（EDB）的學校評級；不應視為官方能力組別或學校質素排名。</p>' +
      '<p><span class="review-status review-banding-' + state.status + '">' + escapeHTML(state.label) + '</span></p>';
    if (state.status !== 'not_found') {
      if (text(state.banding.label)) html += '<p>彙整標籤：' + escapeHTML(state.banding.label) + '</p>';
      if (state.status === 'conflicting') html += '<p class="review-note">來源分歧：以下保留各來源的原有標籤，不合併成單一確定 Band。</p>';
      if (state.entries.length) {
        html += '<ul class="review-points">' + state.entries.map(function (entry) {
          return '<li><strong>' + escapeHTML(entry.label) + '</strong> — ' + sourceLink(entry.sourceUrl, text(entry.sourceTitle) || '原始來源') +
            ' <span>來源年份：' + escapeHTML(text(entry.sourceYear) || '未提供') + '</span>' +
            (fieldText(entry.evidence) ? '<p class="review-note">來源依據：' + escapeHTML(fieldText(entry.evidence)) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
      } else {
        html += '<p class="review-note">未提供逐項估計及出處，無法核實此坊間標籤。</p>';
      }
    } else {
      html += '<p class="review-note">目前沒有可列出的可靠坊間 Banding 資料；未知不代表任何 Band。</p>';
    }
    html += detailDisclosure('Banding 查核備註', state.banding.notes);
    return html + '</section>';
  }

  function points(value) {
    return list(value).filter(function (point) { return isRecord(point) && text(point.text) !== ''; });
  }

  function pointsHTML(value) {
    return '<ul class="review-points">' + points(value).map(function (point) {
      var pages = fieldText(point.pages);
      return '<li><p>' + escapeHTML(point.text) + '</p><p class="review-note">' + sourceLink(point.sourceUrl, '原文出處') +
        ' <span>頁碼：' + escapeHTML(pages || '未提供') + '</span></p></li>';
    }).join('') + '</ul>';
  }

  function sourcesHTML(doc) {
    var sources = list(doc.sources).filter(isRecord);
    var html = '<div class="review-sources"><h4>原始來源</h4><p>' + sourceLink(doc.url, text(doc.title) || '文件原始連結') + '</p>';
    if (sources.length) {
      html += '<ul>' + sources.map(function (source) {
        return '<li>' + sourceLink(source.url, text(source.title) || '原始來源') +
          ' <span>來源日期：' + escapeHTML(text(source.sourceDate) || '未提供') + '</span>' +
          (fieldText(source.evidence) ? '<p class="review-note">來源依據：' + escapeHTML(fieldText(source.evidence)) + '</p>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    return html + '</div>';
  }

  function documentSection(value, kind, row) {
    var doc = record(value);
    var status = docStatus(doc);
    var verified = status === 'verified_full' || status === 'verified_excerpt';
    var heading = kind === 'plan' ? '三年發展計劃摘要' : '校外評核（外評）摘要';
    var checkedAt = text(row.reviewedAt) || text(reviews().reviewedAt) || '未提供核對日期';
    var html = '<section class="review-block review-document review-document-' + kind + '"><h3>' + heading + '</h3>' +
      '<div class="review-doc-meta"><p>' + statusHTML(doc, kind) + '</p><dl>' +
      '<dt>文件標題</dt><dd>' + escapeHTML(text(doc.title) || '未提供') + '</dd>' +
      '<dt>計劃／涵蓋期間</dt><dd>' + escapeHTML(text(doc.period) || '未提供') + '</dd>' +
      '<dt>報告日期</dt><dd>' + escapeHTML(text(doc.reportDate) || '未提供') + '</dd>' +
      '<dt>發布機構</dt><dd>' + escapeHTML(text(doc.publisher) || '未提供') + '</dd>' +
      '<dt>涵蓋範圍</dt><dd>' + escapeHTML(text(doc.scope) || '未提供') + '</dd></dl></div>';
    if (kind === 'external') {
      html += '<p class="review-note">外評內容只代表所評核期間的情況，不是學校現時質素評級，亦不作比較評分。</p>';
    }
    if (verified) {
      html += '<p class="review-note">以下依據最新可讀公開版本整理' + (status === 'verified_excerpt' ? (kind === 'plan' ? '，僅涵蓋已核實的正式節錄，並非全文摘要' : '，僅涵蓋已核實的總結章節，並非全文摘要') : '') + '。</p>';
      if (points(doc.summary).length) html += '<h4>文件重點</h4>' + pointsHTML(doc.summary);
      else html += '<p class="review-note">未提供可核實的摘要重點，請查閱原始文件；此處不補寫或推測內容。</p>';
      if (points(doc.recommendations).length) html += '<h4>文件所載建議</h4>' + pointsHTML(doc.recommendations);
    } else if (status === 'overview_only') {
      html += '<p class="review-note">只有概覽資料，' + (kind === 'plan' ? '並非正式三年發展計劃，以下不構成正式計劃摘要。' : '並非正式校外評核報告（ESR），以下不構成外評報告摘要。') + '</p>';
      if (points(doc.summary).length) html += '<h4>概覽資料重點（非正式文件摘要）</h4>' + pointsHTML(doc.summary);
      else html += '<p class="review-note">未提供可核實的概覽重點。</p>';
      if (points(doc.recommendations).length) html += '<h4>概覽資料所載建議（非正式報告建議）</h4>' + pointsHTML(doc.recommendations);
    } else {
      html += '<p class="review-note">' + (status === 'inaccessible' ? '原始文件目前未能讀取，無法核實或提供正式摘要。' : '本次查核未找到可核實的公開文件，沒有可提供的正式摘要；這不表示學校沒有相關文件。') + '</p>';
    }
    html += '<p class="review-note">資料核對日期：' + escapeHTML(checkedAt) +
      '。文件日期及涵蓋期間如未提供，不能據此判定新舊；較早日期的文件只反映當時資料。公開文件可能更新、撤下或未公開；「最新可讀公開版本」只指本次查核可讀的資料，不保證是歷來最新報告。</p>';
    html += detailDisclosure('版本選取依據（latestBasis）', doc.latestBasis) + detailDisclosure('文件查核備註', doc.notes);
    return html + sourcesHTML(doc) + '</section>';
  }

  function summaryHTML(id) {
    var row = findRow(id);
    return '<div class="review-summary">' + bandingSection(row) +
      documentSection(row.developmentPlan, 'plan', row) + documentSection(row.externalReview, 'external', row) +
      detailDisclosure('整體研究備註', row.researchNotes) + '</div>';
  }

  function docSearch(value) {
    var doc = record(value);
    var fields = ['status', 'title', 'period', 'reportDate', 'url', 'publisher', 'scope', 'latestBasis', 'notes'];
    var output = fields.map(function (key) { return fieldText(doc[key]); });
    ['summary', 'recommendations'].forEach(function (key) {
      points(doc[key]).forEach(function (point) {
        output.push(text(point.text), text(point.sourceUrl), fieldText(point.pages));
      });
    });
    list(doc.sources).filter(isRecord).forEach(function (source) {
      output.push(text(source.url), text(source.title), text(source.sourceDate), fieldText(source.evidence));
    });
    return output.join(' ');
  }

  function searchText(id) {
    var row = findRow(id);
    if (!text(row.schoolId)) return '';
    var banding = record(row.banding);
    var output = [text(row.schoolName), text(row.reviewedAt), text(banding.status), text(banding.label), fieldText(banding.notes), bandingState(row).label];
    list(banding.estimates).filter(isRecord).forEach(function (entry) {
      output.push(text(entry.label), text(entry.sourceUrl), text(entry.sourceTitle), text(entry.sourceYear), fieldText(entry.evidence));
    });
    output.push(docSearch(row.developmentPlan), docSearch(row.externalReview), fieldText(row.researchNotes));
    return output.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  function coverageStats() {
    var output = { total: 0, banding: 0, plans: 0, externalReviews: 0, overviewPlans: 0, conflictingBanding: 0 };
    rows().forEach(function (row) {
      output.total += 1;
      var banding = record(row.banding);
      if ((banding.status === 'reference' || banding.status === 'conflicting') && estimates(banding).length) {
        output.banding += 1;
        if (banding.status === 'conflicting') output.conflictingBanding += 1;
      }
      var plan = record(row.developmentPlan);
      var external = record(row.externalReview);
      if ((docStatus(plan) === 'verified_full' || docStatus(plan) === 'verified_excerpt') && points(plan.summary).length) output.plans += 1;
      if ((docStatus(external) === 'verified_full' || docStatus(external) === 'verified_excerpt') && points(external.summary).length) output.externalReviews += 1;
      if (docStatus(plan) === 'overview_only') output.overviewPlans += 1;
    });
    return output;
  }

  root.SchoolReviewUI = Object.freeze({
    bandingLabel: bandingLabel,
    bandingHTML: bandingHTML,
    cardHTML: cardHTML,
    summaryHTML: summaryHTML,
    searchText: searchText,
    coverageStats: coverageStats
  });
})(typeof window !== 'undefined' ? window : globalThis);
