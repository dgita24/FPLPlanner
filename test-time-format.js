// Test 24-hour time formatting
const testDate = new Date('2024-01-20T14:30:00Z');

console.log('Without hour12 (locale-dependent):');
console.log(testDate.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit'
}));

console.log('\nWith hour12: false (24-hour):');
console.log(testDate.toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}));
