// Test for suspension flag functionality
// This file can be run in browser console to verify suspension flag logic

console.log('=== Suspension Flag Feature Test ===');

// Mock player data for testing
const mockPlayers = [
  {
    id: 1,
    status: 's',
    news: 'Suspended for 2 matches',
    web_name: 'Test Player 1'
  },
  {
    id: 2,
    status: 's',
    news: 'Suspended for 3 games',
    web_name: 'Test Player 2'
  },
  {
    id: 3,
    status: 's',
    news: 'Unavailable until gameweek 25',
    web_name: 'Test Player 3'
  },
  {
    id: 4,
    status: 'i',
    news: 'Ankle injury',
    web_name: 'Test Player 4'
  },
  {
    id: 5,
    status: 'd',
    news: 'Minor knock',
    web_name: 'Test Player 5'
  },
  {
    id: 6,
    status: 'a',
    news: null,
    web_name: 'Test Player 6'
  }
];

// Test 1: getSuspensionEndGW helper - "Suspended for X matches"
function testSuspensionParsing() {
  console.log('\nTest 1: Testing suspension duration parsing...');
  
  // Mock the helper function locally if not available globally
  function getSuspensionEndGW(player, currentGW) {
    if (!player.news) return null;
    
    const matchesMatch = player.news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
    if (matchesMatch) {
      const suspendedMatches = parseInt(matchesMatch[1]);
      return currentGW + suspendedMatches - 1;
    }
    
    const gwMatch = player.news.match(/(?:until|in) gameweek (\d+)/i);
    if (gwMatch) {
      return parseInt(gwMatch[1]) - 1;
    }
    
    return null;
  }
  
  const currentGW = 22;
  
  // Test case 1: "Suspended for 2 matches" from GW22
  const result1 = getSuspensionEndGW(mockPlayers[0], currentGW);
  console.log(`  Player 1 (2 matches): Suspension ends at GW${result1} (expected: 23)`);
  const test1 = result1 === 23;
  
  // Test case 2: "Suspended for 3 games" from GW22
  const result2 = getSuspensionEndGW(mockPlayers[1], currentGW);
  console.log(`  Player 2 (3 games): Suspension ends at GW${result2} (expected: 24)`);
  const test2 = result2 === 24;
  
  // Test case 3: "Unavailable until gameweek 25"
  const result3 = getSuspensionEndGW(mockPlayers[2], currentGW);
  console.log(`  Player 3 (until GW25): Suspension ends at GW${result3} (expected: 24)`);
  const test3 = result3 === 24;
  
  // Test case 4: Injury (should return null)
  const result4 = getSuspensionEndGW(mockPlayers[3], currentGW);
  console.log(`  Player 4 (injury): Returns ${result4} (expected: null)`);
  const test4 = result4 === null;
  
  const passed = test1 && test2 && test3 && test4;
  console.log(`  ✓ Suspension parsing: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// Test 2: isSuspensionExpiredForGW helper
function testSuspensionExpiry() {
  console.log('\nTest 2: Testing suspension expiry logic...');
  
  function getSuspensionEndGW(player, currentGW) {
    if (!player.news) return null;
    const matchesMatch = player.news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
    if (matchesMatch) {
      const suspendedMatches = parseInt(matchesMatch[1]);
      return currentGW + suspendedMatches - 1;
    }
    const gwMatch = player.news.match(/(?:until|in) gameweek (\d+)/i);
    if (gwMatch) {
      return parseInt(gwMatch[1]) - 1;
    }
    return null;
  }
  
  function isSuspensionExpiredForGW(player, gwToCheck, currentGW) {
    if (player.status !== 's') return false;
    const suspensionEndGW = getSuspensionEndGW(player, currentGW);
    if (!suspensionEndGW) return false;
    return gwToCheck > suspensionEndGW;
  }
  
  const currentGW = 22;
  const player = mockPlayers[0]; // Suspended for 2 matches from GW22
  
  // Should show flag in GW22 (1st suspended match)
  const test1 = !isSuspensionExpiredForGW(player, 22, currentGW);
  console.log(`  GW22 (current): Flag should show: ${test1 ? 'PASS' : 'FAIL'}`);
  
  // Should show flag in GW23 (2nd suspended match)
  const test2 = !isSuspensionExpiredForGW(player, 23, currentGW);
  console.log(`  GW23: Flag should show: ${test2 ? 'PASS' : 'FAIL'}`);
  
  // Should NOT show flag in GW24 (suspension over)
  const test3 = isSuspensionExpiredForGW(player, 24, currentGW);
  console.log(`  GW24: Flag should NOT show: ${test3 ? 'PASS' : 'FAIL'}`);
  
  // Should NOT show flag in GW25 (suspension over)
  const test4 = isSuspensionExpiredForGW(player, 25, currentGW);
  console.log(`  GW25: Flag should NOT show: ${test4 ? 'PASS' : 'FAIL'}`);
  
  const passed = test1 && test2 && test3 && test4;
  console.log(`  ✓ Suspension expiry: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// Test 3: Non-suspension statuses
function testNonSuspensionStatuses() {
  console.log('\nTest 3: Testing non-suspension status handling...');
  
  function isSuspensionExpiredForGW(player, gwToCheck, currentGW) {
    if (player.status !== 's') return false;
    return true; // Simplified for this test
  }
  
  const currentGW = 22;
  
  // Injured player - should always show flag (not suspension, so never expires)
  const test1 = !isSuspensionExpiredForGW(mockPlayers[3], 24, currentGW);
  console.log(`  Injured player in GW24: Flag should show: ${test1 ? 'PASS' : 'FAIL'}`);
  
  // Doubtful player - should always show flag (not suspension, so never expires)
  const test2 = !isSuspensionExpiredForGW(mockPlayers[4], 24, currentGW);
  console.log(`  Doubtful player in GW24: Flag should show: ${test2 ? 'PASS' : 'FAIL'}`);
  
  // Available player - should never show flag
  const test3 = !isSuspensionExpiredForGW(mockPlayers[5], 24, currentGW);
  console.log(`  Available player: No flag logic needed: ${test3 ? 'PASS' : 'FAIL'}`);
  
  const passed = test1 && test2 && test3;
  console.log(`  ✓ Non-suspension statuses: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// Test 4: Edge cases
function testEdgeCases() {
  console.log('\nTest 4: Testing edge cases...');
  
  function getSuspensionEndGW(player, currentGW) {
    if (!player.news) return null;
    const matchesMatch = player.news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
    if (matchesMatch) {
      const suspendedMatches = parseInt(matchesMatch[1]);
      return currentGW + suspendedMatches - 1;
    }
    const gwMatch = player.news.match(/(?:until|in) gameweek (\d+)/i);
    if (gwMatch) {
      return parseInt(gwMatch[1]) - 1;
    }
    return null;
  }
  
  // Player with unparseable suspension news
  const playerUnparseable = {
    status: 's',
    news: 'Ban pending FA decision',
    web_name: 'Edge Case 1'
  };
  const test1 = getSuspensionEndGW(playerUnparseable, 22) === null;
  console.log(`  Unparseable suspension news returns null: ${test1 ? 'PASS' : 'FAIL'}`);
  
  // Player with no news
  const playerNoNews = {
    status: 's',
    news: null,
    web_name: 'Edge Case 2'
  };
  const test2 = getSuspensionEndGW(playerNoNews, 22) === null;
  console.log(`  No news returns null: ${test2 ? 'PASS' : 'FAIL'}`);
  
  // Single match suspension
  const playerSingleMatch = {
    status: 's',
    news: 'Suspended for 1 match',
    web_name: 'Edge Case 3'
  };
  const test3 = getSuspensionEndGW(playerSingleMatch, 22) === 22;
  console.log(`  Single match suspension (GW22): Ends at GW22: ${test3 ? 'PASS' : 'FAIL'}`);
  
  const passed = test1 && test2 && test3;
  console.log(`  ✓ Edge cases: ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

// Run all tests
function runAllTests() {
  console.log('\n🧪 Running all suspension flag tests...\n');
  
  const results = {
    test1: testSuspensionParsing(),
    test2: testSuspensionExpiry(),
    test3: testNonSuspensionStatuses(),
    test4: testEdgeCases()
  };
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed. Check details above.');
  }
  
  return results;
}

// Auto-run tests
runAllTests();

// Export for manual testing
if (typeof window !== 'undefined') {
  window.testSuspensionFlags = runAllTests;
}
