#!/usr/bin/env python3
"""Merge evidence-backed per-school research; never infer missing research."""
import argparse
import csv
import json
import re
from pathlib import Path
from urllib.parse import urldefrag, urlsplit

READ_STATUSES = {'verified_full', 'verified_excerpt', 'overview_only'}
ALL_STATUSES = READ_STATUSES | {'not_found', 'inaccessible'}
DOC_KEYS = ('status', 'title', 'period', 'reportDate', 'url', 'publisher', 'scope',
            'summary', 'recommendations', 'latestBasis', 'notes', 'sources')


def safe_url(value):
    if not isinstance(value, str) or not value:
        return False
    try:
        u = urlsplit(value)
        return u.scheme in {'http', 'https'} and bool(u.hostname) and not u.username and not u.password
    except ValueError:
        return False


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_document(doc, name, field):
    require(isinstance(doc, dict), f'{name}: {field} is not an object')
    require(set(DOC_KEYS).issubset(doc), f'{name}: {field} missing document fields')
    status = doc['status']
    require(status in ALL_STATUSES, f'{name}: invalid {field} status')
    require(isinstance(doc['summary'], list) and isinstance(doc['recommendations'], list),
            f'{name}: invalid {field} points')
    require(isinstance(doc['sources'], list), f'{name}: invalid {field} sources')
    for key in DOC_KEYS:
        if key not in {'summary', 'recommendations', 'sources'}:
            require(isinstance(doc[key], str), f'{name}: {field}.{key} must be text')
    if status not in READ_STATUSES:
        require(not doc['summary'] and not doc['recommendations'],
                f'{name}: unavailable {field} cannot contain a fabricated document summary')
    else:
        require(doc['summary'] and safe_url(doc['url']), f'{name}: read {field} needs text and original URL')
        require(doc['title'] and doc['scope'] and doc['latestBasis'],
                f'{name}: read {field} lacks title, scope or version basis')
        require(doc['sources'], f'{name}: read {field} lacks source evidence')
    allowed = {urldefrag(doc['url'])[0]} if safe_url(doc['url']) else set()
    for source in doc['sources']:
        require(isinstance(source, dict) and safe_url(source.get('url')), f'{name}: unsafe {field} source')
        for key in ('title', 'sourceDate', 'evidence'):
            require(isinstance(source.get(key), str) and source[key].strip(),
                    f'{name}: {field} source lacks {key}')
        allowed.add(urldefrag(source['url'])[0])
    for point in doc['summary'] + doc['recommendations']:
        require(isinstance(point, dict) and isinstance(point.get('text'), str) and point['text'].strip(),
                f'{name}: empty {field} point')
        require(safe_url(point.get('sourceUrl')), f'{name}: {field} point lacks a safe citation')
        require(urldefrag(point['sourceUrl'])[0] in allowed, f'{name}: {field} citation absent from evidence')
        require(isinstance(point.get('pages'), str) and point['pages'].strip(),
                f'{name}: {field} point lacks page/chapter reference')
    return {key: doc[key] for key in DOC_KEYS}


def public_row(row, expected):
    require(isinstance(row, dict), 'Research result is not an object')
    name = expected['name']
    require(row.get('schoolId') == expected['id'], f'{name}: wrong school ID')
    require(row.get('schoolName') == name, f'{name}: wrong school identity')
    require(row.get('reviewedAt') == '2026-11-09', f'{name}: wrong research snapshot date')
    band = row.get('banding')
    require(isinstance(band, dict) and band.get('status') in {'reference', 'conflicting', 'not_found'},
            f'{name}: invalid banding status')
    require(isinstance(band.get('label'), str) and isinstance(band.get('notes'), str),
            f'{name}: invalid banding description')
    require(isinstance(band.get('estimates'), list), f'{name}: invalid banding estimates')
    if band['status'] == 'not_found':
        require(not band['estimates'], f'{name}: unverified banding cannot contain trusted estimates')
    else:
        require(band['estimates'], f'{name}: banding reference lacks estimates')
    for estimate in band['estimates']:
        require(isinstance(estimate, dict) and safe_url(estimate.get('sourceUrl')), f'{name}: unsafe banding source')
        for key in ('label', 'sourceTitle', 'sourceYear', 'evidence'):
            require(isinstance(estimate.get(key), str) and estimate[key].strip(),
                    f'{name}: banding estimate lacks {key}')
    return {'schoolId': expected['id'], 'schoolName': name, 'reviewedAt': row['reviewedAt'],
            'banding': band, 'developmentPlan': check_document(row.get('developmentPlan'), name, 'developmentPlan'),
            'externalReview': check_document(row.get('externalReview'), name, 'externalReview')}


