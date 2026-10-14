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

console.log('Homepage classification verified:', {
  published: events.length, today: model.todayEvents.length, inPeriod: model.longRunning.length,
  next7: model.upcoming.length, from: model.from, through: model.through
});
