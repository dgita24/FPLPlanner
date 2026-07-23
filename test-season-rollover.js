// test-season-rollover.js
// Regression tests for season rollover detection/reset and import error mapping.
//
// Run with: node test-season-rollover.js

const RESETTABLE_STORAGE_KEYS = [
  'fplplanner-state',
  'fplplanner-recent-team-ids',
  'fplplanner-fixtures-sync',
  'fplplanner-fixtures-view-mode',
  'fplplanner-fixtures-selected-team',
];

function getSeasonMarkerFromBootstrap(bootstrap) {
  const events = Array.isArray(bootstrap?.events) ? [...bootstrap.events] : [];
  if (!events.length) return null;
  const sorted = events.filter(e => e && typeof e.id === 'number').sort((a, b) => a.id - b.id);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return JSON.stringify({
    firstEventId: first?.id ?? null,
    firstEventDeadline: first?.deadline_time ?? null,
    lastEventId: last?.id ?? null,
    lastEventDeadline: last?.deadline_time ?? null,
    totalEvents: sorted.length,
  });
}

function applySeasonRollover(previousMarker, currentMarker, localStore, sessionStore) {
  const result = {
    seasonRolloverDetected: false,
    message: '',
  };

  if (previousMarker && currentMarker && previousMarker !== currentMarker) {
    result.seasonRolloverDetected = true;
    result.message = 'New FPL season detected. Local planner cache was reset. Please import your team to continue.';
    for (const key of RESETTABLE_STORAGE_KEYS) {
      delete localStore[key];
      delete sessionStore[key];
    }
  }

  localStore['fplplanner-season-marker'] = currentMarker;
  return result;
}

function getBootstrapPlanningGW(events, currentGW) {
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  if (next) return next;
  if (current) return Math.min(current + 1, 38);
  return currentGW || 1;
}

function buildCandidateGWs(gwRequested, events) {
  const candidates = [];
  if (Number.isFinite(+gwRequested)) candidates.push(+gwRequested);
  const completedOrCurrent = events
    .filter(e => e && typeof e.id === 'number' && e.id <= gwRequested && (e.finished || e.is_previous || e.is_current))
    .sort((a, b) => b.id - a.id)
    .map(e => e.id);
  for (const id of completedOrCurrent) candidates.push(id);
  for (let g = gwRequested - 1; g >= Math.max(1, gwRequested - 6); g--) candidates.push(g);
  return [...new Set(candidates)];
}

function getImportErrorMessage(error) {
  if (!error) return 'Failed to load team. Please try again.';
  switch (error.category) {
    case 'invalid_team_id':
      return 'Team ID not found. Please check the ID and try again.';
    case 'private_pre_deadline':
      return 'Your team ID is valid, but FPL keeps GW1 picks private until the deadline. Import will work after the GW1 deadline; until then, use a draft team.';
    case 'network':
      return 'Network error while loading team data. Check your connection and retry.';
    case 'proxy':
      return 'FPL proxy/API request failed. Please retry shortly.';
    case 'schema':
      return 'Received unexpected team data format. Please retry shortly.';
    case 'no_picks':
      return 'No team picks available yet for current gameweeks. Please retry shortly.';
    default:
      return error.message || 'Failed to load team. Please try again.';
  }
}

function isPreDeadlineGW1Import(events, gwRequested, entrySummary) {
  if (!entrySummary || Number(gwRequested) !== 1) return false;
  return !(events || []).some(
    e => e && typeof e.id === 'number' && e.id <= 1 && (e.finished || e.is_previous || e.is_current)
  );
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

console.log('== Season rollover resets stale cache keys ==');
{
  const oldSeason = { events: [{ id: 1, deadline_time: '2024-08-16T17:30:00Z' }, { id: 38, deadline_time: '2025-05-25T14:00:00Z' }] };
  const newSeason = { events: [{ id: 1, deadline_time: '2025-08-15T17:30:00Z' }, { id: 38, deadline_time: '2026-05-24T14:00:00Z' }] };
  const prev = getSeasonMarkerFromBootstrap(oldSeason);
  const curr = getSeasonMarkerFromBootstrap(newSeason);

  const localStore = {
    'fplplanner-state': '{"dummy":1}',
    'fplplanner-fixtures-view-mode': 'single',
    'fplplanner-season-marker': prev,
  };
  const sessionStore = {
    'fplplanner-state': '{"dummy":1}',
    'fplplanner-fixtures-selected-team': '1',
  };

  const result = applySeasonRollover(prev, curr, localStore, sessionStore);
  assert(result.seasonRolloverDetected, 'rollover detected when season marker changes');
  assert(!('fplplanner-state' in localStore), 'local stale planner state is cleared');
  assert(!('fplplanner-state' in sessionStore), 'session stale planner state is cleared');
  assert(localStore['fplplanner-season-marker'] === curr, 'new season marker persisted');
}

console.log('\n== No reset when marker is unchanged ==');
{
  const bootstrap = { events: [{ id: 1, deadline_time: '2025-08-15T17:30:00Z' }, { id: 38, deadline_time: '2026-05-24T14:00:00Z' }] };
  const marker = getSeasonMarkerFromBootstrap(bootstrap);
  const localStore = { 'fplplanner-state': '{"dummy":1}', 'fplplanner-season-marker': marker };
  const sessionStore = { 'fplplanner-state': '{"dummy":1}' };
  const result = applySeasonRollover(marker, marker, localStore, sessionStore);
  assert(!result.seasonRolloverDetected, 'rollover not detected for same marker');
  assert(!!localStore['fplplanner-state'], 'local planner state preserved');
  assert(!!sessionStore['fplplanner-state'], 'session planner state preserved');
}

console.log('\n== Valid import after rollover targets fresh season GW1 ==');
{
  const events = [
    { id: 1, is_next: true, is_current: false, is_previous: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 1);
  const candidates = buildCandidateGWs(planningGW, events);
  assert(planningGW === 1, 'planning GW resolves to GW1 at season start');
  assert(candidates[0] === 1, 'first picks candidate is GW1 (fresh season)');
}

console.log('\n== Import error mapping is actionable ==');
{
  assert(getImportErrorMessage({ category: 'invalid_team_id' }).includes('Team ID not found'), 'invalid team ID message is specific');
  assert(getImportErrorMessage({ category: 'private_pre_deadline' }).includes('GW1 picks private until the deadline'), 'pre-deadline private picks message is specific');
  assert(getImportErrorMessage({ category: 'network' }).includes('Network error'), 'network message is specific');
  assert(getImportErrorMessage({ category: 'proxy' }).includes('proxy/API'), 'proxy message is specific');
  assert(getImportErrorMessage({ category: 'schema' }).includes('unexpected team data format'), 'schema message is specific');
}

console.log('\n== Pre-deadline GW1 import is classified separately ==');
{
  const events = [
    { id: 1, is_next: true, is_current: false, is_previous: false, finished: false },
  ];
  assert(isPreDeadlineGW1Import(events, 1, { id: 18225 }), 'valid team at season start is treated as pre-deadline private picks');
  assert(!isPreDeadlineGW1Import([{ id: 1, is_current: true, finished: false }], 1, { id: 18225 }), 'live GW1 is not treated as pre-deadline private picks');
  assert(!isPreDeadlineGW1Import(events, 2, { id: 18225 }), 'only GW1 is classified as pre-deadline private picks');
}

console.log('\n==================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}
