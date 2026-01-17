// Test file for search normalization with non-ASCII characters
// This file can be run in browser console or Node.js to verify search functionality

console.log('=== Search Normalization Test ===\n');

// Import the foldForSearch function (for browser testing, we'll redefine it here)
// This is the FIXED version of the function
function foldForSearch(s) {
  // Character replacement map for common non-ASCII letters
  // This enables searching "Odegaard" to find "Ødegaard"
  const charMap = {
    'ø': 'o', 'Ø': 'O',
    'å': 'a', 'Å': 'A',
    'æ': 'ae', 'Æ': 'AE',
    'é': 'e', 'É': 'E',
    'è': 'e', 'È': 'E',
    'ê': 'e', 'Ê': 'E',
    'ë': 'e', 'Ë': 'E',
    'á': 'a', 'Á': 'A',
    'à': 'a', 'À': 'A',
    'â': 'a', 'Â': 'A',
    'ä': 'a', 'Ä': 'A',
    'ã': 'a', 'Ã': 'A',
    'í': 'i', 'Í': 'I',
    'ì': 'i', 'Ì': 'I',
    'î': 'i', 'Î': 'I',
    'ï': 'i', 'Ï': 'I',
    'ó': 'o', 'Ó': 'O',
    'ò': 'o', 'Ò': 'O',
    'ô': 'o', 'Ô': 'O',
    'ö': 'o', 'Ö': 'O',
    'õ': 'o', 'Õ': 'O',
    'ú': 'u', 'Ú': 'U',
    'ù': 'u', 'Ù': 'U',
    'û': 'u', 'Û': 'U',
    'ü': 'u', 'Ü': 'U',
    'ý': 'y', 'Ý': 'Y',
    'ÿ': 'y', 'Ÿ': 'Y',
    'ñ': 'n', 'Ñ': 'N',
    'ç': 'c', 'Ç': 'C',
    'ß': 'ss',
    'ð': 'd', 'Ð': 'D',
    'þ': 'th', 'Þ': 'TH'
  };
  
  let str = (s || '').toString();
  
  // First replace common non-ASCII characters
  for (const [from, to] of Object.entries(charMap)) {
    str = str.replace(new RegExp(from, 'g'), to);
  }
  
  // Then normalize and remove any remaining combining diacritics
  str = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  return str.toLowerCase().trim();
}

// Test cases
const testCases = [
  // Test 1: Norwegian players (Ø)
  { player: 'Ødegaard', search: 'Ødegaard', shouldMatch: true, description: 'Exact match with Ø' },
  { player: 'Ødegaard', search: 'Odegaard', shouldMatch: true, description: 'Normalized match (O instead of Ø)' },
  { player: 'Ødegaard', search: 'odegaard', shouldMatch: true, description: 'Case-insensitive match' },
  { player: 'Ødegaard', search: 'øde', shouldMatch: true, description: 'Partial match with Ø' },
  { player: 'Ødegaard', search: 'ode', shouldMatch: true, description: 'Partial normalized match' },
  
  // Test 2: Scandinavian players (Å)
  { player: 'Hårland', search: 'Hårland', shouldMatch: true, description: 'Exact match with Å' },
  { player: 'Hårland', search: 'Harland', shouldMatch: true, description: 'Normalized match (A instead of Å)' },
  { player: 'Håland', search: 'Haland', shouldMatch: true, description: 'Normalized match with Å→A' },
  
  // Test 3: French/Spanish players (accented vowels)
  { player: 'Édouard', search: 'Edouard', shouldMatch: true, description: 'Normalized match (E instead of É)' },
  { player: 'Fernández', search: 'Fernandez', shouldMatch: true, description: 'Normalized match (a instead of á)' },
  { player: 'José', search: 'Jose', shouldMatch: true, description: 'Normalized match (e instead of é)' },
  
  // Test 4: German/Turkish players (umlauts)
  { player: 'Müller', search: 'Muller', shouldMatch: true, description: 'Normalized match (u instead of ü)' },
  { player: 'Öztürk', search: 'Ozturk', shouldMatch: true, description: 'Normalized match (O instead of Ö, u instead of ü)' },
  
  // Test 5: ASCII-only players (should still work)
  { player: 'Smith', search: 'Smith', shouldMatch: true, description: 'ASCII exact match' },
  { player: 'Smith', search: 'smith', shouldMatch: true, description: 'ASCII case-insensitive' },
  { player: 'Smith', search: 'mit', shouldMatch: true, description: 'ASCII partial match' },
  { player: 'Johnson', search: 'smith', shouldMatch: false, description: 'ASCII non-match' },
  
  // Test 6: Edge cases
  { player: 'Sørloth', search: 'Sorloth', shouldMatch: true, description: 'Norwegian Ø in middle of name' },
  { player: 'Sørloth', search: 'sorl', shouldMatch: true, description: 'Partial normalized match' },
  { player: '', search: 'test', shouldMatch: false, description: 'Empty player name' },
  { player: 'Test', search: '', shouldMatch: true, description: 'Empty search (should match all)' },
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const normalizedPlayer = foldForSearch(test.player);
  const normalizedSearch = foldForSearch(test.search);
  const matches = normalizedPlayer.includes(normalizedSearch);
  const success = matches === test.shouldMatch;
  
  if (success) {
    passed++;
    console.log(`✓ Test ${index + 1}: ${test.description}`);
    console.log(`  Player: "${test.player}" → "${normalizedPlayer}"`);
    console.log(`  Search: "${test.search}" → "${normalizedSearch}"`);
    console.log(`  Match: ${matches} (expected: ${test.shouldMatch})\n`);
  } else {
    failed++;
    console.error(`✗ Test ${index + 1} FAILED: ${test.description}`);
    console.error(`  Player: "${test.player}" → "${normalizedPlayer}"`);
    console.error(`  Search: "${test.search}" → "${normalizedSearch}"`);
    console.error(`  Match: ${matches} (expected: ${test.shouldMatch})\n`);
  }
});

// Summary
console.log('=================================');
console.log(`Total: ${testCases.length} tests`);
console.log(`Passed: ${passed} ✓`);
console.log(`Failed: ${failed} ${failed > 0 ? '✗' : ''}`);
console.log('=================================');

// Export for browser testing
if (typeof window !== 'undefined') {
  window.testSearchNormalization = {
    foldForSearch,
    testCases,
    runTests: () => {
      console.clear();
      // Re-run this script
      const script = document.createElement('script');
      script.src = 'test-search-normalization.js';
      document.body.appendChild(script);
    }
  };
}

// Export results for automated testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { foldForSearch, testCases, passed, failed };
}
