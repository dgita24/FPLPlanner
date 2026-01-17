// test-defcon.js - Unit tests for DEFCON module
// This file validates the DEFCON data aggregation logic

// Mock test data
const mockElements = [
  { id: 1, element_type: 1, web_name: 'Goalkeeper 1' }, // GK - should not get DEFCON
  { id: 2, element_type: 2, web_name: 'Defender 1' },   // DEF - should get DEFCON
  { id: 3, element_type: 3, web_name: 'Midfielder 1' }, // MID - should get DEFCON
  { id: 4, element_type: 4, web_name: 'Forward 1' },    // FWD - should not get DEFCON
];

const mockLiveData = {
  elements: [
    {
      id: 1,
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 5 }
          ]
        }
      ]
    },
    {
      id: 2,
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 10 },
            { identifier: 'minutes', value: 90 }
          ]
        }
      ]
    },
    {
      id: 3,
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 8 }
          ]
        },
        {
          stats: [
            { identifier: 'defensive_contribution', value: 7 }
          ]
        }
      ]
    },
    {
      id: 4,
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 2 }
          ]
        }
      ]
    }
  ]
};

// Test 1: Extract defensive contribution from player data
console.log('Test 1: Extract defensive contribution');
function extractDefensiveContribution(playerData) {
  if (!playerData || !playerData.explain) return 0;
  
  let total = 0;
  for (const fixture of playerData.explain) {
    if (!fixture.stats) continue;
    for (const stat of fixture.stats) {
      if (stat.identifier === 'defensive_contribution' && typeof stat.value === 'number') {
        total += stat.value;
      }
    }
  }
  return total;
}

const player1 = mockLiveData.elements[0];
const defcon1 = extractDefensiveContribution(player1);
console.log(`  Player 1 (GK): ${defcon1} (expected: 5) - ${defcon1 === 5 ? '✓ PASS' : '✗ FAIL'}`);

const player2 = mockLiveData.elements[1];
const defcon2 = extractDefensiveContribution(player2);
console.log(`  Player 2 (DEF): ${defcon2} (expected: 10) - ${defcon2 === 10 ? '✓ PASS' : '✗ FAIL'}`);

const player3 = mockLiveData.elements[2];
const defcon3 = extractDefensiveContribution(player3);
console.log(`  Player 3 (MID, multiple fixtures): ${defcon3} (expected: 15) - ${defcon3 === 15 ? '✓ PASS' : '✗ FAIL'}`);

// Test 2: Filter eligible players (DEF and MID only)
console.log('\nTest 2: Filter eligible players');
const eligiblePlayers = new Set();
mockElements.forEach(player => {
  if (player.element_type === 2 || player.element_type === 3) {
    eligiblePlayers.add(player.id);
  }
});

console.log(`  Eligible player IDs: ${Array.from(eligiblePlayers).join(', ')}`);
console.log(`  Expected: 2, 3`);
console.log(`  ${eligiblePlayers.has(1) ? '✗' : '✓'} GK (id=1) excluded`);
console.log(`  ${eligiblePlayers.has(2) ? '✓' : '✗'} DEF (id=2) included`);
console.log(`  ${eligiblePlayers.has(3) ? '✓' : '✗'} MID (id=3) included`);
console.log(`  ${eligiblePlayers.has(4) ? '✗' : '✓'} FWD (id=4) excluded`);

// Test 3: Aggregate DEFCON for eligible players only
console.log('\nTest 3: Aggregate DEFCON for eligible players only');
const defconTotals = new Map();

mockLiveData.elements.forEach(playerData => {
  const playerId = playerData.id;
  
  if (!eligiblePlayers.has(playerId)) return;

  const defcon = extractDefensiveContribution(playerData);
  if (defcon > 0) {
    const current = defconTotals.get(playerId) || 0;
    defconTotals.set(playerId, current + defcon);
  }
});

console.log(`  Aggregated DEFCON totals:`);
console.log(`    Player 1 (GK): ${defconTotals.get(1) || 0} (expected: 0) - ${(defconTotals.get(1) || 0) === 0 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 2 (DEF): ${defconTotals.get(2) || 0} (expected: 10) - ${defconTotals.get(2) === 10 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 3 (MID): ${defconTotals.get(3) || 0} (expected: 15) - ${defconTotals.get(3) === 15 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 4 (FWD): ${defconTotals.get(4) || 0} (expected: 0) - ${(defconTotals.get(4) || 0) === 0 ? '✓ PASS' : '✗ FAIL'}`);

// Test 4: Merge DEFCON into elements
console.log('\nTest 4: Merge DEFCON into elements');
function mergeDefconIntoElements(elements, defconData) {
  elements.forEach(player => {
    if (player.element_type === 2 || player.element_type === 3) {
      player.defensive_contribution = defconData.get(player.id) || 0;
    } else {
      player.defensive_contribution = 0;
    }
  });
}

mergeDefconIntoElements(mockElements, defconTotals);

mockElements.forEach(player => {
  const expected = player.element_type === 2 ? 10 : player.element_type === 3 ? 15 : 0;
  const match = player.defensive_contribution === expected;
  console.log(`  ${player.web_name}: ${player.defensive_contribution} (expected: ${expected}) - ${match ? '✓ PASS' : '✗ FAIL'}`);
});

console.log('\n=== All Tests Complete ===');
