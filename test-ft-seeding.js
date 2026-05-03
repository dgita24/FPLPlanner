// test-ft-seeding.js
// Regression tests for free-transfer seeding on import, especially when
// import falls back to an older GW than the planning GW.
//
// Bug: loadTeamEntry() always seeded freeTransfersByGW[planningGW] with
// ftResult.nextGWft. When history extended beyond the imported picks GW,
// nextGWft could correspond to a GW *after* planningGW, producing an
// incorrect FT count.  The fix uses perGW[planningGW] when available.
//
// Run with: node test-ft-seeding.js

// ── Helpers (mirror production logic) ────────────────────────────────────────

function normalizeFreeTransfersValue(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(0, Math.min(5, n));
}

/**
 * Mirrors computeFreeTransfersFromHistory in data.js.
 */
function computeFreeTransfersFromHistory(historyData) {
  if (!historyData?.current?.length) return null;

  const events = [...historyData.current].sort((a, b) => a.event - b.event);
  const chipMap = {};
  for (const c of (historyData.chips || [])) {
    chipMap[c.event] = c.name;
  }

  let ft = 1;
  const perGW = {};

  for (const ev of events) {
    perGW[ev.event] = ft;
    const chip = chipMap[ev.event];
    const transfers = ev.event_transfers || 0;

    if (chip === 'wildcard') {
      ft = 1;
    } else if (chip === 'freehit') {
      ft = ft; // FH preserves FTs; no +1 rollover since the chip was "used"
    } else {
      ft = Math.min(5, Math.max(0, ft - transfers) + 1);
    }
  }

  return { perGW, nextGWft: ft, chips: historyData.chips || [] };
}

/**
 * Mirrors the fixed FT-seeding logic from loadTeamEntry.
 * Returns the FT value that would be seeded for planningGW.
 */
function computeSeedFT(ftResult, planningGW) {
  if (!ftResult) return 1;
  const seedFT = (ftResult.perGW[planningGW] !== undefined)
    ? ftResult.perGW[planningGW]
    : ftResult.nextGWft;
  return normalizeFreeTransfersValue(seedFT);
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

// ── Test 1: No fallback – planningGW is the next unplayed GW ────────────────
console.log('\nTest 1: No fallback – planningGW is next unplayed GW (uses nextGWft)');
{
  // History through GW32, planning from GW33, picks available for GW33.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 1 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31 starts with ft=1 (default), after 0 transfers: ft = min(5, max(0,1-0)+1) = 2
  // GW32 starts with ft=2, after 1 transfer: ft = min(5, max(0,2-1)+1) = 2
  // nextGWft = 2 (for GW33)
  // perGW[33] is undefined → should use nextGWft
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 for GW33 (nextGWft used, perGW[33] absent)`);
}

// ── Test 2: Fallback – history extends beyond importedGW ────────────────────
console.log('\nTest 2: Fallback – history includes planningGW, uses perGW[planningGW]');
{
  // History through GW33 (is_current), but picks fell back to GW32.
  // Planning GW = 33.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 1 },
      { event: 33, event_transfers: 2 },  // GW33 current, transfers already made
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 1 transfer  → ft=2
  // GW33: ft=2, 2 transfers → ft=min(5, max(0,2-2)+1)=1
  // nextGWft = 1 (for GW34!)
  // perGW[33] = 2 (FTs at start of GW33)
  //
  // OLD CODE would seed GW33 with nextGWft=1 (WRONG – that's GW34's FT).
  // FIXED CODE uses perGW[33]=2 (CORRECT – FTs available at start of GW33).
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 for GW33 (perGW[33] used, not nextGWft=1)`);
}

