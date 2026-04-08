// test-fixture-planner.js - Unit tests for the fixture planner sorting logic
// Tests computeTeamScore across overall / attack / defence modes.

// ─────────────────────────────────────────────
//  Minimal stubs so we can run in plain Node.js
// ─────────────────────────────────────────────

// Stub state (teams with strength fields similar to bootstrap-static)
const mockState = {
  teams: [
    {
      id: 1, name: 'Arsenal', short_name: 'ARS', code: 3,
      strength_overall_home: 1280, strength_overall_away: 1230,
      strength_attack_home: 1260, strength_attack_away: 1200,
      strength_defence_home: 1240, strength_defence_away: 1190,
    },
    {
      id: 2, name: 'Brentford', short_name: 'BRE', code: 94,
      strength_overall_home: 1100, strength_overall_away: 1050,
      strength_attack_home: 1080, strength_attack_away: 1040,
      strength_defence_home: 1060, strength_defence_away: 1020,
    },
    {
      id: 3, name: 'Chelsea', short_name: 'CHE', code: 8,
      strength_overall_home: 1200, strength_overall_away: 1160,
      strength_attack_home: 1180, strength_attack_away: 1120,
      strength_defence_home: 1170, strength_defence_away: 1110,
    },
  ],
};

// Minimal global stub so the module-under-test can use state
global.state = mockState;

// ─────────────────────────────────────────────
//  Inline the pure function (no ES-module imports needed for unit tests)
// ─────────────────────────────────────────────

function getTeamById(teamId) {
  return mockState.teams.find(t => t.id === teamId) || null;
}

/**
 * Pure copy of computeTeamScore from fixture-planner.js (kept in sync manually).
 * Update this when the production function changes.
 */
function computeTeamScore(teamId, visibleGWs, fixturesByGW, mode) {
  let total = 0;
  let fixtureCount = 0;

  for (const gw of visibleGWs) {
    const gwFixtures = fixturesByGW.get(gw) || [];
    for (const f of gwFixtures) {
      const isHome = f.team_h === teamId;
      const isAway = f.team_a === teamId;
      if (!isHome && !isAway) continue;

      fixtureCount++;

      if (mode === 'overall') {
        const difficulty = isHome ? (f.team_h_difficulty || 3) : (f.team_a_difficulty || 3);
        total += (6 - difficulty);
      } else {
        const opponentId = isHome ? f.team_a : f.team_h;
        const opponent = getTeamById(opponentId);

        if (mode === 'attack') {
          const oppDefStr = opponent
            ? (isHome
                ? (opponent.strength_defence_away || 1200)
                : (opponent.strength_defence_home || 1200))
            : 1200;
          total += (1500 - oppDefStr);
        } else {
          // 'defence'
          const oppAttStr = opponent
            ? (isHome
                ? (opponent.strength_attack_away || 1200)
                : (opponent.strength_attack_home || 1200))
            : 1200;
          total += (1500 - oppAttStr);
        }
      }
    }
  }

  if (fixtureCount === 0) return { score: -Infinity, fixtureCount: 0 };
  return { score: total, fixtureCount };
}

// ─────────────────────────────────────────────
//  Test helpers
// ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ✓ PASS  ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ─────────────────────────────────────────────
//  Test fixtures (GW data)
// ─────────────────────────────────────────────

// GW1: Arsenal (home, FDR=2) vs Brentford (away, FDR=4)
// GW2: Chelsea (home, FDR=3) vs Arsenal (away, FDR=3)
// GW3: Brentford (home, FDR=2) vs Chelsea (away, FDR=5)
const fixturesByGW = new Map([
  [1, [{ team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 4, kickoff_time: '2024-08-17T12:30:00Z' }]],
  [2, [{ team_h: 3, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: '2024-08-24T12:30:00Z' }]],
  [3, [{ team_h: 2, team_a: 3, team_h_difficulty: 2, team_a_difficulty: 5, kickoff_time: '2024-08-31T12:30:00Z' }]],
]);

// ─────────────────────────────────────────────
//  Test Suite 1: Overall mode
// ─────────────────────────────────────────────
console.log('\nTest Suite 1: Overall (FDR-based) sorting');

