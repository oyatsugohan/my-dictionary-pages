const stopWords = new Set('って では には とは ので など そして また しかし の は が を に へ と で も や から まで より です ます ある いる する した こと もの ため それ これ その この なる れる られる ない た だ な て し い お ん a an the and or is are to of in for'.split(' '));
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });

export function analyzeTexts(texts: string[], excluded = '', vocabulary: string[] = []) {
  const dictionary = new Set(vocabulary.map(w => w.normalize('NFKC').toLowerCase().trim()).filter(Boolean));
  const pattern = [...dictionary].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const dictionaryPattern = pattern ? new RegExp(`(${pattern})`, 'gu') : null;
  const excludedWords = new Set(excluded.normalize('NFKC').toLowerCase().split(/[\s,、]+/));
  const counts = new Map<string, number>();
  const documents = texts.map(text => {
    const plain = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ');
    const normalized = plain.normalize('NFKC').toLowerCase();
    const chunks = dictionaryPattern ? normalized.split(dictionaryPattern) : [normalized];
    const words = chunks.flatMap(chunk => dictionary.has(chunk) ? [chunk] : Array.from(segmenter.segment(chunk))
      .filter(part => part.isWordLike).map(part => part.segment))
      .filter(word => !stopWords.has(word) && !excludedWords.has(word) && !/^\d+$/.test(word));
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    return new Set(words);
  });
  const words = Array.from(counts, ([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ja')).slice(0, 60);
  const networkWords = words.slice(0, 20).map(w => w.text).sort();
  const edges: { source: string; target: string; count: number }[] = [];
  for (let i = 0; i < networkWords.length; i++) {
    for (let j = i + 1; j < networkWords.length; j++) {
      const source = networkWords[i], target = networkWords[j];
      const count = documents.filter(doc => doc.has(source) && doc.has(target)).length;
      if (count) edges.push({ source, target, count });
    }
  }
  return { words, edges: edges.sort((a, b) => b.count - a.count).slice(0, 50) };
}

export function japanDate(value: string) {
  const date = new Date(/^[\d-]+ [\d:]+$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
