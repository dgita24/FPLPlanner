// Test for date-based suspension parsing
// Run with: node test-suspension-dates.js

console.log('=== Date-Based Suspension Parsing Test ===\n');

// Mock events data (gameweeks with deadlines)
const mockEvents = [
  { id: 22, deadline_time: '2026-01-24T14:00:00Z' },  // GW22 deadline: Jan 24
  { id: 23, deadline_time: '2026-01-31T14:00:00Z' },  // GW23 deadline: Jan 31
  { id: 24, deadline_time: '2026-02-07T14:00:00Z' },  // GW24 deadline: Feb 7
  { id: 25, deadline_time: '2026-02-14T14:00:00Z' },  // GW25 deadline: Feb 14
  { id: 26, deadline_time: '2026-02-21T14:00:00Z' }   // GW26 deadline: Feb 21
];

// Test cases - UPDATED with correct FPL semantics
// "Suspended until X" means available FROM X (not through end of X)
const testCases = [
  {
    news: 'Suspended until 31 January',
    expectedGW: 22,  // Available FROM GW23 (Jan 31), so suspended through GW22
    description: 'Keane case - suspended until Jan 31 (available FROM GW23)'
  },
  {
    news: 'Suspended until Jan 24',
    expectedGW: 21,  // Available FROM GW22 (Jan 24), so suspended through GW21
    description: 'Suspended until GW22 deadline day'
  },
  {
    news: 'Expected back 7 February',
    expectedGW: 23,  // Available FROM GW24 (Feb 7), so suspended through GW23
    description: 'Expected back on GW24 deadline day'
  },
  {
    news: 'Suspended until February 14th',
    expectedGW: 24,  // Available FROM GW25 (Feb 14), so suspended through GW24
    description: 'With ordinal suffix'
  },
  {
    news: 'Suspended for 2 matches',
    expectedGW: 23,  // Current GW 22, suspended for 2 = available GW24, ends GW23
    description: 'Match count format (original logic)'
  }
];

// Simplified version of the parsing logic for testing
function parseSuspensionDate(dateStr, currentYear) {
  if (!dateStr) return null;
  
  const datePattern = /(\d+)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d+)/i;
  const match = dateStr.match(datePattern);
  
  if (!match) return null;
  
  const day = parseInt(match[1] || match[3]);
  const monthStr = (match[2] || match[1]) ? match[2] : dateStr.match(/[A-Za-z]+/)?.[0];
  
  if (!monthStr) return null;
  
  const monthMap = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };
  
  const month = monthMap[monthStr.toLowerCase()];
  if (month === undefined) return null;
  
  let year = currentYear;
  const now = new Date();
  if (month < 6 && now.getMonth() >= 6) {
    year = currentYear + 1;
  }
  
  try {
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getGameweekForDate(targetDate, events) {
  if (!targetDate || !events || events.length === 0) return null;
  
  // FPL semantics: "Suspended until Jan 31" means available FROM Jan 31
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.deadline_time) continue;
    
    const deadline = new Date(event.deadline_time);
    
    if (deadline >= targetDate) {
      // First available GW, so last suspended GW is previous one
      return event.id - 1;
    }
  }
  
  return events[events.length - 1]?.id || null;
}

function getSuspensionEndGW(news, currentGW, events) {
  if (!news) return null;
  
  // Match count
  const suspensionMatch = news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
  if (suspensionMatch) {
    const suspendedMatches = parseInt(suspensionMatch[1]);
    return currentGW + suspendedMatches - 1;
  }
  
  // GW number
  const gwMatch = news.match(/(?:until|in) gameweek (\d+)/i);
  if (gwMatch) {
    return parseInt(gwMatch[1]) - 1;
  }
  
  // Date parsing
  const dateMatch = news.match(/(?:until|back|return)\s+(?:on\s+)?(\d+\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d+)(?:st|nd|rd|th)?/i);
  if (dateMatch && events && events.length > 0) {
    const currentYear = new Date().getFullYear();
    const suspensionDate = parseSuspensionDate(dateMatch[1], currentYear);
    
    if (suspensionDate) {
      const lastSuspendedGW = getGameweekForDate(suspensionDate, events);
      if (lastSuspendedGW) {
        return lastSuspendedGW;
      }
    }
  }
  
  return null;
}

// Run tests
let passed = 0;
let failed = 0;

const currentGW = 22;

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.description}`);
  console.log(`  News: "${test.news}"`);
  
  const result = getSuspensionEndGW(test.news, currentGW, mockEvents);
  const success = result === test.expectedGW;
  
  console.log(`  Expected suspension ends at GW${test.expectedGW}, got GW${result}`);
  console.log(`  Result: ${success ? '✅ PASS' : '❌ FAIL'}\n`);
  
  if (success) passed++;
  else failed++;
});

console.log('=== Summary ===');
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
  console.log('✅ All tests passed!');
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