const arsGW1Overall = computeTeamScore(1, [1], fixturesByGW, 'overall');
// Arsenal is home in GW1: team_h_difficulty = 2; ease = 6 - 2 = 4
assert(arsGW1Overall.score === 4, 'Arsenal GW1 overall score = 4', `got ${arsGW1Overall.score}`);
assert(arsGW1Overall.fixtureCount === 1, 'Arsenal GW1 fixture count = 1', `got ${arsGW1Overall.fixtureCount}`);

const breGW1Overall = computeTeamScore(2, [1], fixturesByGW, 'overall');
// Brentford is away in GW1: team_a_difficulty = 4; ease = 6 - 4 = 2
assert(breGW1Overall.score === 2, 'Brentford GW1 overall score = 2', `got ${breGW1Overall.score}`);

// Multi-GW: Arsenal GW1 (home, FDR 2) + GW2 (away, FDR 3)
const arsGW12Overall = computeTeamScore(1, [1, 2], fixturesByGW, 'overall');
// ease GW1 = 6-2 = 4, ease GW2 = 6-3 = 3, total = 7
assert(arsGW12Overall.score === 7, 'Arsenal GW1+2 overall ease sum = 7', `got ${arsGW12Overall.score}`);

// Blank GW: Arsenal has no fixture in GW3
const arsGW3Overall = computeTeamScore(1, [3], fixturesByGW, 'overall');
assert(arsGW3Overall.score === -Infinity, 'Arsenal GW3 (no fixture) = -Infinity', `got ${arsGW3Overall.score}`);
assert(arsGW3Overall.fixtureCount === 0, 'Arsenal GW3 fixture count = 0', `got ${arsGW3Overall.fixtureCount}`);

// ─────────────────────────────────────────────
//  Test Suite 2: Attack mode
// ─────────────────────────────────────────────
console.log('\nTest Suite 2: Attack (opponent defence strength) sorting');

// GW1: Arsenal HOME vs Brentford.
//   Brentford is playing away → use Brentford.strength_defence_away = 1020
//   ease = 1500 - 1020 = 480
const arsGW1Attack = computeTeamScore(1, [1], fixturesByGW, 'attack');
assert(arsGW1Attack.score === 480, 'Arsenal GW1 attack score = 480 (1500 - BRE away defence 1020)', `got ${arsGW1Attack.score}`);

// GW2: Arsenal AWAY at Chelsea.
//   Chelsea is playing home → use Chelsea.strength_defence_home = 1170
//   ease = 1500 - 1170 = 330
const arsGW2Attack = computeTeamScore(1, [2], fixturesByGW, 'attack');
assert(arsGW2Attack.score === 330, 'Arsenal GW2 attack score = 330 (1500 - CHE home defence 1170)', `got ${arsGW2Attack.score}`);

// Higher attack ease score = easier to score → Arsenal GW1 (480) > GW2 (330) ✓
assert(arsGW1Attack.score > arsGW2Attack.score, 'GW1 vs weaker defence gives higher attack score than GW2');

// ─────────────────────────────────────────────
//  Test Suite 3: Defence mode
// ─────────────────────────────────────────────
console.log('\nTest Suite 3: Defence (opponent attack strength) sorting');

// GW1: Arsenal HOME vs Brentford.
//   Brentford plays away → use Brentford.strength_attack_away = 1040
//   ease = 1500 - 1040 = 460
const arsGW1Defence = computeTeamScore(1, [1], fixturesByGW, 'defence');
assert(arsGW1Defence.score === 460, 'Arsenal GW1 defence score = 460 (1500 - BRE away attack 1040)', `got ${arsGW1Defence.score}`);

// GW2: Arsenal AWAY at Chelsea.
//   Chelsea plays home → use Chelsea.strength_attack_home = 1180
//   ease = 1500 - 1180 = 320
const arsGW2Defence = computeTeamScore(1, [2], fixturesByGW, 'defence');
assert(arsGW2Defence.score === 320, 'Arsenal GW2 defence score = 320 (1500 - CHE home attack 1180)', `got ${arsGW2Defence.score}`);

// Higher defence ease score = weaker attack to face → GW1 (460) > GW2 (320) ✓
assert(arsGW1Defence.score > arsGW2Defence.score, 'GW1 vs weaker attack gives higher defence score than GW2');

