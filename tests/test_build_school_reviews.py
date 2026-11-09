import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder', ROOT / 'tools/build_school_reviews.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def doc(status='verified_full'):
    result = {'status': status, 'title': 'Synthetic test document', 'period': '2023–2026',
              'reportDate': '2023-09', 'url': 'https://example.org/fixture.pdf', 'publisher': 'Synthetic fixture',
              'scope': 'Synthetic secondary section', 'latestBasis': 'Synthetic document-list check',
              'notes': 'Test data only, not school research',
              'summary': [{'text': 'Synthetic point', 'sourceUrl': 'https://example.org/fixture.pdf', 'pages': '第1頁'}],
              'recommendations': [],
              'sources': [{'url': 'https://example.org/fixture.pdf', 'title': 'Synthetic document',
                           'sourceDate': '未註明', 'evidence': 'Synthetic supporting fact'}]}
    if status in {'not_found', 'inaccessible'}:
        result.update(url='', summary=[], sources=[])
    return result


def row(i='1', name='Synthetic school'):
    return {'schoolId': i, 'schoolName': name, 'reviewedAt': '2026-11-09',
            'resultPath': '/private/path/not-for-public.json', 'researchNotes': 'Internal research process not for public output',
            'banding': {'status': 'reference', 'label': 'Band 2B', 'notes': 'Synthetic unofficial fixture',
                        'estimates': [{'label': 'Band 2B', 'sourceUrl': 'https://example.org/estimate',
                                       'sourceTitle': 'Synthetic estimate', 'sourceYear': '未註明', 'evidence': 'Synthetic label'}]},
            'developmentPlan': doc(), 'externalReview': doc('verified_excerpt')}


class BuilderTests(unittest.TestCase):
    def test_normal_result_preserves_evidence_and_removes_private_paths(self):
        before = row()
        original = copy.deepcopy(before)
        out = builder.public_row(before, {'id': '1', 'name': 'Synthetic school'})
        self.assertEqual(before, original)
        self.assertNotIn('resultPath', out)
        self.assertNotIn('researchNotes', out)
        self.assertEqual(out['developmentPlan']['period'], '2023–2026')
        self.assertEqual(out['externalReview']['status'], 'verified_excerpt')

    def test_mismatched_school_identity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'identity'):
            builder.public_row(row(), {'id': '1', 'name': 'Another school'})

    def test_unavailable_document_cannot_have_a_summary(self):
        bad = doc('not_found')
        bad['summary'] = doc()['summary']
        with self.assertRaisesRegex(ValueError, 'fabricated'):
            builder.check_document(bad, 'Synthetic', 'externalReview')

    def test_read_document_requires_evidence_and_page_citation(self):
        for field in ('sources', 'summary'):
            bad = doc(); bad[field] = []
            with self.assertRaises(ValueError):
                builder.check_document(bad, 'Synthetic', 'developmentPlan')
        bad = doc(); bad['summary'][0]['pages'] = ''
        with self.assertRaisesRegex(ValueError, 'page/chapter'):
            builder.check_document(bad, 'Synthetic', 'developmentPlan')

    def test_point_citation_must_be_in_document_sources(self):
        bad = doc(); bad['summary'][0]['sourceUrl'] = 'https://example.org/unrelated'
        with self.assertRaisesRegex(ValueError, 'absent'):
            builder.check_document(bad, 'Synthetic', 'developmentPlan')

    def test_source_urls_fail_closed(self):
        for url in ('javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.org/file', '//example.org', ''):
            self.assertFalse(builder.safe_url(url), url)
        self.assertTrue(builder.safe_url('https://example.org/報告.pdf#page=2'))

    def test_missing_years_remain_explicit_not_fabricated(self):
        good = row(); good['developmentPlan']['period'] = '未註明'; good['externalReview']['reportDate'] = '未註明'
        out = builder.public_row(good, {'id': '1', 'name': 'Synthetic school'})
        self.assertEqual(out['developmentPlan']['period'], '未註明')
        self.assertEqual(out['externalReview']['reportDate'], '未註明')

    def test_incomplete_batch_does_not_write_publishable_outputs(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td); results = base / 'results'; results.mkdir()
            registry = base / 'registry.json'
            registry.write_text(json.dumps([{'id': str(i), 'name': 'Synthetic ' + str(i)} for i in range(26)]))
            output = base / 'output'
            with self.assertRaisesRegex(ValueError, 'missing IDs'):
                builder.build(registry, results, output)
            self.assertFalse(output.exists())

    def test_complete_batch_generates_three_synchronized_outputs(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td); results = base / 'results'; results.mkdir()
            schools = [{'id': str(i), 'name': 'Synthetic ' + str(i)} for i in range(26)]
            registry = base / 'registry.json'; registry.write_text(json.dumps(schools))
            for s in schools:
                (results / (s['id'] + '.json')).write_text(json.dumps(row(s['id'], s['name'])))
            output = base / 'output'; counts = builder.build(registry, results, output)
            self.assertEqual(counts['schools'], 26)
            self.assertEqual(counts['externalReview']['verified_excerpt'], 26)
            data = json.loads((output / 'data/school-reviews.json').read_text())
            script = (output / 'assets/school-reviews.js').read_text()
            self.assertEqual(json.loads(script.removeprefix('window.SCHOOL_REVIEWS = ').strip().removesuffix(';')), data)
            self.assertEqual(len(data['items']), 26)
            self.assertTrue((output / 'data/school-reviews.csv').read_bytes().startswith(b'\xef\xbb\xbf'))

    def test_csv_neutralizes_formula_injection_without_changing_json(self):
        value = row(); value['banding']['label'] = '=SUM(1,2)'
        out = builder.csv_row(value)
        self.assertEqual(out['Banding_非官方參考'], "'=SUM(1,2)")
        self.assertEqual(value['banding']['label'], '=SUM(1,2)')


if __name__ == '__main__':
    unittest.main()