// ── Test 3: Fallback with wildcard in current GW ────────────────────────────
console.log('\nTest 3: Fallback – wildcard used in planningGW, perGW still used');
{
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 5 },
    ],
    chips: [{ name: 'wildcard', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, wildcard → ft=1 (reset)
  // nextGWft = 1 (for GW34)
  // perGW[33] = 3
  //
  // The user's GW32 squad is imported. At GW33 they had 3 FTs available
  // before the wildcard.  The planner should show 3 FTs for GW33.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 3, `FT seeded as 3 for GW33 (perGW used, wildcard reset is for GW34)`);
}

// ── Test 4: No history at all – defaults to 1 ──────────────────────────────
console.log('\nTest 4: No history – defaults to 1 FT');
{
  const ftResult = computeFreeTransfersFromHistory({ current: [] });
  const seedFT = computeSeedFT(ftResult, 33);
  assert(seedFT === 1, `FT defaults to 1 when no history`);
}

// ── Test 5: FT cap at 5 ────────────────────────────────────────────────────
console.log('\nTest 5: FT capped at 5');
{
  // Many GWs with 0 transfers → FTs accumulate to 5.
  const historyData = {
    current: [
      { event: 25, event_transfers: 0 },
      { event: 26, event_transfers: 0 },
      { event: 27, event_transfers: 0 },
      { event: 28, event_transfers: 0 },
      { event: 29, event_transfers: 0 },
      { event: 30, event_transfers: 0 },
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // After enough 0-transfer GWs, FTs cap at 5. nextGWft=5, perGW[33] absent.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 5, `FT capped at 5`);
}

// ── Test 6: Verify old code would have been wrong in fallback scenario ──────
console.log('\nTest 6: Verify old logic (nextGWft always) gives wrong result in fallback');
{
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 3 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, 3 transfers → ft=min(5, max(0,3-3)+1) = 1
  // nextGWft = 1 (for GW34)
  // perGW[33] = 3

  // Old code: seed = nextGWft = 1 (WRONG for GW33)
  const oldSeed = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldSeed === 1, `Old logic would seed 1 (nextGWft for GW34, not GW33)`);

  // New code: seed = perGW[33] = 3 (CORRECT for GW33)
  const newSeed = computeSeedFT(ftResult, planningGW);
  assert(newSeed === 3, `New logic seeds 3 (perGW[33], correct for planning GW33)`);

  assert(oldSeed !== newSeed, `Old and new differ in fallback scenario – bug was real`);
}

// ── Test 7: planningGW matches last history GW (no fallback, perGW used) ────
console.log('\nTest 7: planningGW matches last history GW (perGW available, used correctly)');
{
  const historyData = {
    current: [
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW32: ft=1, 0 transfers → ft=2
  // GW33: ft=2, 0 transfers → ft=3
  // nextGWft = 3 (for GW34)
  // perGW[33] = 2

  // Even when "no fallback" in picks, if GW33 is in history, we use perGW.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 from perGW[33], even though nextGWft=3`);
}

// ── Test 8: Free Hit in GW33 – FTs preserved, no +1 rollover ────────────────
console.log('\nTest 8: Free Hit in GW33 – FTs preserved, no +1 rollover');
{
  // Manager had 3 FTs going into GW33, played FH → should still have 3 FTs for GW34.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 15 }, // FH: unlimited transfers, ignored
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, freehit → ft=3 (preserved, no +1)
  // nextGWft = 3 (for GW34)
  assert(ftResult.nextGWft === 3, `FH preserves 3 FTs → nextGWft=3 for GW34`);
}

// ── Test 9: Free Hit with only 1 FT – still preserved (not +1) ──────────────
console.log('\nTest 9: Free Hit with 1 FT – FT count stays at 1, not bumped to 2');
{
  // Manager had 1 FT going into GW33 (used 2 transfers in GW32), played FH.
  const historyData = {
    current: [
      { event: 32, event_transfers: 2 }, // 2 transfers → FT goes to 0, then +1 = 1? No: max(0, 1-2)+1=1
      { event: 33, event_transfers: 15 },
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW32: ft=1, 2 transfers → ft=min(5, max(0,1-2)+1)=min(5,0+1)=1
  // GW33: ft=1, freehit → ft=1 (preserved)
  // nextGWft = 1
  assert(ftResult.nextGWft === 1, `FH with 1 FT → nextGWft=1 (not bumped to 2)`);
}

// ── Helper that mirrors the new simplified seeding in loadTeamEntry ──────────

/**
 * Mirrors the new simplified FT seeding logic:
 * use nextGWft, rolling it forward +1 per gap-GW if history is behind planningGW.
 */
function computeSimpleSeedFT(ftResult, planningGW) {
  if (!ftResult) return 1;
  if (ftResult.perGW[planningGW] !== undefined) {
    return normalizeFreeTransfersValue(ftResult.perGW[planningGW]);
  }
  const lastHistoryGW = Object.keys(ftResult.perGW)
    .reduce((max, k) => Math.max(max, +k), 0);
  let seedFT = ftResult.nextGWft;
  for (let g = lastHistoryGW + 1; g < planningGW; g++) {
    seedFT = Math.min(5, seedFT + 1);
  }
  return normalizeFreeTransfersValue(seedFT);
}

// ── Tests: is_current+1 transfer-window (no is_next) ────────────────────────

console.log('\nTest 10: is_current+1 — GW35 in history, 0 real transfers → GW36=2');
{
  // Most common case: GW35 deadline passed, history updated, user made 0 transfers.
  // planningGW=36, nextGWft = FT for GW36.
  const historyData = {
    current: [
      { event: 34, event_transfers: 0 },
      { event: 35, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 0 transfers → ft=2
  // GW35: ft=2, 0 transfers → ft=3; nextGWft=3 (for GW36); perGW[35]=2
  assert(ftResult.nextGWft === 3, `nextGWft=3 (FT for GW36 directly)`);
  const seed = computeSimpleSeedFT(ftResult, 36);
  assert(seed === 3, `planningGW=36, seed=nextGWft=3 ✓`);
}

console.log('\nTest 11: is_current+1 — GW35 in history, 1 real transfer → GW36=2');
{
  // User made 1 real transfer in GW35 (used free transfer).
  // nextGWft already reflects this → directly gives correct GW36 FT.
  const historyData = {
    current: [
      { event: 34, event_transfers: 0 },
      { event: 35, event_transfers: 1 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 0 transfers → ft=2
  // GW35: ft=2, 1 transfer → ft=min(5,max(0,2-1)+1)=2; nextGWft=2; perGW[35]=2
  assert(ftResult.nextGWft === 2, `nextGWft=2 (GW36 FT after 1 real GW35 transfer)`);
  const seed = computeSimpleSeedFT(ftResult, 36);
  assert(seed === 2, `planningGW=36, seed=nextGWft=2 ✓`);
}

console.log('\nTest 12: is_current+1 — GW35 NOT in history (API lag), GW35 should have 1 FT → GW36=2');
{
  // The user-reported regression: GW35 deadline passed but history still
  // ends at GW34.  nextGWft=1 is the FT *for GW35* (not GW36).
  // The new code rolls it forward +1 → GW36=2.
  const historyData = {
    current: [
      { event: 34, event_transfers: 1 },  // used 1 FT in GW34 → GW35 gets 1 FT
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 1 transfer → ft=min(5,max(0,1-1)+1)=1; nextGWft=1 (for GW35)
  assert(ftResult.nextGWft === 1, `nextGWft=1 (FT for GW35, not GW36 — API lag)`);
  // lastHistoryGW=34; loop g=35, g<36 runs once: seedFT = min(5, 1+1) = 2
  const seed = computeSimpleSeedFT(ftResult, 36);
  assert(seed === 2, `planningGW=36 with API lag: rolled forward → seed=2 ✓`);
}

console.log('\nTest 13: is_current+1 — API lag, had 2 FTs for GW35 → GW36=3');
{
  // History ends at GW34, user banked 2 FTs for GW35.
  // nextGWft=2 (FT for GW35).  Roll → GW36=3.
  const historyData = {
    current: [
      { event: 33, event_transfers: 0 },
      { event: 34, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW33: ft=1, 0 transfers → ft=2
  // GW34: ft=2, 0 transfers → ft=3; nextGWft=3 (for GW35)
  assert(ftResult.nextGWft === 3, `nextGWft=3 (FT for GW35 — API lag)`);
  const seed = computeSimpleSeedFT(ftResult, 36);
  // lastHistoryGW=34; loop g=35, g<36: seedFT=min(5,3+1)=4
  assert(seed === 4, `planningGW=36 with API lag: rolled forward → seed=4 ✓`);
}

console.log('\nTest 14: normal is_next case — perGW[planningGW] used when available');
{
  // Picks fell back to an older GW; history extends beyond importedGW.
  // perGW[planningGW] should be used exactly (same as original main logic).
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 1 },
      { event: 33, event_transfers: 2 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 1 transfer  → ft=2
  // GW33: ft=2, 2 transfers → ft=1; nextGWft=1 (for GW34)
  // perGW[33]=2
  assert(ftResult.perGW[33] === 2, `perGW[33]=2`);
  assert(ftResult.nextGWft === 1, `nextGWft=1`);
  const seed = computeSimpleSeedFT(ftResult, 33);
  assert(seed === 2, `planningGW=33 present in perGW → seed=2 ✓ (not nextGWft=1)`);
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAIL');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
  process.exit(0);
}
