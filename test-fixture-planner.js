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
        total += isHome ? (f.team_h_difficulty || 3) : (f.team_a_difficulty || 3);
      } else {
        const opponentId = isHome ? f.team_a : f.team_h;
        const opponent = getTeamById(opponentId);

        if (mode === 'attack') {
          const oppDefStr = opponent
            ? (isHome
                ? (opponent.strength_defence_away || 1200)
                : (opponent.strength_defence_home || 1200))
            : 1200;
          total += oppDefStr;
        } else {
          // 'defence'
          const oppAttStr = opponent
            ? (isHome
                ? (opponent.strength_attack_away || 1200)
                : (opponent.strength_attack_home || 1200))
            : 1200;
          total += oppAttStr;
        }
      }
    }
  }

  if (fixtureCount === 0) return { score: Infinity, fixtureCount: 0 };
  return { score: total / fixtureCount, fixtureCount };
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
// Arsenal is home in GW1: team_h_difficulty = 2; average = 2/1 = 2
assert(arsGW1Overall.score === 2, 'Arsenal GW1 overall score = 2', `got ${arsGW1Overall.score}`);
assert(arsGW1Overall.fixtureCount === 1, 'Arsenal GW1 fixture count = 1', `got ${arsGW1Overall.fixtureCount}`);

const breGW1Overall = computeTeamScore(2, [1], fixturesByGW, 'overall');
// Brentford is away in GW1: team_a_difficulty = 4; average = 4
assert(breGW1Overall.score === 4, 'Brentford GW1 overall score = 4', `got ${breGW1Overall.score}`);

// Multi-GW: Arsenal GW1 (home, FDR 2) + GW2 (away, FDR 3)
const arsGW12Overall = computeTeamScore(1, [1, 2], fixturesByGW, 'overall');
// total = 2 + 3 = 5, count = 2, avg = 2.5
assert(arsGW12Overall.score === 2.5, 'Arsenal GW1+2 overall avg = 2.5', `got ${arsGW12Overall.score}`);

// Blank GW: Arsenal has no fixture in GW3
const arsGW3Overall = computeTeamScore(1, [3], fixturesByGW, 'overall');
assert(arsGW3Overall.score === Infinity, 'Arsenal GW3 (no fixture) = Infinity', `got ${arsGW3Overall.score}`);
assert(arsGW3Overall.fixtureCount === 0, 'Arsenal GW3 fixture count = 0', `got ${arsGW3Overall.fixtureCount}`);

// ─────────────────────────────────────────────
//  Test Suite 2: Attack mode
// ─────────────────────────────────────────────
console.log('\nTest Suite 2: Attack (opponent defence strength) sorting');

// GW1: Arsenal HOME vs Brentford.
//   Brentford is playing away → use Brentford.strength_defence_away = 1020
const arsGW1Attack = computeTeamScore(1, [1], fixturesByGW, 'attack');
assert(arsGW1Attack.score === 1020, 'Arsenal GW1 attack score = 1020 (BRE away defence)', `got ${arsGW1Attack.score}`);

// GW2: Arsenal AWAY at Chelsea.
//   Chelsea is playing home → use Chelsea.strength_defence_home = 1170
const arsGW2Attack = computeTeamScore(1, [2], fixturesByGW, 'attack');
assert(arsGW2Attack.score === 1170, 'Arsenal GW2 attack score = 1170 (CHE home defence)', `got ${arsGW2Attack.score}`);

// Lower attack score = easier to score against → Arsenal GW1 (1020) < GW2 (1170) ✓
assert(arsGW1Attack.score < arsGW2Attack.score, 'GW1 vs weaker defence gives lower attack score than GW2');

// ─────────────────────────────────────────────
//  Test Suite 3: Defence mode
// ─────────────────────────────────────────────
console.log('\nTest Suite 3: Defence (opponent attack strength) sorting');

// GW1: Arsenal HOME vs Brentford.
//   Brentford plays away → use Brentford.strength_attack_away = 1040
const arsGW1Defence = computeTeamScore(1, [1], fixturesByGW, 'defence');
assert(arsGW1Defence.score === 1040, 'Arsenal GW1 defence score = 1040 (BRE away attack)', `got ${arsGW1Defence.score}`);

// GW2: Arsenal AWAY at Chelsea.
//   Chelsea plays home → use Chelsea.strength_attack_home = 1180
const arsGW2Defence = computeTeamScore(1, [2], fixturesByGW, 'defence');
assert(arsGW2Defence.score === 1180, 'Arsenal GW2 defence score = 1180 (CHE home attack)', `got ${arsGW2Defence.score}`);

// Lower defence score = weaker attack to face → GW1 (1040) < GW2 (1180) ✓
assert(arsGW1Defence.score < arsGW2Defence.score, 'GW1 vs weaker attack gives lower defence score than GW2');

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
  if (a.score === Infinity && b.score === Infinity) return a.name.localeCompare(b.name);
  if (a.score === Infinity) return 1;
  if (b.score === Infinity) return -1;
  const diff = a.score - b.score;
  if (diff !== 0) return diff;
  return a.name.localeCompare(b.name);
});

// Arsenal: GW1 home FDR=2, GW2 away FDR=3 → avg 2.5  (2 fixtures)
// Brentford: GW1 away FDR=4, GW3 home FDR=2 → avg 3  (2 fixtures)
// Chelsea: GW2 home FDR=3, GW3 away FDR=5 → avg 4  (2 fixtures)
// Expected order: Arsenal (2.5) < Brentford (3) < Chelsea (4)
assert(scored[0].name === 'Arsenal', `1st = Arsenal (easiest run)`, `got ${scored[0].name} (${scored[0].score})`);
assert(scored[1].name === 'Brentford', `2nd = Brentford`, `got ${scored[1].name} (${scored[1].score})`);
assert(scored[2].name === 'Chelsea', `3rd = Chelsea (hardest run)`, `got ${scored[2].name} (${scored[2].score})`);

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
  if (a.score === Infinity && b.score === Infinity) return a.name.localeCompare(b.name);
  if (a.score === Infinity) return 1;
  if (b.score === Infinity) return -1;
  return a.score - b.score || a.name.localeCompare(b.name);
});
assert(scoredTie[0].name === 'Ace FC', 'Tie-break: Ace FC sorts before Zeal FC', `got ${scoredTie[0].name}`);

// ─────────────────────────────────────────────
//  Test Suite 5: GW hiding
// ─────────────────────────────────────────────
console.log('\nTest Suite 5: GW hiding (score over subset of weeks)');

// Without hiding: Arsenal GW1+2 average = 2.5
const withoutHide = computeTeamScore(1, [1, 2], fixturesByGW, 'overall');
assert(withoutHide.score === 2.5, 'Arsenal GW1+2 score = 2.5 (no hiding)', `got ${withoutHide.score}`);

// Hide GW2: only GW1 visible → Arsenal score = 2
const withHideGW2 = computeTeamScore(1, [1], fixturesByGW, 'overall');
assert(withHideGW2.score === 2, 'Arsenal GW1 only (GW2 hidden) score = 2', `got ${withHideGW2.score}`);

// Hide GW1: only GW2 visible → Arsenal score = 3
const withHideGW1 = computeTeamScore(1, [2], fixturesByGW, 'overall');
assert(withHideGW1.score === 3, 'Arsenal GW2 only (GW1 hidden) score = 3', `got ${withHideGW1.score}`);

// ─────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────
console.log(`\n=== Test Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
