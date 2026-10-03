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

function parseAnkiExport(text) {
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
  const rows = parseTsv(lines.slice(body).join('\n')).filter(r => r.some(f => f.trim()));

  return rows.map(r => {
    const fields = r.filter((_, i) => !meta.has(i));
    const front = stripEmoji(htmlLines(fields[0] || '').join(' '));
    const [left, right] = front.includes('·') ? front.split('·').map(s => s.trim()) : ['', front.trim()];
    const word = left === '—' || left === '-' ? '' : left;
    const back = htmlLines(fields[1] || '').filter(l => !/^example:?$/i.test(l));
    const examples = [];
    for (const l of back.slice(1)) {
      if (hasJapanese(l)) examples.push({ jp: l, en: '' });
      else if (examples.length && !examples[examples.length - 1].en) examples[examples.length - 1].en = l;
    }
    return {
      id: col('guid') >= 0 ? r[col('guid')] : (word || right),
      word,
      kana: right || word,
      meaning: back[0] || '',
      examples,
      deck: col('deck') >= 0 ? deckName(r[col('deck')]) : '',
    };
  }).filter(v => v.kana || v.word);
}

if (typeof module !== 'undefined') module.exports = { parseAnkiExport };
