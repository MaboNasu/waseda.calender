/* Waseda Calendar: homepage date classification / truthful time labels, no external dependencies */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert').strict;

const ROOT = path.resolve(__dirname, '..');
const ux = fs.readFileSync(path.join(ROOT, 'ux-improvements.js'), 'utf8');
const eventsJs = fs.readFileSync(path.join(ROOT, 'events.js'), 'utf8');

function functionBlock(name, nextName) {
  const start = ux.indexOf('function ' + name + '(');
  const end = ux.indexOf('function ' + nextName + '(', start);
  assert(start >= 0 && end > start, 'Cannot isolate ' + name + ' from homepage source');
  return ux.slice(start, end);
}
const ctx = {
  Date, Math, Number, String, Map, Set,
  addDaysToDateStr(date, days) {
    return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  },
  getEventScope(ev) { return ev.scope || 'circle'; },
  getEventEnd(ev) { return ev.endDate || ev.date; },
  isMultiDay(ev) { return (ev.endDate || ev.date) !== ev.date; },
  eventDurationDays(ev) { return Math.round((Date.parse((ev.endDate || ev.date) + 'T00:00:00Z') - Date.parse(ev.date + 'T00:00:00Z')) / 86400000) + 1; },
  isLongRunningEvent(ev) {
    const duration = Math.round((Date.parse((ev.endDate || ev.date) + 'T00:00:00Z') - Date.parse(ev.date + 'T00:00:00Z')) / 86400000) + 1;
    return duration > 1 && (ev.longRunning === true || duration >= 14);
  },
  isEventOnDate(ev, date) {
    if (ev.weeklyClassOnly && new Date(date + 'T00:00:00Z').getUTCDay() === 0) return false;
    return ev.date <= date && date <= (ev.endDate || ev.date);
  },
  sameDayOrderCompare() { return 0; }
};
vm.createContext(ctx);
vm.runInContext(eventsJs + '\nvar __HOME_TEST_EVENTS__ = EVENTS;', ctx, { filename: 'events.js' });
vm.runInContext(
  functionBlock('getHomeTodayStatus', 'classifyHomeEvents') +
  functionBlock('classifyHomeEvents', 'homeClassification'),
  ctx, { filename: 'ux-improvements.js' }
);
const { classifyHomeEvents: classify, getHomeTodayStatus: status } = ctx;
const events = ctx.__HOME_TEST_EVENTS__.filter(ev => ev && ev.isPublished);
assert(events.length >= 400, 'Expected real event data, not synthetic-only');

const today = '2026-10-14';
const model = classify(events, today, 9 * 60, '');
const ids = values => values.map(v => String(v.id || v.ev.id));
assert(!model.todayEvents.some(ev => ev.scope === 'schedule' || ctx.isLongRunningEvent(ev)), 'Academic or long event leaked into today');
assert(model.longRunning.every(ev => ctx.isLongRunningEvent(ev) && ctx.isEventOnDate(ev, today)), 'Long-running pool is invalid');
assert(!model.upcoming.some(item => item.ev.scope === 'schedule' || ctx.isLongRunningEvent(item.ev)), 'Upcoming pool contains wrong scope');
assert.equal(model.from, '2026-10-15');
assert.equal(model.through, '2026-10-21');
assert.equal(new Set(ids(model.upcoming)).size, model.upcoming.length, 'Upcoming has duplicate IDs');
assert(model.upcoming.every(x => x.displayDate >= model.from && x.displayDate <= model.through && ctx.isEventOnDate(x.ev, x.displayDate)), 'Upcoming contains events outside its actual dates');
assert(!model.upcoming.some(x => x.ev.date === today && !ctx.isMultiDay(x.ev)), 'Today-only event duplicated in upcoming');
const overlap = model.todayEvents.find(ev => ev.id === 'evt-223');
assert(!overlap, 'Split evt-223 must no longer appear on 10/14');
assert(!model.todayEvents.some(ev => ev.id === 'evt-309'), 'Museum concert incorrectly appears on 10/14');
assert(!model.todayEvents.some(ev => ev.id === 'evt-337'), 'Washi workshop incorrectly appears on 10/14');
const academic = classify(events, today, 9 * 60, 'schedule');
assert(academic.todayEvents.length > 0 && academic.todayEvents.every(ev => ev.scope === 'schedule'), 'Academic scope incorrect');
assert(!academic.longRunning.length, 'Academic scope must hide exhibitions');
const circle = classify(events.filter(ev => ev.scope !== 'schedule'), today, 9 * 60, 'circle');
assert.deepEqual(ids(model.todayEvents).sort(), ids(circle.todayEvents).sort(), 'All / Events today mismatch');


