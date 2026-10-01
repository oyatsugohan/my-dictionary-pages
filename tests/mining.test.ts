import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTexts, japanDate } from '../src/mining.ts';
test('counts word frequency and document co-occurrence separately', () => {
  const result = analyzeTexts(['apple apple banana', 'apple carrot']);
  assert.equal(result.words.find(w => w.text === 'apple')?.count, 3);
  assert.deepEqual(result.edges.find(e => e.source === 'apple' && e.target === 'banana'), { source: 'apple', target: 'banana', count: 1 });
  assert.ok(!result.edges.some(e => e.source === e.target));
});
test('Japanese text is segmented and markers, links, stop words and excluded words do not pollute results', () => {
  const result = analyzeTexts(['<yellow>数学</yellow>の数学。**素数**と[数学](https://example.test/path)'], '素数');
  assert.equal(result.words.find(w => w.text === '数学')?.count, 3);
  assert.ok(!result.words.some(w => ['yellow', 'の', 'と', '素数', 'https', 'example'].includes(w.text)));
});
test('date filters use Japan midnight, including SQLite UTC timestamps', () => {
  assert.equal(japanDate('2026-09-30T14:59:59Z'), '2026-09-30');
  assert.equal(japanDate('2026-09-30T15:00:00Z'), '2026-10-01');
  assert.equal(japanDate('2026-09-30 15:00:00'), '2026-10-01');
  assert.equal(japanDate('invalid'), '');
});
test('empty input and excluded-only documents yield no words or edges', () => {
  assert.deepEqual(analyzeTexts([]), { words: [], edges: [] });
  assert.deepEqual(analyzeTexts(['apple apple'], 'apple'), { words: [], edges: [] });
});
test('a pair counts once per document regardless of word repetitions', () => {
  const result = analyzeTexts(['apple apple banana banana', 'apple banana', 'banana']);
  assert.deepEqual(result.edges, [{ source: 'apple', target: 'banana', count: 2 }]);
});
test('tags preserve domain phrases in text without adding tag-only words', () => {
  const result = analyzeTexts(['素因数分解は整数の分解です。素因数分解を学ぶ。'], '', ['素因数分解', '数学１']);
  assert.equal(result.words.find(w => w.text === '素因数分解')?.count, 2);
  assert.ok(!result.words.some(w => w.text === '数学1'));
});
