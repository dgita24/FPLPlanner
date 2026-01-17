// test-defcon.js - Unit tests for DEFCON module
// This file validates the DEFCON points calculation logic

// Mock test data
const mockElements = [
  { id: 1, element_type: 1, web_name: 'Goalkeeper 1' }, // GK - should not get DEFCON
  { id: 2, element_type: 2, web_name: 'Defender 1' },   // DEF - should get DEFCON
  { id: 3, element_type: 3, web_name: 'Midfielder 1' }, // MID - should get DEFCON
  { id: 4, element_type: 4, web_name: 'Forward 1' },    // FWD - should get DEFCON
];

const mockLiveData = {
  elements: [
    {
      id: 1, // GK with 5 contributions (doesn't qualify)
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 5 }
          ]
        }
      ]
    },
    {
      id: 2, // DEF with 10 contributions in one fixture (2 points)
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
      id: 3, // MID with two fixtures: 8 (no points) + 14 (2 points) = 2 points total
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 8 }
          ]
        },
        {
          stats: [
            { identifier: 'defensive_contribution', value: 14 }
          ]
        }
      ]
    },
    {
      id: 4, // FWD with 12 contributions in one fixture (2 points)
      explain: [
        {
          stats: [
            { identifier: 'defensive_contribution', value: 12 }
          ]
        }
      ]
    }
  ]
};

// Test 1: Calculate DEFCON points per player type
console.log('Test 1: Calculate DEFCON points per player type');

function calculateDefconPoints(playerData, elementType) {
  if (!playerData || !playerData.explain) return 0;
  
  const threshold = elementType === 2 ? 10 : 12; // DEF needs 10, MID/FWD need 12
  let totalPoints = 0;
  
  for (const fixture of playerData.explain) {
    if (!fixture.stats) continue;
    
    let fixtureContributions = 0;
    for (const stat of fixture.stats) {
      if (stat.identifier === 'defensive_contribution' && typeof stat.value === 'number') {
        fixtureContributions += stat.value;
      }
    }
    
    if (fixtureContributions >= threshold) {
      totalPoints += 2;
    }
  }
  
  return totalPoints;
}

const player1 = mockLiveData.elements[0]; // GK
const defcon1 = calculateDefconPoints(player1, 1);
console.log(`  Player 1 (GK, 5 contributions): ${defcon1} (expected: 0) - ${defcon1 === 0 ? '✓ PASS' : '✗ FAIL'}`);

const player2 = mockLiveData.elements[1]; // DEF
const defcon2 = calculateDefconPoints(player2, 2);
console.log(`  Player 2 (DEF, 10 contributions): ${defcon2} (expected: 2) - ${defcon2 === 2 ? '✓ PASS' : '✗ FAIL'}`);

const player3 = mockLiveData.elements[2]; // MID
const defcon3 = calculateDefconPoints(player3, 3);
console.log(`  Player 3 (MID, 8+14 contributions in 2 fixtures): ${defcon3} (expected: 2) - ${defcon3 === 2 ? '✓ PASS' : '✗ FAIL'}`);

const player4 = mockLiveData.elements[3]; // FWD
const defcon4 = calculateDefconPoints(player4, 4);
console.log(`  Player 4 (FWD, 12 contributions): ${defcon4} (expected: 2) - ${defcon4 === 2 ? '✓ PASS' : '✗ FAIL'}`);

// Test 2: Filter eligible players (DEF, MID, FWD - not GK)
console.log('\nTest 2: Filter eligible players');
const eligiblePlayers = new Map();
mockElements.forEach(player => {
  if (player.element_type === 2 || player.element_type === 3 || player.element_type === 4) {
    eligiblePlayers.set(player.id, player.element_type);
  }
});

