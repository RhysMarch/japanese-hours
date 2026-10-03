// Parses an Anki "Notes in Plain Text" export (.txt, tab-separated, with #header lines)
// into vocab entries. Works in the browser and in Node (for one-off imports).
//
// Expected card style: front "漢字 · かな [emoji]" (or "— · かな" when there's no kanji),
// back = meaning first, then optional example sentence / translation lines.

const ANKI_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decodeEntities = s => s.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
  : ANKI_ENTITIES[e.toLowerCase()] ?? m);
// HTML → plain text lines
const htmlLines = html => decodeEntities(html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const stripEmoji = s => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '');
const hasJapanese = s => /[぀-ヿ㐀-鿿]/.test(s);

// Split TSV respecting Anki's quoting: a field wrapped in "..." may contain tabs/newlines, "" is a literal quote
function parseTsv(text) {
  const rows = []; let row = [], field = '', i = 0, quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === '\t') { row.push(field); field = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; i++; continue;
    }
    field += c; i++;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// "Japanese::6. Genki 1::1. Lesson 1" → "Genki 1 › Lesson 1"
const deckName = d => d.split('::').slice(1).map(p => p.replace(/^\d+\.\s*/, '')).join(' › ') || d;

// Rows of an export as { id, deck, fields } — fields are the note's own fields (front, back, …) as raw HTML
function parseAnkiNotes(text) {
  const header = {};
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let body = 0;
  while (body < lines.length && lines[body].startsWith('#')) {
    const [k, v] = lines[body].slice(1).split(':');
    header[k.trim()] = (v || '').trim();
    body++;
  }
  const col = name => header[name + ' column'] ? +header[name + ' column'] - 1 : -1;
  const meta = new Set(['guid', 'notetype', 'deck', 'tags'].map(col).filter(i => i >= 0));
  return parseTsv(lines.slice(body).join('\n'))
    .filter(r => r.some(f => f.trim()))
    .map(r => ({
      id: col('guid') >= 0 ? r[col('guid')] : null,
      deck: col('deck') >= 0 ? deckName(r[col('deck')]) : '',
      fields: r.filter((_, i) => !meta.has(i)),
    }));
}

// Vocab card style: front "漢字 · かな [emoji]", back = meaning then example / translation lines
function parseAnkiExport(text) {
  return parseAnkiNotes(text).map(({ id, deck, fields }) => {
    const front = stripEmoji(htmlLines(fields[0] || '').join(' '));
    // separator: "·" (middle dot), or " ・ " (the Japanese keyboard's dot, with spaces — katakana words can contain ・ themselves)
    const sep = front.match(/^(.*?)\s*(?:·|\s・\s)\s*(.*)$/);
    const [left, right] = sep ? [sep[1].trim(), sep[2].trim()] : ['', front.trim()];
    const word = left === '—' || left === '-' ? '' : left;
    const back = htmlLines(fields[1] || '').filter(l => !/^example:?$/i.test(l));
    const examples = [];
    for (const l of back.slice(1)) {
      if (hasJapanese(l)) examples.push({ jp: l, en: '' });
      else if (examples.length && !examples[examples.length - 1].en) examples[examples.length - 1].en = l;
    }
    return {
      id: id || word || right,
      word,
      kana: right || word,
      meaning: back[0] || '',
      examples,
      deck,
    };
  }).filter(v => v.kana || v.word);
}

// Romaji → hiragana, for readings typed in romaji ("Kusuri", "Eigyōchū"). Returns '' if it can't convert cleanly.
const KANA = {
  kya:'きゃ',kyu:'きゅ',kyo:'きょ',sha:'しゃ',shu:'しゅ',sho:'しょ',cha:'ちゃ',chu:'ちゅ',cho:'ちょ',nya:'にゃ',nyu:'にゅ',nyo:'にょ',
  hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',mya:'みゃ',myu:'みゅ',myo:'みょ',rya:'りゃ',ryu:'りゅ',ryo:'りょ',gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',
  ja:'じゃ',ju:'じゅ',jo:'じょ',bya:'びゃ',byu:'びゅ',byo:'びょ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',shi:'し',chi:'ち',tsu:'つ',
  ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',sa:'さ',su:'す',se:'せ',so:'そ',ta:'た',te:'て',to:'と',na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',
  ha:'は',hi:'ひ',fu:'ふ',he:'へ',ho:'ほ',ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',ya:'や',yu:'ゆ',yo:'よ',ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',
  wa:'わ',wo:'を',ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',za:'ざ',ji:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',da:'だ',de:'で',do:'ど',
  ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',a:'あ',i:'い',u:'う',e:'え',o:'お',
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

// Kanji card style: front = just the kanji ("薬"), back = romaji on the first line, meaning below ("Kusuri<br>Medicine").
// Reading is shown in hiragana when the romaji converts cleanly.
function parseAnkiKanji(text) {
  return parseAnkiNotes(text).map(({ id, deck, fields }) => {
    const k = stripEmoji(htmlLines(fields[0] || '').join('')).replace(/\s+/g, '');
    const [romaji = '', ...meaning] = htmlLines(fields[1] || '');
    return { k, reading: romajiToKana(romaji) || romaji, meaning: meaning.join(' '), id: id || k, deck };
  }).filter(x => x.k);
}

if (typeof module !== 'undefined') module.exports = { parseAnkiNotes, parseAnkiExport, parseAnkiKanji, romajiToKana };
