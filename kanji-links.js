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

// Romaji → hiragana, so search works in romaji ("kusuri", "eigyōchū"). Returns '' if it can't convert cleanly.
const KANA = {
  kya:'きゃ',kyu:'きゅ',kyo:'きょ',sha:'しゃ',shu:'しゅ',sho:'しょ',cha:'ちゃ',chu:'ちゅ',cho:'ちょ',nya:'にゃ',nyu:'にゅ',nyo:'にょ',
  hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',mya:'みゃ',myu:'みゅ',myo:'みょ',rya:'りゃ',ryu:'りゅ',ryo:'りょ',gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',
  ja:'じゃ',ju:'じゅ',jo:'じょ',bya:'びゃ',byu:'びゅ',byo:'びょ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',shi:'し',chi:'ち',tsu:'つ',
  ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',sa:'さ',su:'す',se:'せ',so:'そ',ta:'た',te:'て',to:'と',na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
  ha:'は',hi:'ひ',fu:'ふ',he:'へ',ho:'ほ',ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',ya:'や',yu:'ゆ',yo:'よ',ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
  wa:'わ',wo:'を',ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',za:'ざ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',da:'だ',de:'で',do:'ど',
  ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',a:'あ',i:'い',u:'う',e:'え',o:'お',
  // sounds used in katakana loanwords (カフェ, パーティー, シェア)
  fa:'ふぁ',fi:'ふぃ',fe:'ふぇ',fo:'ふぉ',ti:'てぃ',di:'でぃ',she:'しぇ',je:'じぇ',che:'ちぇ',wi:'うぃ',we:'うぇ',
};
function romajiToKana(romaji) {
  let s = romaji.toLowerCase().replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu').replace(/ē/g, 'ei').replace(/ō/g, 'ou').replace(/\s+/g, '');
  let out = '';
  while (s) {
    if (s[0] === s[1] && /[bcdfghjkmprstwz]/.test(s[0])) { out += 'っ'; s = s.slice(1); continue; }
    if (s[0] === 'n' && (s.length === 1 || !/[aiueoy]/.test(s[1]))) { out += 'ん'; s = s.slice(s[1] === "'" ? 2 : 1); continue; }
    const len = [3, 2, 1].find(n => KANA[s.slice(0, n)]);
    if (!len) return '';
    out += KANA[s.slice(0, len)]; s = s.slice(len);
  }
  return out;
}

function matchesQuery(query, fields) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  // romaji query → hiragana; "-" means a long vowel ("ka-do" = "kaado")
  const romaji = q.replace(/([aiueo])-/g, '$1$1');
  const fromRomaji = /^[a-zāīūēō' ]+$/.test(romaji) ? romajiToKana(romaji) : '';
  const key = fromRomaji || (/[぀-ヿ]/.test(q) ? kanaKey(q) : '');
  return fields.some(f => {
    const s = (f || '').toLowerCase();
    return s.includes(q) || (key && kanaKey(s).includes(key));
  });
}

// Pages copy of another page's data — saves an API call; fine for read-only cross-links
const loadJson = file => fetch(file + '?t=' + Date.now(), { cache: 'no-store' })
  .then(r => r.ok ? r.json() : []).catch(() => []);