/* Homepage expiry: end-time preferred; start-time fallback; unknown/multi-day stay. */
const timedEnd = {id:'test-end', date:today, isPublished:true, scope:'circle', startTime:'12:30', endTime:'13:00'};
const startOnly = {id:'test-start', date:today, isPublished:true, scope:'circle', startTime:'12:30'};
const unknownTime = {id:'test-unknown', date:today, isPublished:true, scope:'circle'};
const multiDay = {id:'test-multi', date:today, endDate:'2026-10-16', isPublished:true, scope:'circle', startTime:'12:30', endTime:'13:00'};
const academicDay = {id:'test-academic', date:today, isPublished:true, scope:'schedule', startTime:'08:00'};
const timeTestData = [timedEnd, startOnly, unknownTime, multiDay, academicDay];
const homeIdsAt = now => ids(classify(timeTestData, today, now, '').todayEvents);
assert(homeIdsAt(749).includes('test-start'), 'start-only event must remain before start');
assert(!homeIdsAt(750).includes('test-start'), 'start-only event must disappear at start');
assert(homeIdsAt(750).includes('test-end'), 'event with known end must remain after start');
assert(homeIdsAt(779).includes('test-end'), 'event with known end remains until end');
assert(!homeIdsAt(780).includes('test-end'), 'event must disappear at end');
assert(homeIdsAt(1380).includes('test-unknown'), 'unknown-time event remains on same day');
assert(homeIdsAt(1380).includes('test-multi'), 'multi-day event must not be hidden by ambiguous hours');
assert(classify(timeTestData, today, 1380, 'schedule').todayEvents.some(ev => ev.id === 'test-academic'), 'academic event remains');
assert(classify(timeTestData, today, 1380, '').upcoming.some(x => x.ev.id === 'test-multi'), 'future occurrence of multi-day event remains');
assert(!classify(timeTestData, '2026-10-15', 540, '').todayEvents.some(ev => ev.id === 'test-end'), 'yesterday event must stay out');

const timed = {id:'sample', date:today, startTime:'12:30', endTime:'13:00', scope:'circle'};
assert.equal(status(timed, today, 540).rank, 1, '09:00 should be future');
assert.equal(status(timed, today, 760).rank, 0, '12:40 should be in progress');
assert.equal(status(timed, today, 1080).rank, 5, '18:00 should be ended');
assert.equal(status({...timed, endTime:undefined}, today, 1080).rank, 4, 'Unknown end must not be ended');
assert.equal(status({...timed, startTime:undefined, endTime:undefined}, today, 760).rank, 3, 'Missing start must be unknown');
assert.equal(status({...timed, endDate:'2026-10-16'}, today, 760).rank, 2, 'Multi-day must not show in-progress label');

// New date-specific entries retain old ID URLs, while removing false active days.
const byId = new Map(events.map(ev => [ev.id, ev]));
for (const [id, date] of [['evt-309','2026-10-17'], ['evt-337','2026-10-28'], ['evt-223','2026-10-16']]) {
  assert.equal(byId.get(id)?.date, date, 'Legacy ID date changed: ' + id);
}
for (const id of ['evt-458', 'evt-459', 'evt-460', 'evt-461', 'evt-462']) assert(byId.has(id), 'New session missing: ' + id);


/* ============================================================
   スマホ版v2（mobile-home.js）の純粋関数
   ============================================================ */
const MH = require(path.join(ROOT, 'mobile-home.js'));
const mhDeps = {
  isEventOnDate: ctx.isEventOnDate, isLongRunningEvent: ctx.isLongRunningEvent, isMultiDay: ctx.isMultiDay,
  getEventEnd: ctx.getEventEnd, eventDurationDays: ctx.eventDurationDays, getEventScope: ctx.getEventScope,
  sameDayOrderCompare: () => 0, campusLabel: () => '',
  getHomeTodayStatus: ctx.getHomeTodayStatus, isHomeTodayAvailable: ctx.isHomeTodayAvailable
};
assert.equal(typeof mhDeps.isHomeTodayAvailable, 'function', 'isHomeTodayAvailable must be loadable for v2');

