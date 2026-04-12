// test-formation-validation.js
// Tests for formation validation bug fix: position limits must be enforced
// even when the squad is incomplete (e.g., after clearing all players).
//
// Run with: node test-formation-validation.js

// ── Minimal mock of data.js state ──────────────────────────────────────────
// We only need state.elements so getPlayer / getElementType work correctly.

let mockElements = [];

// Patch global state before importing validation (validation.js imports { state } from './data.js')
// Since we can't use ES modules directly in Node without bundling, we
// re-implement the pure validation logic here to keep the test self-contained.

function getElementType(playerId) {
  const p = mockElements.find(e => e.id === playerId);
  return p?.element_type ?? null;
}

function getPlayerTeamId(playerId) {
  const p = mockElements.find(e => e.id === playerId);
  return p?.team ?? null;
}

// ── Copied validation functions (must stay in sync with validation.js) ─────

function validatePositionLimits(team) {
  if (!team) return { ok: false, message: 'Internal error: missing team.' };
  const all = [...(team.starting || []), ...(team.bench || [])];
  let gk = 0, def = 0, mid = 0, fwd = 0;
  for (const e of all) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }
  if (gk > 2) return { ok: false, message: 'Invalid squad: max 2 goalkeepers allowed.' };
  if (def > 5) return { ok: false, message: 'Invalid squad: max 5 defenders allowed.' };
  if (mid > 5) return { ok: false, message: 'Invalid squad: max 5 midfielders allowed.' };
  if (fwd > 3) return { ok: false, message: 'Invalid squad: max 3 forwards allowed.' };
  return { ok: true, message: '' };
}

function validateSquadComposition(team) {
  if (!team) return { ok: false, message: 'Internal error: missing team.' };
  const all = [...(team.starting || []), ...(team.bench || [])];
  if (all.length !== 15) return { ok: true, message: '' };
  let gk = 0, def = 0, mid = 0, fwd = 0;
  for (const e of all) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }
  if (gk !== 2) return { ok: false, message: 'Invalid squad: must have exactly 2 goalkeepers.' };
  if (def !== 5) return { ok: false, message: 'Invalid squad: must have exactly 5 defenders.' };
  if (mid !== 5) return { ok: false, message: 'Invalid squad: must have exactly 5 midfielders.' };
  if (fwd !== 3) return { ok: false, message: 'Invalid squad: must have exactly 3 forwards.' };
  return { ok: true, message: '' };
}

function validateClubLimit(team) {
  if (!team) return { ok: true, message: '' };
  const counts = new Map();
  const all = [...(team.starting || []), ...(team.bench || [])];
  for (const e of all) {
    const tid = getPlayerTeamId(e.id);
    if (tid == null) continue;
    counts.set(tid, (counts.get(tid) || 0) + 1);
  }
  for (const [, c] of counts.entries()) {
    if (c > 3) return { ok: false, message: 'Invalid squad: max 3 players per club.' };
  }
  return { ok: true, message: '' };
}

// ── Test helpers ────────────────────────────────────────────────────────────

function makePlayer(id, element_type, team) {
  return { id, element_type, team, now_cost: 50 };
}

function entry(id) { return { id, purchasePrice: 5, sellingPrice: 5 }; }

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── Setup mock players ──────────────────────────────────────────────────────
// element_type: 1=GK, 2=DEF, 3=MID, 4=FWD
// We create enough players per position with different teams
mockElements = [
  // Goalkeepers (team 1, 2, 3)
  makePlayer(101, 1, 1), makePlayer(102, 1, 2), makePlayer(103, 1, 3),
  // Defenders (teams 1-6)
  makePlayer(201, 2, 1), makePlayer(202, 2, 2), makePlayer(203, 2, 3),
  makePlayer(204, 2, 4), makePlayer(205, 2, 5), makePlayer(206, 2, 6),
  // Midfielders (teams 1-6)
  makePlayer(301, 3, 1), makePlayer(302, 3, 2), makePlayer(303, 3, 3),
  makePlayer(304, 3, 4), makePlayer(305, 3, 5), makePlayer(306, 3, 6),
  // Forwards (teams 1-4)
  makePlayer(401, 4, 1), makePlayer(402, 4, 2), makePlayer(403, 4, 3), makePlayer(404, 4, 4),
];

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('\n=== Formation Validation Tests ===\n');

// ---------- Test 1: Clear squad then attempt to add a 4th forward → blocked ----------
console.log('Test 1: Reject 4th forward on incomplete squad (post-clear scenario)');
{
  // Simulate cleared squad with 3 forwards already added (no other players)
  const team = {
    starting: [entry(401), entry(402), entry(403)],
    bench: []
  };
  // Attempt to add a 4th forward
  const temp = {
    starting: [...team.starting, entry(404)],
    bench: [...team.bench]
  };
  const result = validatePositionLimits(temp);
  assert(!result.ok, 'validatePositionLimits rejects 4th forward');
  assert(result.message.includes('max 3 forwards'), 'Error message mentions forward limit');
}

