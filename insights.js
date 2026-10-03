// Insight panels: JLPT projection, routine checklist, Genki pace, study diet.
// Loaded before the main script; uses its globals (data, SECTIONS, COLORS, secHours, dayTotal, isoDate, parseDate, fmt, $) at call time.

// Rough total-study-hour ranges for learners without a kanji background (commonly cited JLEC estimates).
const JLPT = [
  { lvl: 'N5', lo: 325,  hi: 500 },
  { lvl: 'N4', lo: 575,  hi: 1000 },
  { lvl: 'N3', lo: 950,  hi: 1700 },
  { lvl: 'N2', lo: 1600, hi: 2600 },
  { lvl: 'N1', lo: 3000, hi: 4800 },
];
const PACE_DAYS = 28;
const GENKI_END = { 'Genki I': 12, 'Genki II': 23 };
const DIET = [
  { name: 'Learning',      ids: ['genki', 'writing'],  color: 'var(--c0)', hint: 'Genki, Writing / Grammar' },
  { name: 'Drilling',      ids: ['anki', 'duolingo'],  color: 'var(--c2)', hint: 'Anki, Duolingo' },
  { name: 'Real Japanese', ids: ['listening'],         color: 'var(--c5)', hint: 'Listening' },
];

const DAY = 864e5;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const monthYear = d => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const dayMonth = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const loggedDates = () => Object.keys(data).filter(d => dayTotal(data[d]) > 0).sort();

function renderInsights(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  renderJlpt(today);
  renderRoutine(today);
  renderGenkiPace(today);
  renderDiet(today);
}

// Average hours/day over the last 4 weeks, or since the first log if that's more recent
function recentPace(today) {
  const dates = loggedDates();
  if (!dates.length) return 0;
  const span = Math.min(PACE_DAYS, daysBetween(parseDate(dates[0]), today) + 1);
  const from = isoDate(addDays(today, -span + 1));
  const hours = dates.filter(d => d >= from && d <= isoDate(today)).reduce((t, d) => t + dayTotal(data[d]), 0);
  return hours / span;
}

function renderJlpt(today) {
  const total = Object.values(data).reduce((t, e) => t + dayTotal(e), 0);
  const pace = recentPace(today);
  const eta = hours => {
    const days = Math.ceil((hours - total) / pace);
    return days > 365 * 30 ? null : addDays(today, days);
  };
  const rows = JLPT.map(l => {
    let right;
    if (total >= l.hi) right = '<b>Past this range</b>';
    else if (total >= l.lo) right = `<b>In range</b> · ${fmt(l.hi - total)} to top`;
    else if (!pace) right = `${fmt(l.lo - total)} to go`;
    else {
      const a = eta(l.lo), b = eta(l.hi);
      right = a ? `<b>${monthYear(a)}</b>${b ? ' – ' + monthYear(b) : ''}` : 'many years at this pace';
    }
    const pct = x => Math.min(100, x / l.hi * 100);
    return `<div class="lvl${total >= l.lo ? ' reached' : ''}" title="${l.lvl}: roughly ${l.lo}–${l.hi}h total study">
      <span class="tag">${l.lvl}</span>
      <div class="track">
        <div class="band" style="left:${pct(l.lo)}%;right:0"></div>
        <div class="done" style="width:${pct(total)}%"></div>
      </div>
      <span class="eta">${right}</span>
    </div>`;
  }).join('');
  const next = JLPT.find(l => total < l.lo);
  $('jlpt').innerHTML = `
    <p class="insight" style="margin-top:0">
      <b>${fmt(total)}</b> studied · pace <b>${fmt(pace)}/day</b> (last ${PACE_DAYS} days)
      ${next && pace ? ` · ${next.lvl} range starts in about <b>${Math.ceil((next.lo - total) / pace)} days</b>` : ''}
    </p>
    ${rows}
    <p class="insight">Shaded = rough total study hours people typically need for each level (no prior kanji). Dates assume you keep your current pace.
    Real numbers vary a lot — treat this as a ballpark, not a deadline.</p>`;
}

function renderRoutine(today) {
  const first = loggedDates()[0];
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const tracked = first ? days.filter(d => isoDate(d) >= first) : [];
  let html = '<div></div>' + days.map((d, i) =>
    `<div class="dlbl">${i === 0 || d.getDate() === 1 || i === 29 ? d.getDate() : ''}</div>`).join('') + '<div></div>';
  const rates = SECTIONS.map((s, si) => {
    let done = 0;
    html += `<div class="rname">${si + 1}. ${s.name}</div>`;
    html += days.map(d => {
      const key = isoDate(d), e = data[key] || {};
      if (!first || key < first) return '<div class="dot pre"></div>';
      const h = secHours(e, s);
      if (h) done++;
      return `<div class="dot" style="${h ? 'background:' + COLORS[si] : ''}" title="${dayMonth(d)} · ${s.name}: ${h ? fmt(h) : 'skipped'}"></div>`;
    }).join('');
    html += `<div class="rate">${tracked.length ? Math.round(done / tracked.length * 100) + '%' : '–'}</div>`;
    return { s, done };
  });
  let note = '';
  if (tracked.length >= 7) {
    const full = tracked.filter(d => SECTIONS.every(s => secHours(data[isoDate(d)] || {}, s))).length;
    const worst = rates.reduce((a, b) => b.done < a.done ? b : a);
    note = `Full routine on <b>${full}</b> of ${tracked.length} days. Most skipped: <b>${worst.s.name}</b> (${worst.done}/${tracked.length} days).`;
  } else {
    note = 'Each dot is a step you did that day. After a week this will show which steps get skipped.';
  }
  $('routine').innerHTML = `<div class="routine-wrap"><div class="routine">${html}</div></div><p class="insight">${note}</p>`;
}

