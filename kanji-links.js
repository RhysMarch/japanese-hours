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

// Search: does the query appear in any of the fields? Romaji queries ("kusuri", "tabe") are also
// tried as hiragana and katakana, so you can search readings without a Japanese keyboard.
const VOWEL_OF = { あ: 'あかさたなはまやらわがざだばぱぁゃ', い: 'いきしちにひみりぎじぢびぴぃ', う: 'うくすつぬふむゆるぐずづぶぷぅゅ', え: 'えけせてねへめれげぜでべぺぇ', お: 'おこそとのほもよろをごぞどぼぽぉょ' };
// Katakana → hiragana, and a long-vowel mark spelled out: カード → かあど
function kanaKey(s) {
  const hira = s.replace(/[()（）\s]/g, '')   // た(べる) → たべる
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return hira.replace(/(.)ー/g, (m, c) => c + (Object.keys(VOWEL_OF).find(v => VOWEL_OF[v].includes(c)) || 'ー'));
}

function matchesQuery(query, fields) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  // romaji query → hiragana; "-" means a long vowel ("ka-do" = "kaado")
  const romaji = q.replace(/([aiueo])-/g, '$1$1');
  const fromRomaji = /^[a-zāīūēō' ]+$/.test(romaji) && typeof romajiToKana === 'function' ? romajiToKana(romaji) : '';
  const key = fromRomaji || (/[぀-ヿ]/.test(q) ? kanaKey(q) : '');
  return fields.some(f => {
    const s = (f || '').toLowerCase();
    return s.includes(q) || (key && kanaKey(s).includes(key));
  });
}

// Pages copy of another page's data — saves an API call; fine for read-only cross-links
const loadJson = file => fetch(file + '?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : []).catch(() => []);