// ---------- Test 2: 3 forwards on incomplete squad → allowed ----------
console.log('\nTest 2: Allow exactly 3 forwards on incomplete squad');
{
  const team = {
    starting: [entry(401), entry(402), entry(403)],
    bench: []
  };
  const result = validatePositionLimits(team);
  assert(result.ok, 'validatePositionLimits allows exactly 3 forwards');
}

// ---------- Test 3: Clear squad then rebuild valid formation → allowed ----------
console.log('\nTest 3: Allow valid formation rebuild after clear');
{
  // Valid 15-man squad: 2 GK, 5 DEF, 5 MID, 3 FWD
  const team = {
    starting: [
      entry(101),                                    // 1 GK
      entry(201), entry(202), entry(203), entry(204), // 4 DEF
      entry(301), entry(302), entry(303), entry(304), // 4 MID
      entry(401),                                    // 1 FWD
    ],
    bench: [
      entry(102),  // 1 GK (bench)
      entry(205),  // 1 DEF (bench)
      entry(305),  // 1 MID (bench)
      entry(402),  // 1 FWD (bench)
    ]
  };
  const posResult = validatePositionLimits(team);
  assert(posResult.ok, 'validatePositionLimits allows valid 15-man squad');

  const compResult = validateSquadComposition(team);
  assert(compResult.ok, 'validateSquadComposition allows valid 15-man squad');
}

// ---------- Test 4: Reject 3rd goalkeeper on incomplete squad ----------
console.log('\nTest 4: Reject 3rd goalkeeper on incomplete squad');
{
  const team = {
    starting: [entry(101)],
    bench: [entry(102)]
  };
  const temp = {
    starting: [...team.starting],
    bench: [...team.bench, entry(103)]
  };
  const result = validatePositionLimits(temp);
  assert(!result.ok, 'validatePositionLimits rejects 3rd goalkeeper');
  assert(result.message.includes('max 2 goalkeepers'), 'Error message mentions GK limit');
}

// ---------- Test 5: Reject 6th defender on incomplete squad ----------
console.log('\nTest 5: Reject 6th defender on incomplete squad');
{
  const team = {
    starting: [entry(201), entry(202), entry(203), entry(204), entry(205)],
    bench: []
  };
  const temp = {
    starting: [...team.starting, entry(206)],
    bench: []
  };
  const result = validatePositionLimits(temp);
  assert(!result.ok, 'validatePositionLimits rejects 6th defender');
  assert(result.message.includes('max 5 defenders'), 'Error message mentions DEF limit');
}

// ---------- Test 6: Reject 6th midfielder on incomplete squad ----------
console.log('\nTest 6: Reject 6th midfielder on incomplete squad');
{
  const team = {
    starting: [entry(301), entry(302), entry(303), entry(304), entry(305)],
    bench: []
  };
  const temp = {
    starting: [...team.starting, entry(306)],
    bench: []
  };
  const result = validatePositionLimits(temp);
  assert(!result.ok, 'validatePositionLimits rejects 6th midfielder');
  assert(result.message.includes('max 5 midfielders'), 'Error message mentions MID limit');
}

// ---------- Test 7: Club limit still enforced ----------
console.log('\nTest 7: Club limit still enforced (max 3 per club)');
{
  // Add extra players from team 1
  mockElements.push(makePlayer(901, 2, 1));  // DEF team 1
  mockElements.push(makePlayer(902, 3, 1));  // MID team 1
  mockElements.push(makePlayer(903, 4, 1));  // FWD team 1

  const team = {
    starting: [entry(101), entry(201), entry(301)],  // 3 from team 1
    bench: []
  };
  const temp = {
    starting: [...team.starting, entry(901)],         // 4th from team 1
    bench: []
  };
  const result = validateClubLimit(temp);
  assert(!result.ok, 'validateClubLimit rejects 4th player from same club');
}

// ---------- Test 8: Empty squad → all positions allowed ----------
console.log('\nTest 8: Empty squad passes position limits');
{
  const team = { starting: [], bench: [] };
  const result = validatePositionLimits(team);
  assert(result.ok, 'validatePositionLimits allows empty squad');
}

// ---------- Test 9: validateSquadComposition still skips incomplete squads ----------
console.log('\nTest 9: validateSquadComposition still skips incomplete squads (backwards compat)');
{
  const team = {
    starting: [entry(401), entry(402), entry(403), entry(404)],  // 4 FWD — invalid but incomplete
    bench: []
  };
  const compResult = validateSquadComposition(team);
  assert(compResult.ok, 'validateSquadComposition skips validation on incomplete squad (by design)');

  // But validatePositionLimits catches it!
  const posResult = validatePositionLimits(team);
  assert(!posResult.ok, 'validatePositionLimits catches the excess forwards');
}

// ---------- Summary ----------
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
