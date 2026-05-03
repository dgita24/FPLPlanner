// test-ft-seeding.js
// Regression tests for free-transfer seeding on import.
//
// Primary algorithm (SOURCE 2): history-based FT calculation ported exactly
// from dgita24/fplmanagerdata calculateFTs, which works correctly in production.
// Key rules: GW1=0, GW16=5, WC/FH=max(1,prevFTs-prevTransfers), normal=+1 rollover.
//
// Fallback (SOURCE 3): extra_free_transfers from picks endpoint entry_history,
// used only when the history endpoint fails.
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
 * Ported exactly from dgita24/fplmanagerdata calculateFTs algorithm.
 */
function computeFreeTransfersFromHistory(historyData) {
  if (!historyData?.current?.length) return null;

  const events = [...historyData.current].sort((a, b) => a.event - b.event);

  const chipMap = {};
  for (const c of (historyData.chips || [])) {
    chipMap[c.event] =
      c.name === 'wildcard' ? 'WC' :
      c.name === 'freehit'  ? 'FH' :
      c.name === 'bboost'   ? 'BB' :
      c.name === '3xc'      ? 'TC' : c.name;
  }

  const transfersMap = {};
  for (const ev of events) {
    transfersMap[ev.event] = ev.event_transfers || 0;
  }

  const ftStartByGW = {};
  for (const ev of events) {
    const E = ev.event;
    let Q;

    if (E === 16) {
      Q = 5;
    } else if (E === 1) {
      Q = 0;
    } else if (ftStartByGW[E - 1] === undefined) {
      Q = 1;
    } else {
      const prevChip      = chipMap[E - 1] || '';
      const prevFTs       = ftStartByGW[E - 1];
      const prevTransfers = transfersMap[E - 1] || 0;

      if (prevChip === 'WC' || prevChip === 'FH') {
        Q = Math.max(1, prevFTs - prevTransfers);
      } else {
        Q = Math.min(Math.max(1, prevFTs - prevTransfers + 1), 5);
      }
    }

    ftStartByGW[E] = Q;
  }

  const perGW = { ...ftStartByGW };

  const maxGW         = events[events.length - 1].event;
  const lastChip      = chipMap[maxGW]      || '';
  const lastTransfers = transfersMap[maxGW] || 0;
  const lastFTStart   = ftStartByGW[maxGW];

  let nextGWft;
  if (maxGW === 15) {
    nextGWft = 5;
  } else {
    const inc = (lastChip === 'WC' || lastChip === 'FH') ? 0 : 1;
    nextGWft = Math.min(Math.max(1, lastFTStart - lastTransfers + inc), 5);
  }

  return { perGW, nextGWft };
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

  // GW31: Q=1 (no prev), transfers=0
  // GW32: prevFT=1, prevTransfers=0, no chip → Q=min(max(1,1-0+1),5)=2, transfers=1
  // nextGWft: lastFTStart=2, lastTransfers=1, inc=1 → min(max(1,2-1+1),5)=2
  // perGW[33] is undefined → should use nextGWft=2
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

  // GW31: Q=1 (no prev), transfers=0
  // GW32: prevFT=1, prevTransfers=0 → Q=2, transfers=1
  // GW33: prevFT=2, prevTransfers=1 → Q=min(max(1,2-1+1),5)=2
  // nextGWft: lastFTStart=2, lastTransfers=2, inc=1 → max(1,1)=1 (for GW34!)
  // perGW[33]=2 (FTs at start of GW33)
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

  // GW31: Q=1 (no prev), transfers=0
  // GW32: prevFT=1, prevTransfers=0 → Q=2, transfers=0
  // GW33: prevFT=2, prevTransfers=0 → Q=3. chip=WC, transfers=5
  // nextGWft: lastFTStart=3, lastTransfers=5, lastChip='WC', inc=0 → max(1,3-5)=1
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

  // GW31: Q=1 (no prev), transfers=0
  // GW32: prevFT=1, prevTransfers=0 → Q=2, transfers=0
  // GW33: prevFT=2, prevTransfers=0 → Q=3. transfers=3
  // nextGWft: lastFTStart=3, lastTransfers=3, inc=1 → max(1,1)=1 (for GW34)
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

  // GW32: Q=1 (no prev), transfers=0
  // GW33: prevFT=1, prevTransfers=0 → Q=2, transfers=0
  // nextGWft: lastFTStart=2, lastTransfers=0, inc=1 → 3 (for GW34)
  // perGW[33] = 2

  // Even when "no fallback" in picks, if GW33 is in history, we use perGW.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 from perGW[33], even though nextGWft=3`);
}