// ─────────────────────────────────────────────
//  Test Suite 4: Sorting determinism
// ─────────────────────────────────────────────
console.log('\nTest Suite 4: Sorting determinism and stability');

// Score all three teams over GW1+2+3 in overall mode and verify order
const teams = [
  { id: 1, name: 'Arsenal' },
  { id: 2, name: 'Brentford' },
  { id: 3, name: 'Chelsea' },
];

const visibleGWs = [1, 2, 3];
const scored = teams.map(t => ({
  ...t,
  ...computeTeamScore(t.id, visibleGWs, fixturesByGW, 'overall'),
}));
scored.sort((a, b) => {
  if (a.score === -Infinity && b.score === -Infinity) return a.name.localeCompare(b.name);
  if (a.score === -Infinity) return 1;
  if (b.score === -Infinity) return -1;
  const diff = b.score - a.score; // descending: highest ease first
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
});

// Arsenal:   GW1 home FDR=2 (ease=4), GW2 away FDR=3 (ease=3) → sum = 7
// Brentford: GW1 away FDR=4 (ease=2), GW3 home FDR=2 (ease=4) → sum = 6
// Chelsea:   GW2 home FDR=3 (ease=3), GW3 away FDR=5 (ease=1) → sum = 4
// Expected order descending: Arsenal (7), Brentford (6), Chelsea (4)
assert(scored[0].name === 'Arsenal', `1st = Arsenal (highest ease)`, `got ${scored[0].name} (${scored[0].score})`);
assert(scored[1].name === 'Brentford', `2nd = Brentford`, `got ${scored[1].name} (${scored[1].score})`);
assert(scored[2].name === 'Chelsea', `3rd = Chelsea (lowest ease)`, `got ${scored[2].name} (${scored[2].score})`);

// Stable tie-break: Two teams with identical scores should be sorted alphabetically
const tieFixtures = new Map([
  [1, [
    { team_h: 1, team_a: 2, team_h_difficulty: 3, team_a_difficulty: 3 },
  ]],
]);
const zTeam = { id: 99, name: 'Zeal FC' };
const aTeam = { id: 100, name: 'Ace FC' };
// Both get FDR 3 in GW1 (team 1 is home, team 2 is away)
// but these two teams aren't in the fixture — blank GW → Infinity → sorted alphabetically
const scoredTie = [
  { ...zTeam, ...computeTeamScore(99, [1], tieFixtures, 'overall') },
  { ...aTeam, ...computeTeamScore(100, [1], tieFixtures, 'overall') },
];
scoredTie.sort((a, b) => {
  if (a.score === -Infinity && b.score === -Infinity) return a.name.localeCompare(b.name);
  if (a.score === -Infinity) return 1;
  if (b.score === -Infinity) return -1;
  return b.score - a.score || a.name.localeCompare(b.name);
});
assert(scoredTie[0].name === 'Ace FC', 'Tie-break: Ace FC sorts before Zeal FC', `got ${scoredTie[0].name}`);

// ─────────────────────────────────────────────
//  Test Suite 5: GW hiding
// ─────────────────────────────────────────────
console.log('\nTest Suite 5: GW hiding (score over subset of weeks)');

// Without hiding: Arsenal GW1+2 ease sum = 7
const withoutHide = computeTeamScore(1, [1, 2], fixturesByGW, 'overall');
assert(withoutHide.score === 7, 'Arsenal GW1+2 score = 7 (no hiding)', `got ${withoutHide.score}`);

// Hide GW2: only GW1 visible → Arsenal ease = 4 (6-2)
const withHideGW2 = computeTeamScore(1, [1], fixturesByGW, 'overall');
assert(withHideGW2.score === 4, 'Arsenal GW1 only (GW2 hidden) score = 4', `got ${withHideGW2.score}`);

// Hide GW1: only GW2 visible → Arsenal ease = 3 (6-3)
const withHideGW1 = computeTeamScore(1, [2], fixturesByGW, 'overall');
assert(withHideGW1.score === 3, 'Arsenal GW2 only (GW1 hidden) score = 3', `got ${withHideGW1.score}`);

// ─────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────
console.log(`\n=== Test Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
