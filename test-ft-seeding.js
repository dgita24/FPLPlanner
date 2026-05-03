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

// ── Helpers for is_current+1 rollover ────────────────────────────────────────

/**
 * Mirrors the is_current+1 path in loadTeamEntry:
 * seeds freeTransfersByGW[baseGW] and derives planningGW FT by rollover
 * (0 plan transfers, i.e. fresh import).
 */
function computeIsCurrentPlusOneFT(ftResult, baseGW, planTransfersAtBase = 0) {
  if (!ftResult) return 1;
  const baseSeedFT = (ftResult.perGW[baseGW] !== undefined)
    ? ftResult.perGW[baseGW]
    : ftResult.nextGWft;
  // Replicate recomputeFreeTransfersFromGW logic for one step (baseGW → planningGW)
  const normalised = Math.max(0, Math.min(5, Math.round(baseSeedFT)));
  return Math.min(5, Math.max(0, normalised - planTransfersAtBase) + 1);
}

// ── Tests: is_current+1 transfer-window case (no is_next) ───────────────────

console.log('\nTest 10: is_current+1 — GW35 NOT in history (API not yet updated)');
{
  // GW35 deadline just passed; FPL history still only contains GW34 data.
  // nextGWft = FT for GW35 (the next unplayed GW after GW34), NOT for GW36.
  // planningGW = 36 (viewingGW = currentGW + 1 after the header fix).
  //
  // Old (broken): seeds GW36 directly with nextGWft = FT_for_GW35 (off by one).
  // New (correct): seeds GW35 with nextGWft, then rolls forward →
  //   GW36 = min(5, GW35_FT - 0_plan_transfers + 1).
  const historyData = {
    current: [
      { event: 33, event_transfers: 1 },  // used free transfer in GW33 → GW34 gets 1 FT
      { event: 34, event_transfers: 0 },  // 0 transfers in GW34 → GW35 gets 2 FTs
      // GW35 not yet in history
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW33: ft=1, 1 transfer → ft=min(5,max(0,1-1)+1)=1
  // GW34: ft=1, 0 transfers → ft=min(5,max(0,1-0)+1)=2
  // nextGWft=2 (for GW35)
  assert(ftResult.nextGWft === 2, `nextGWft=2 (FT for GW35, not GW36)`);

  const baseGW = 35;  // currentGW

  // Old (broken): seed GW36 with nextGWft=2 (GW35's FT) → GW36 shows 2 instead of 3
  const oldGW36 = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldGW36 === 2, `Old approach: GW36 seeded as 2 (actually FT for GW35 — off by one)`);

  // New (correct): seed GW35=2, rollover 0 plan transfers → GW36=3
  const newGW36 = computeIsCurrentPlusOneFT(ftResult, baseGW, 0);
  assert(newGW36 === 3, `New approach: seed GW35=2, rollover → GW36=3 ✓`);

  assert(oldGW36 !== newGW36, `Bug confirmed: old=2 (wrong), new=3 (correct)`);
}

console.log('\nTest 11: is_current+1 — GW35 in history, user made 0 real transfers');
{
  // Most common scenario: history includes GW35 (is_current), user made 0 transfers.
  // FT at start of GW35 = 1 → nextGWft = 2 (FT for GW36).
  const historyData = {
    current: [
      { event: 34, event_transfers: 0 },
      { event: 35, event_transfers: 0 },  // GW35 in history, 0 transfers
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 0 transfers → ft=2
  // GW35: ft=2, 0 transfers → ft=3
  // nextGWft = 3 (for GW36)
  // perGW[35] = 2

  const baseGW = 35;
  // New approach: seed GW35 = perGW[35] = 2, rollover 0 plan transfers → GW36=3
  const newGW36FT = computeIsCurrentPlusOneFT(ftResult, baseGW, 0);
  assert(newGW36FT === 3, `GW35 in history (perGW=2, 0 real transfers) → GW36=3 via rollover`);

  // Note: old approach (seed GW36 with nextGWft=3) gives same result here.
  const oldSeed = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldSeed === 3, `Old approach also gives 3 (consistent when 0 real transfers)`);
}

console.log('\nTest 12: is_current+1 — GW35 in history, user made 1 real transfer (plan has 0)');
{
  // User made 1 real transfer for GW35 before the deadline.
  // Real-world: FT for GW36 = 1 (spent the free transfer).
  // Plan-world (fresh import, 0 plan transfers at GW35): FT for GW36 = 2.
  // The planner should show plan-world FTs (2), not real-world (1).
  const historyData = {
    current: [
      { event: 34, event_transfers: 0 },
      { event: 35, event_transfers: 1 },  // GW35: 1 real transfer
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 0 transfers → ft=2
  // GW35: ft=2, 1 transfer → ft=min(5, max(0,2-1)+1) = 2
  // nextGWft = 2 (real-world FT for GW36)
  // perGW[35] = 2 (FT at start of GW35)

  const baseGW = 35;

  // Old (broken) approach: seed GW36 with nextGWft=2 — gives 2 (coincidental match)
  const oldSeed = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldSeed === 2, `Old approach seeds GW36 with nextGWft=2`);

  // New approach: seed GW35 = perGW[35] = 2, rollover 0 plan transfers → GW36=3
  const newGW36FT = computeIsCurrentPlusOneFT(ftResult, baseGW, 0);
  assert(newGW36FT === 3, `New approach: plan has 0 GW35 transfers → GW36=3 from perGW[35]=2`);
}

console.log('\nTest 13: is_current+1 — the user-reported scenario (1 FT, showed 1 not 2)');
{
  // The reported bug: user should have 2 FTs for GW36 but sees 1.
  // History ends at GW34 (GW35 not in history yet); user had 1 FT for GW35.
  // nextGWft = 1 (FT FOR GW35, not GW36).
  // Old broken code: seed GW36 with nextGWft=1 → shows 1. ✗
  // New correct code: seed GW35=1 (nextGWft), rollover 0 plan transfers → GW36=2. ✓
  const historyData = {
    current: [
      { event: 34, event_transfers: 1 },  // used 1 FT in GW34 → GW35 gets 1 FT
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: ft=1, 1 transfer → ft=min(5, max(0,1-1)+1) = 1
  // nextGWft = 1 (for GW35)

  const baseGW = 35;
  const planningGW = 36;

  // Old broken approach: seed planningGW(36) directly with nextGWft=1
  const oldSeed = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldSeed === 1, `Old broken approach: GW36 seeded as 1 (nextGWft=1 is actually for GW35)`);

  // New correct approach: seed baseGW(35) with nextGWft=1, rollover → GW36=2
  const newGW36FT = computeIsCurrentPlusOneFT(ftResult, baseGW, 0);
  assert(newGW36FT === 2, `New correct approach: seed GW35=1, rollover 0 plan transfers → GW36=2 ✓`);

  assert(oldSeed !== newGW36FT, `Bug was real: old=1, new=2 (old code showed 1 instead of 2)`);
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