def csv_row(row):
    out = {'school_id': row['schoolId'], '學校名稱': row['schoolName'], '查核基準日': row['reviewedAt'],
           'Banding_非官方參考': row['banding']['label'], 'Banding狀態': row['banding']['status'],
           'Banding來源及年份': json.dumps(row['banding']['estimates'], ensure_ascii=False),
           'Banding說明': row['banding']['notes']}
    for key, prefix in [('developmentPlan', '發展計劃'), ('externalReview', '外評')]:
        doc = row[key]
        for source, label in [('status', '狀態'), ('title', '文件名'), ('period', '期間'), ('reportDate', '評核或文件日期'),
                              ('url', '原文網址'), ('publisher', '發布者'), ('scope', '範圍'), ('latestBasis', '版本依據'), ('notes', '限制')]:
            out[prefix + '_' + label] = doc[source]
        out[prefix + '_摘要與引用'] = json.dumps(doc['summary'], ensure_ascii=False)
        out[prefix + '_改善建議與引用'] = json.dumps(doc['recommendations'], ensure_ascii=False)
    # Neutralize spreadsheet formula injection without changing JSON evidence.
    return {k: ('\'' + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v) for k, v in out.items()}


def build(registry, results, output):
    schools = json.loads(registry.read_text(encoding='utf-8'))
    require(len(schools) == 26 and len({s['id'] for s in schools}) == 26, 'Expected the original 26-school registry')
    missing = [s['id'] for s in schools if not (results / (s['id'] + '.json')).is_file()]
    require(not missing, 'Research not complete; missing IDs: ' + ', '.join(missing))
    rows = [public_row(json.loads((results / (s['id'] + '.json')).read_text(encoding='utf-8')), s) for s in schools]
    dataset = {'reviewedAt': '2026-11-09', 'scope': '西貢區原有26間中學',
               'bandingNotice': '第三方坊間估計，非教育局對學校的官方評級；分歧逐項保留。',
               'documentNotice': '最新可讀公開版本，不保證未公开的新版本；外評只反映視學當時表現。',
               'policySources': ['https://www.schooland.hk/post/sspa02',
                                 'https://www.edb.gov.hk/tc/sch-admin/sch-quality-assurance/reports/esr-report/index.html'],
               'items': rows}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'data').mkdir(exist_ok=True)
    (output / 'assets').mkdir(exist_ok=True)
    text = json.dumps(dataset, ensure_ascii=False, indent=2) + '\n'
    (output / 'data/school-reviews.json').write_text(text, encoding='utf-8')
    # JSON as external JS: escape characters that could confuse older JS parsers.
    script = 'window.SCHOOL_REVIEWS = ' + text.strip().replace('\u2028', '\\u2028').replace('\u2029', '\\u2029') + ';\n'
    (output / 'assets/school-reviews.js').write_text(script, encoding='utf-8')
    exports = [csv_row(r) for r in rows]
    with (output / 'data/school-reviews.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(exports[0]))
        writer.writeheader()
        writer.writerows(exports)
    counts = {'schools': len(rows), 'banding': sum(r['banding']['status'] != 'not_found' for r in rows),
              'conflictingBanding': sum(r['banding']['status'] == 'conflicting' for r in rows)}
    for key in ('developmentPlan', 'externalReview'):
        counts[key] = {status: sum(r[key]['status'] == status for r in rows) for status in sorted(ALL_STATUSES)}
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=Path, required=True)
    parser.add_argument('--results-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.registry, args.results_dir, args.output), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