console.log(`  Eligible player IDs: ${Array.from(eligiblePlayers.keys()).join(', ')}`);
console.log(`  Expected: 2, 3, 4`);
console.log(`  ${!eligiblePlayers.has(1) ? '✓' : '✗'} GK (id=1) excluded`);
console.log(`  ${eligiblePlayers.has(2) ? '✓' : '✗'} DEF (id=2) included`);
console.log(`  ${eligiblePlayers.has(3) ? '✓' : '✗'} MID (id=3) included`);
console.log(`  ${eligiblePlayers.has(4) ? '✓' : '✗'} FWD (id=4) included`);

// Test 3: Aggregate DEFCON points for eligible players only
console.log('\nTest 3: Aggregate DEFCON points for eligible players only');
const defconTotals = new Map();

mockLiveData.elements.forEach(playerData => {
  const playerId = playerData.id;
  
  if (!eligiblePlayers.has(playerId)) return;

  const elementType = eligiblePlayers.get(playerId);
  const defconPoints = calculateDefconPoints(playerData, elementType);
  
  if (defconPoints > 0) {
    const current = defconTotals.get(playerId) || 0;
    defconTotals.set(playerId, current + defconPoints);
  }
});

console.log(`  Aggregated DEFCON points:`);
console.log(`    Player 1 (GK): ${defconTotals.get(1) || 0} (expected: 0) - ${(defconTotals.get(1) || 0) === 0 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 2 (DEF): ${defconTotals.get(2) || 0} (expected: 2) - ${defconTotals.get(2) === 2 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 3 (MID): ${defconTotals.get(3) || 0} (expected: 2) - ${defconTotals.get(3) === 2 ? '✓ PASS' : '✗ FAIL'}`);
console.log(`    Player 4 (FWD): ${defconTotals.get(4) || 0} (expected: 2) - ${defconTotals.get(4) === 2 ? '✓ PASS' : '✗ FAIL'}`);

// Test 4: Merge DEFCON into elements
console.log('\nTest 4: Merge DEFCON into elements');
function mergeDefconIntoElements(elements, defconData) {
  elements.forEach(player => {
    if (player.element_type === 2 || player.element_type === 3 || player.element_type === 4) {
      player.defensive_contribution = defconData.get(player.id) || 0;
    } else {
      player.defensive_contribution = 0;
    }
  });
}

mergeDefconIntoElements(mockElements, defconTotals);

mockElements.forEach(player => {
  const expected = player.element_type === 1 ? 0 : 2; // All eligible players get 2 points
  const match = player.defensive_contribution === expected;
  console.log(`  ${player.web_name}: ${player.defensive_contribution} (expected: ${expected}) - ${match ? '✓ PASS' : '✗ FAIL'}`);
});

// Test 5: Test threshold boundaries
console.log('\nTest 5: Test threshold boundaries');
const boundaryTests = [
  { elementType: 2, contributions: 9, expected: 0, desc: 'DEF with 9 contributions (below threshold)' },
  { elementType: 2, contributions: 10, expected: 2, desc: 'DEF with 10 contributions (at threshold)' },
  { elementType: 2, contributions: 15, expected: 2, desc: 'DEF with 15 contributions (above threshold)' },
  { elementType: 3, contributions: 11, expected: 0, desc: 'MID with 11 contributions (below threshold)' },
  { elementType: 3, contributions: 12, expected: 2, desc: 'MID with 12 contributions (at threshold)' },
  { elementType: 3, contributions: 20, expected: 2, desc: 'MID with 20 contributions (above threshold)' },
  { elementType: 4, contributions: 11, expected: 0, desc: 'FWD with 11 contributions (below threshold)' },
  { elementType: 4, contributions: 12, expected: 2, desc: 'FWD with 12 contributions (at threshold)' },
];

boundaryTests.forEach(test => {
  const mockPlayer = {
    explain: [{
      stats: [{ identifier: 'defensive_contribution', value: test.contributions }]
    }]
  };
  const result = calculateDefconPoints(mockPlayer, test.elementType);
  console.log(`  ${test.desc}: ${result} - ${result === test.expected ? '✓ PASS' : '✗ FAIL'}`);
});

console.log('\n=== All Tests Complete ===');
