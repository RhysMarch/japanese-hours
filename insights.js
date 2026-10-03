// Insight panels: JLPT projection and routine checklist.
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
