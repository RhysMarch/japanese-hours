// Links between the kanji list and the vocab list: which kanji a word uses, which words use a kanji,
// and how many of the kanji in your vocab you already know.

// Unique kanji in a string, in order (々 is a repeat mark, not a kanji to learn)
const kanjiIn = s => [...new Set((s || '').match(/[㐀-鿿]/g) || [])];

// Vocab words whose kanji form contains this character
const wordsUsing = (char, vocab) => vocab.filter(v => (v.word || '').includes(char));

// { total, known, next: [{ char, words }] } — `next` is unknown kanji, most-used first
function kanjiCoverage(vocab, kanjiList) {
  const known = new Set(kanjiList.flatMap(x => kanjiIn(x.k)));
  const uses = new Map();
  for (const v of vocab) for (const c of kanjiIn(v.word)) {
    if (!uses.has(c)) uses.set(c, []);
    uses.get(c).push(v);
  }
  const next = [...uses].filter(([c]) => !known.has(c))
    .map(([char, words]) => ({ char, words }))
    .sort((a, b) => b.words.length - a.words.length);
  return { total: uses.size, known: uses.size - next.length, next };
}

// Pages copy of another page's data — saves an API call; fine for read-only cross-links
const loadJson = file => fetch(file + '?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : []).catch(() => []);