function renderGenkiPace(today) {
  const days = Object.keys(data).filter(d => data[d].genki_ch && data[d].genki).sort();
  if (!days.length) {
    $('genki-pace').innerHTML = '<p class="insight" style="margin-top:0">Fill in the chapter number next to Genki when you log, and this will show hours per chapter and when you\'re on track to finish.</p>';
    return;
  }
  const ch = {};
  days.forEach(d => {
    const c = data[d].genki_ch;
    ch[c] ??= { hours: 0, days: 0, start: d };
    ch[c].hours += data[d].genki; ch[c].days++;
  });
  const current = data[days[days.length - 1]].genki_ch;
  const firstCh = Math.min(...Object.keys(ch).map(Number));
  const book = current <= 12 ? 'Genki I' : 'Genki II';
  const end = GENKI_END[book], bookStart = book === 'Genki I' ? 1 : 13;

  // Pace = time from first logged chapter's start to the current chapter's start, per chapter finished
  const finished = current - firstCh;
  let pace = '', projection = '';
  if (finished > 0) {
    const spanDays = daysBetween(parseDate(ch[firstCh].start), parseDate(ch[current].start));
    const perCh = spanDays / finished;
    const doneHours = Object.entries(ch).filter(([c]) => c < current).reduce((t, [, v]) => t + v.hours, 0);
    const finishDate = addDays(parseDate(ch[current].start), Math.round(perCh * (end - current + 1)));
    pace = `About <b>${Math.max(1, Math.round(perCh))} days</b> and <b>${fmt(doneHours / finished)}</b> per chapter.`;
    projection = finishDate < today
      ? `At this pace you'd be done with ${book} about now — nice.`
      : `On track to finish ${book} around <b>${dayMonth(finishDate)}</b>.`;
  } else {
    pace = `${fmt(ch[current].hours)} on chapter ${current} so far.`;
    projection = 'Move on to the next chapter and a finish date will appear.';
  }

  const shown = Array.from({ length: end - bookStart + 1 }, (_, i) => bookStart + i);
  const maxH = Math.max(...shown.map(c => ch[c]?.hours || 0), 0.01);
  const bars = shown.map(c => `<div class="cb${c === current ? ' cur' : ''}" title="Ch ${c}: ${ch[c] ? fmt(ch[c].hours) + ' over ' + ch[c].days + ' day' + (ch[c].days === 1 ? '' : 's') : 'not started'}">
      <div style="height:${(ch[c]?.hours || 0) / maxH * 100}%;${ch[c] ? '' : 'min-height:0'}"></div><span>${c}</span></div>`).join('');
  const progress = (current - bookStart) / (end - bookStart + 1) * 100;

  $('genki-pace').innerHTML = `
    <div class="insight" style="margin-top:0"><b>${book} · Chapter ${current}</b> of ${end}</div>
    <div class="progress"><div style="width:${progress}%"></div></div>
    <div class="ch-bars">${bars}</div>
    <p class="insight">Hours per chapter (lighter = in progress). ${pace} ${projection}</p>`;
}

function renderDiet(today) {
  const mix = from => {
    const out = DIET.map(c => ({ ...c, h: 0 }));
    Object.keys(data).filter(d => !from || d >= from).forEach(d =>
      out.forEach(c => c.ids.forEach(id => c.h += secHours(data[d], SECTIONS.find(s => s.id === id)))));
    return out;
  };
  const bar = (label, parts) => {
    const total = parts.reduce((t, p) => t + p.h, 0);
    const segs = total ? parts.filter(p => p.h).map(p => {
      const pct = p.h / total * 100;
      return `<div style="width:${pct}%;background:${p.color}" title="${p.name}: ${fmt(p.h)} (${Math.round(pct)}%)">${pct >= 12 ? Math.round(pct) + '%' : ''}</div>`;
    }).join('') : '';
    return `<div class="diet-row"><small>${label}${total ? ' · ' + fmt(total) : ''}</small><div class="stack">${segs}</div></div>`;
  };
  const recent = mix(isoDate(addDays(today, -PACE_DAYS + 1)));
  const all = mix(null);
  const rTotal = recent.reduce((t, p) => t + p.h, 0);

  let tip = '';
  if (rTotal >= 3) {
    const share = name => recent.find(p => p.name === name).h / rTotal;
    if (share('Drilling') > 0.5) tip = 'Over half your recent time is flashcards and apps. They\'re easy to keep up, but swapping some for Genki or Listening builds real ability faster.';
    else if (share('Real Japanese') < 0.1) tip = 'Very little listening lately. Even 15 minutes of real Japanese a day adds up fast.';
    else if (share('Learning') < 0.2) tip = 'Not much Genki or grammar lately. That\'s what makes the vocab and listening click.';
    else tip = 'Good balance between learning, drilling and real Japanese.';
  }
  $('diet').innerHTML = `
    ${bar('Last 4 weeks', recent)}
    ${bar('All time', all)}
    <div class="legend">${DIET.map(c => `<span title="${c.hint}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:4px"></span>${c.name} <span class="muted">(${c.hint})</span></span>`).join('')}</div>
    ${tip ? `<div class="callout">${tip}</div>` : '<p class="insight">Log a few days to see how your time splits up.</p>'}`;
}
