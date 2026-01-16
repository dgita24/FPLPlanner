// Simple integration test for chip feature
// This file can be run in browser console to verify chip functionality

console.log('=== Chip Feature Integration Test ===');

// Test 1: Check chip field exists in state structure
function testChipFieldExists() {
  console.log('Test 1: Checking chip field in state.plan...');
  const gw = Object.keys(state.plan)[0];
  const hasChipField = state.plan[gw] && 'chip' in state.plan[gw];
  console.log(`  ✓ Chip field exists: ${hasChipField}`);
  return hasChipField;
}

// Test 2: Check selectChip function is available
function testSelectChipFunction() {
  console.log('Test 2: Checking selectChip function...');
  const exists = typeof window.selectChip === 'function';
  console.log(`  ✓ selectChip function available: ${exists}`);
  return exists;
}

// Test 3: Test chip selection
function testChipSelection() {
  console.log('Test 3: Testing chip selection...');
  const gw = state.viewingGW;
  const beforeChip = state.plan[gw].chip;
  console.log(`  Current chip for GW${gw}: ${beforeChip}`);
  
  // Select wildcard
  window.selectChip('wildcard');
  const afterSelect = state.plan[gw].chip;
  console.log(`  After selection: ${afterSelect}`);
  
  // Deselect wildcard
  window.selectChip('wildcard');
  const afterDeselect = state.plan[gw].chip;
  console.log(`  After deselection: ${afterDeselect}`);
  
  const success = afterSelect === 'wildcard' && afterDeselect === null;
  console.log(`  ✓ Toggle works correctly: ${success}`);
  return success;
}

// Test 4: Test chip persistence in local save
function testChipLocalPersistence() {
  console.log('Test 4: Testing chip local persistence...');
  const gw = state.viewingGW;
  
  // Select chip
  window.selectChip('wildcard');
  console.log(`  Selected wildcard for GW${gw}`);
  
  // Save locally
  window.localSave();
  console.log('  Saved to localStorage');
  
  // Clear chip
  state.plan[gw].chip = null;
  console.log('  Cleared chip from state');
  
  // Load from localStorage
  window.localLoad();
  const loadedChip = state.plan[gw].chip;
  console.log(`  Loaded chip: ${loadedChip}`);
  
  const success = loadedChip === 'wildcard';
  console.log(`  ✓ Persistence works: ${success}`);
  
  // Cleanup
  window.selectChip('wildcard'); // deselect
  return success;
}

// Test 5: Test chip UI rendering
function testChipUIRendering() {
  console.log('Test 5: Testing chip UI rendering...');
  
  // Check if chip container exists in DOM
  const hasChipButton = document.querySelector('.chip-btn') !== null;
  console.log(`  ✓ Chip button in DOM: ${hasChipButton}`);
  
  return hasChipButton;
}

// Run all tests
function runAllTests() {
  console.log('\n🧪 Running all chip feature tests...\n');
  
  const results = {
    test1: testChipFieldExists(),
    test2: testSelectChipFunction(),
    test3: testChipSelection(),
    test4: testChipLocalPersistence(),
    test5: testChipUIRendering()
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

// Auto-run when loaded
if (typeof state !== 'undefined') {
  runAllTests();
} else {
  console.error('State object not found. Make sure this runs after app initialization.');
}