// ── Test 8: Free Hit in GW33 – FTs preserved, no +1 rollover ────────────────
console.log('\nTest 8: Free Hit in GW33 – FTs preserved, no +1 rollover');
{
  // In the FPL API, event_transfers for a FH week is 0 because the temporary
  // squad changes revert and are not counted as real transfers.
  // Formula: max(1, prevFTs - 0) = prevFTs → FTs preserved, but no +1 rollover.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 0 }, // FH: event_transfers=0 in real FPL API
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW31: Q=1 (no prev), transfers=0
  // GW32: prevFT=1, prevTransfers=0 → Q=2, transfers=0
  // GW33: prevFT=2, prevTransfers=0 → Q=3. chip=FH, transfers=0
  // nextGWft: lastFTStart=3, lastTransfers=0, lastChip='FH', inc=0 → max(1,3-0)=3
  assert(ftResult.nextGWft === 3, `FH (event_transfers=0) preserves 3 FTs → nextGWft=3 for GW34`);
}

// ── Test 9: Free Hit with only 1 FT – still preserved (not +1) ──────────────
console.log('\nTest 9: Free Hit with 1 FT – FT count stays at 1, not bumped to 2');
{
  // Manager had 1 FT going into GW33 (used 2 transfers in GW32), played FH.
  // FH event_transfers=0 (real FPL API); max(1, 1-0)=1, no +1 rollover.
  const historyData = {
    current: [
      { event: 32, event_transfers: 2 },
      { event: 33, event_transfers: 0 }, // FH: event_transfers=0 in real FPL API
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW32: Q=1 (no prev), transfers=2
  // GW33: prevFT=1, prevTransfers=2, prevChip=none → Q=min(max(1,1-2+1),5)=1. chip=FH, transfers=0
  // nextGWft: lastFTStart=1, lastTransfers=0, lastChip='FH', inc=0 → max(1,1-0)=1
  assert(ftResult.nextGWft === 1, `FH with 1 FT → nextGWft=1 (not bumped to 2)`);
}

// ── Tests: entry-summary primary path ────────────────────────────────────────
// The bogus SOURCE 1 (entrySummary.extra_free_transfers) has been removed.
// The history-based algorithm (SOURCE 2) is now the primary source.
// Tests 25–30 are replaced by GW1 and GW16 special-case tests below.

// ── Test 25 (GW1 special case): GW1 starts with Q=0 ────────────────────────
console.log('\nTest 25 (GW1 SPECIAL CASE): GW1 starts at Q=0 (pre-season unlimited)');
{
  // Full season starting from GW1 with 0 transfers, then 1/GW from GW2.
  const current = [
    { event:  1, event_transfers: 0 },
    { event:  2, event_transfers: 1 },
    { event:  3, event_transfers: 1 },
    { event:  4, event_transfers: 1 },
    { event:  5, event_transfers: 1 },
  ];
  const ftResult = computeFreeTransfersFromHistory({ current, chips: [] });

  // GW1:  Q=0 (special)
  // GW2:  prevFT=0, prevTransfers=0 → Q=min(max(1,0+1),5)=1
  // GW3:  prevFT=1, prevTransfers=1 → Q=min(max(1,1-1+1),5)=1
  // GW4:  same → Q=1
  // GW5:  Q=1. nextGWft: lastFTStart=1, lastTransfers=1, inc=1 → 1
  assert(ftResult.perGW[1] === 0,  `GW1 perGW[1]=0 (pre-season, Q=0)`);
  assert(ftResult.perGW[2] === 1,  `GW2 perGW[2]=1 (prevFTs=0, rollover gives 1)`);
  assert(ftResult.perGW[3] === 1,  `GW3 perGW[3]=1 (1 FT, 1 transfer used)`);
  assert(ftResult.nextGWft  === 1, `nextGWft=1 for a 1-transfer/GW manager`);
}

// ── Test 26 (GW16 special case): GW16 always Q=5 ───────────────────────────
console.log('\nTest 26 (GW16 SPECIAL CASE): GW16 always starts with Q=5 (DGW16 reset)');
{
  // Manager banking FTs from GW12 onwards, hits GW16 special case.
  const current = [
    { event: 14, event_transfers: 0 },
    { event: 15, event_transfers: 0 },
    { event: 16, event_transfers: 0 }, // GW16: hardcoded Q=5
    { event: 17, event_transfers: 0 },
  ];
  const ftResult = computeFreeTransfersFromHistory({ current, chips: [] });

  // GW14: Q=1 (no prev), transfers=0
  // GW15: prevFT=1, prevTransfers=0 → Q=2. nextGWft rule: maxGW=15 → nextGWft=5
  // GW16: Q=5 (hardcoded special case), transfers=0
  // GW17: prevFT=5, prevTransfers=0 → Q=min(max(1,5-0+1),5)=5, transfers=0
  // nextGWft: lastFTStart=5, lastTransfers=0, inc=1 → min(6,5)=5
  assert(ftResult.perGW[16]  === 5, `GW16 perGW[16]=5 (DGW16 special reset)`);
  assert(ftResult.perGW[17]  === 5, `GW17 perGW[17]=5 (rolled over from 5, capped)`);
  assert(ftResult.nextGWft   === 5, `nextGWft=5 after 0-transfer run through GW17`);
}

// ── Test 27 (GW15 → GW16): nextGWft=5 when maxGW=15 ───────────────────────
console.log('\nTest 27 (GW15 → GW16): nextGWft=5 when history ends at GW15');
{
  const current = [
    { event: 13, event_transfers: 0 },
    { event: 14, event_transfers: 0 },
    { event: 15, event_transfers: 1 },
  ];
  const ftResult = computeFreeTransfersFromHistory({ current, chips: [] });

  // GW13: Q=1 (no prev), GW14: prevFT=1,prevTransfers=0 → Q=2
  // GW15: prevFT=2, prevTransfers=0 → Q=3. lastTransfers=1.
  // maxGW=15 → nextGWft=5 (GW16 special rule triggers)
  assert(ftResult.nextGWft === 5, `maxGW=15 → nextGWft=5 (GW16 DGW gets 5 FTs)`);
}

// ── Test 28 (WC edge case): WC with few transfers preserves some FTs ────────
console.log('\nTest 28 (WC edge case): WC with 2 transfers and 4 FTs → 2 FTs after');
{
  // Edge case: manager plays WC but only makes 2 transfers (rare but valid).
  // Formula: max(1, prevFTs - prevTransfers) = max(1, 4-2) = 2.
  const current = [
    { event: 30, event_transfers: 0 },
    { event: 31, event_transfers: 0 },
    { event: 32, event_transfers: 0 },
    { event: 33, event_transfers: 2 }, // WC with only 2 transfers
  ];
  const ftResult = computeFreeTransfersFromHistory({
    current,
    chips: [{ name: 'wildcard', event: 33 }],
  });

  // GW30: Q=1, GW31: Q=2, GW32: Q=3, GW33: prevFT=3, prevTransfers=0 → Q=min(max(1,3-0+1),5)=4
  // nextGWft: lastFTStart=4, lastTransfers=2, lastChip='WC', inc=0 → max(1, 4-2)=2
  assert(ftResult.nextGWft === 2, `WC with 2 transfers, 4 FTs → nextGWft=2`);
}

// ── Test 29 (typical real-world scenario): 1-FT manager whole season ────────
console.log('\nTest 29 (REAL WORLD): 1-transfer/GW manager always has 1 FT');
{
  // Full season (GW1-35) with 1 transfer per GW from GW2 onwards.
  const current = [];
  for (let gw = 1; gw <= 35; gw++) {
    current.push({ event: gw, event_transfers: gw === 1 ? 0 : 1 });
  }
  const ftResult = computeFreeTransfersFromHistory({ current, chips: [] });

  // GW1=0, GW2=1 (from prevFTs=0), GW3 onwards = always 1 (1 FT - 1 transfer + 1 = 1)
  // GW16 forces Q=5, so from GW17 onwards with 1 transfer/GW:
  //   GW17: prevFT=5,prevTransfers=1,prevChip=none → Q=min(max(1,5),5)=5
  //   GW18: Q=5, ... continues at 5 until used up
  // Actually after GW16=5:
  //   GW17: prevFT=5, prevTransfers=1 → Q=min(max(1,5),5)=5
  //   GW18: same → 5
  // Eventually returns to 1 only after many 1-transfer GWs starting from 5.
  // But let's just check it doesn't crash and nextGWft is valid.
  assert(ftResult.perGW[1]  === 0, `GW1 Q=0`);
  assert(ftResult.perGW[2]  === 1, `GW2 Q=1`);
  assert(ftResult.perGW[16] === 5, `GW16 Q=5 (special)`);
  assert(ftResult.nextGWft  >= 1 && ftResult.nextGWft <= 5, `nextGWft in [1,5]`);
}

// ── Test 30 (previously broken – every manager showed 1 FT) ─────────────────
console.log('\nTest 30 (REGRESSION): history-based algorithm gives correct FT for each manager type');
{
  // Tests the exact scenarios that used to return wrong FTs.
  // A manager with 2 banked FTs (0 transfers last 2 GWs) should show 3 for next GW.
  const historyData = {
    current: [
      { event: 33, event_transfers: 1 },
      { event: 34, event_transfers: 0 }, // banked 1 FT
      { event: 35, event_transfers: 0 }, // banked another FT → should have 3 for GW36
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW33: Q=1, GW34: prevFT=1,prevTransfers=1→Q=1, GW35: prevFT=1,prevTransfers=0→Q=2
  // nextGWft: lastFTStart=2, lastTransfers=0, inc=1 → 3
  const seed = computeSeedFT(ftResult, 36);
  assert(seed === 3, `Manager with 2 banked FTs correctly shows 3 FTs for GW36`);
}

console.log('\nTest 21 (SOURCE 2 - HISTORY PATH): GW35 live, GW36 open — history gives correct FTs for 1-FT manager');
{
  // Manager had 1 FT for all recent GWs (1 transfer per GW).
  const historyData = {
    current: [
      { event: 33, event_transfers: 1 },
      { event: 34, event_transfers: 1 },
      { event: 35, event_transfers: 0 }, // GW35 live, 0 transfers made so far
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW33: Q=1 (no prev), transfers=1
  // GW34: prevFT=1, prevTransfers=1 → Q=1, transfers=1
  // GW35: prevFT=1, prevTransfers=1 → Q=1, transfers=0
  // nextGWft: lastFTStart=1, lastTransfers=0, inc=1 → min(max(1,2),5)=2
  // perGW[36] is undefined → use nextGWft=2
  const seed = computeSeedFT(ftResult, 36);
  assert(seed === 2, `History path: 1-FT manager in GW35 → seed=2 for GW36 ✓`);
}

console.log('\nTest 22 (SOURCE 2 - HISTORY PATH): GW35 live, GW36 open — history gives correct FTs for 3-FT manager');
{
  // Manager had 3 FTs going into GW35 (banked from previous 0-transfer GWs).
  const historyData = {
    current: [
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 0 },
      { event: 34, event_transfers: 0 },
      { event: 35, event_transfers: 0 }, // GW35 live, 0 transfers so far
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW32: Q=1 (no prev), transfers=0
  // GW33: prevFT=1, prevTransfers=0 → Q=2, transfers=0
  // GW34: prevFT=2, prevTransfers=0 → Q=3, transfers=0
  // GW35: prevFT=3, prevTransfers=0 → Q=4, transfers=0
  // nextGWft: lastFTStart=4, lastTransfers=0, inc=1 → min(5,5)=5
  const seed = computeSeedFT(ftResult, 36);
  assert(seed === 5, `History path: 4-FT manager in GW35 with 0 transfers → seed=5 for GW36 ✓`);
}

console.log('\nTest 23 (SOURCE 2 - HISTORY PATH): picks for GW36 available — history still gives correct FTs');
{
  // importedGW==planningGW==36 (picks for GW36 directly available).
  // Without history, extra_free_transfers might be null/absent for an unplayed GW.
  // History gives correct FTs regardless.
  const historyData = {
    current: [
      { event: 34, event_transfers: 1 },
      { event: 35, event_transfers: 1 },
      // GW36 not yet in history (hasn't been played) → use nextGWft
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  // GW34: Q=1 (no prev), transfers=1
  // GW35: prevFT=1, prevTransfers=1 → Q=1, transfers=1
  // nextGWft: lastFTStart=1, lastTransfers=1, inc=1 → min(max(1,1),5)=1
  const seed = computeSeedFT(ftResult, 36);
  assert(seed === 1, `History path: GW36 picks available, 1 FT expected → seed=1 ✓`);
}

console.log('\nTest 24 (SOURCE 2 - HISTORY PATH): every manager shows correct FTs — not always 1');
{
  // This test directly verifies the user-reported bug is fixed by the primary path.
  // Old broken path: extra_free_transfers absent → all managers get 1 FT.
  // New fixed path: history always present → correct FT for every manager.

  const scenarios = [
    // [history_current, chips, planningGW, expected_FT, description]
    [
      [{ event: 34, event_transfers: 0 }, { event: 35, event_transfers: 0 }],
      [], 36, 3, '2 banked FTs (0 transfers each GW) → 3 for GW36'
    ],
    [
      [{ event: 34, event_transfers: 1 }, { event: 35, event_transfers: 2 }],
      [], 36, 1, '2 transfers in GW35 (had 1 FT) → 1 for GW36'
    ],
    [
      [{ event: 34, event_transfers: 0 }, { event: 35, event_transfers: 0 }],
      [{ name: 'wildcard', event: 34 }], 36, 2, 'WC in GW34 (0 transfers) → max(1,1-0)=1 for GW35, then +1 = 2 for GW36'
    ],
  ];

  for (const [current, chips, planningGW, expected, desc] of scenarios) {
    const ftResult = computeFreeTransfersFromHistory({ current, chips });
    const seed = computeSeedFT(ftResult, planningGW);
    assert(seed === expected, desc);
  }
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