function checkAgenda(from, to, now, scope) {
  const m = MH.buildAgendaModel(events, { from, to, today: from, now, scope }, mhDeps);
  // 区間は from〜to をちょうど1回ずつ覆う
  let expect = from;
  for (const seg of m.segments) {
    const start = seg.type === 'day' ? seg.date : seg.from;
    const end = seg.type === 'day' ? seg.date : seg.to;
    assert.equal(start, expect, `segments must be contiguous (${scope}) at ${start}`);
    expect = MH.addDays(end, 1);
    if (seg.type === 'day') {
      assert.equal(seg.count, seg.active.length + seg.done.length, 'count = active + done ' + seg.date);
      const badge = MH.dayBadge(events, seg.date, scope, {}, mhDeps);
      assert.equal(badge.count, seg.count, `bar count must equal agenda rows (${scope}) ${seg.date}`);
      for (const r of [...seg.active, ...seg.done]) {
        if (scope === 'schedule') {
          assert(r.ev.scope === 'schedule' && !r.ev.weeklyClassOnly, 'schedule mode rows are events/holidays only');
        } else {
          assert(r.ev.scope !== 'schedule' && !ctx.isLongRunningEvent(r.ev), 'regular rows only ' + r.ev.id);
        }
        assert(ctx.isEventOnDate(r.ev, seg.date), 'row must be on its date ' + r.ev.id);
      }
      if (seg.date !== from) assert(seg.done.length === 0, 'only today can have done rows');
    } else {
      for (let d = seg.from; d <= seg.to; d = MH.addDays(d, 1)) {
        assert.equal(MH.dayRows(events, d, scope, mhDeps).length, 0, `empty run must have no rows (${scope}) ${d}`);
      }
    }
  }
  assert.equal(expect, MH.addDays(to, 1), 'segments must end at to');
  assert(m.segments[0].type === 'day' && m.segments[0].isToday, 'today always rendered as a day');
  return m;
}
for (const now of [540, 760, 1080, 1410]) {
  for (const scope of ['', 'circle', 'schedule']) checkAgenda('2026-10-23', '2026-12-31', now, scope);
}
// 早稲田祭（35件規模）は日別画面、少ない日は全件
const fest = MH.buildAgendaModel(events, { from: '2026-11-07', to: '2026-11-07', today: '2026-10-23', now: 540, scope: '' }, mhDeps).segments[0];
assert(fest.count >= 9 && fest.tier === 'dayview', '11/7 must use the day view');
const tierOf = n => n <= MH.MH_CONST.INLINE_LIMIT ? 'all' : n <= MH.MH_CONST.INLINE_EXPAND_MAX ? 'expand' : 'dayview';
assert.deepEqual([0, 5, 6, 8, 9, 35].map(tierOf), ['all', 'all', 'expand', 'expand', 'dayview', 'dayview']);

// 学事モード: 授業週だけの日は●なし、臨時休業の日は●あり。授業週ラベルは日曜に出ない
assert.equal(MH.dayBadge(events, '2026-10-23', 'schedule', {}, mhDeps).mark, false, 'class week alone is not a mark');
assert.equal(MH.dayBadge(events, '2026-11-05', 'schedule', {}, mhDeps).mark, true, 'temporary closure is a mark');
assert(MH.scheduleOn(events, '2026-10-23', mhDeps).weekly.length === 1, 'weekday shows class week label');
assert.equal(MH.scheduleOn(events, '2026-10-25', mhDeps).weekly.length, 0, 'Sunday hides class week label');

// 今日の終了判定: 終了時刻ありは「本日終了」、開始のみは終了と断定しない
const doneDay = MH.buildAgendaModel(timeTestData, { from: today, to: today, today, now: 1080, scope: '' }, mhDeps).segments[0];
const labelOf = id => [...doneDay.active, ...doneDay.done].find(r => r.ev.id === id)?.state;
assert.equal(labelOf('test-end').label, '本日終了');
assert.equal(labelOf('test-end').group, 'done');
assert(labelOf('test-start').label.includes('終了時刻不明') && labelOf('test-start').ended === false, 'start-only must not be called ended');
assert.equal(labelOf('test-unknown').group, 'active', 'unknown time stays active all day');
assert.equal(labelOf('test-multi').group, 'active', 'multi-day stays active');
assert.equal(doneDay.count, 4, 'academic row excluded from regular count');

// URL: 不正値は落として正規化、m は保持
assert.deepEqual(MH.parseHomeUrl('?m=v2&date=2026-11-07&view=day'), { date: '2026-11-07', view: 'day', q: '', m: 'v2', normalized: false });
assert.equal(MH.parseHomeUrl('?date=2026-02-30').normalized, true, 'invalid date normalized');
assert.equal(MH.parseHomeUrl('?view=day').view, null, 'day view needs a date');
assert.equal(MH.parseHomeUrl('?view=hack').normalized, true, 'unknown view normalized');
assert.equal(MH.buildHomeUrl({ m: 'v2', date: '2026-11-07', view: 'search', q: '早慶' }, '/'), '/?m=v2&date=2026-11-07&view=search&q=%E6%97%A9%E6%85%B6');
assert.equal(MH.buildHomeUrl({ m: null, date: null, view: null }, '/'), '/');
assert.equal(MH.weekStartOf('2026-10-25'), '2026-10-19', 'week starts on Monday (Sunday belongs to previous week)');

// 検索: 学事は出さない、既定は今日以降、主催名で見つかる
const someOrg = events.find(ev => ev.scope !== 'schedule' && ev.organizer && (ev.endDate || ev.date) >= '2026-10-23');
const found = MH.searchEvents(events, { keyword: someOrg.organizer, category: '' }, '2026-10-23', false, mhDeps);
assert(found.some(ev => ev.id === someOrg.id), 'organizer search finds the event');
assert(found.every(ev => ev.scope !== 'schedule' && (ev.endDate || ev.date) >= '2026-10-23'), 'search excludes schedule and past');
assert.equal(MH.searchEvents(events, { keyword: '', category: '' }, '2026-10-23', false, mhDeps).length, 0, 'empty query returns nothing');

console.log('Mobile v2 agenda verified.');

console.log('Homepage classification verified:', {
  published: events.length, today: model.todayEvents.length, inPeriod: model.longRunning.length,
  next7: model.upcoming.length, from: model.from, through: model.through
});
