# Chip Selection Feature - Enhancements

## Updates Based on User Feedback

### Enhancement 1: Multiple Chip Buttons (Commit 73d07ab)

**Request:** Add 4 chip buttons instead of just Wildcard, with smaller sizing

**Implementation:**
- Added 4 chip types: Wildcard (WC), Free Hit (FH), Bench Boost (BB), Triple Captain (TC)
- Buttons are now smaller and stack vertically in top-right corner
- Labels: "Play WC", "Play FH", "Play BB", "Play TC"
- When active, shows checkmark: "✓ WC", "✓ FH", "✓ BB", "✓ TC"

**Visual Changes:**
- Replaced single large "Play Wildcard" button with 4 smaller buttons
- Buttons arranged in vertical column with 4px gap between them
- Each button: 80px min-width, 11px font size, 6px padding
- Mobile responsive: 70px min-width, 10px font size on mobile

**CSS Classes:**
- `.chip-btn-small` - Base styling for smaller buttons
- `.chip-buttons-row` - Container for vertical button layout

### Enhancement 2: Crossed-Out Used Chips (Commit 83b5cd7)

**Request:** Show chips as crossed out in future gameweeks after they've been played

**Implementation:**
- Checks all previous gameweeks to find which chips have been used
- In future gameweeks, used chips appear:
  - Crossed out (text-decoration: line-through)
  - Grayed out (background: #cccccc, color: #666666)
  - Disabled (cursor: not-allowed, opacity: 0.6)
  - Not clickable (disabled attribute)
  - Updated tooltip: "already used in a previous gameweek"

**Logic:**
```javascript
// Check which chips have been used in previous gameweeks
const usedChips = new Set();
for (let g = state.currentGW; g < gw; g++) {
  const prevTeam = state.plan[g];
  if (prevTeam && prevTeam.chip) {
    usedChips.add(prevTeam.chip);
  }
}
```

**CSS Classes:**
- `.chip-btn-used` - Styling for disabled/used chips

## User Experience Flow

### Example: Using Wildcard in GW5

**GW5 (Current):**
- All 4 buttons available (green)
- Click "Play WC" → becomes "✓ WC" (orange)
- Orange indicator appears: "🎯 Wildcard GW5"

**GW6 (Next Week):**
- WC button: Crossed out, gray, disabled
- FH, BB, TC buttons: Available (green)
- Tooltip on WC: "Wildcard already used in a previous gameweek"

**GW4 (Previous Week):**
- All 4 buttons available (can still plan past weeks)
- User can still play WC in GW4 if desired

## Visual States

### Available Chip
```
┌──────────┐
│ Play WC  │  Green background, white on hover, clickable
└──────────┘
```

### Active Chip
```
┌──────────┐
│  ✓ WC    │  Orange background, checkmark prefix, clickable (to deselect)
└──────────┘
```

### Used Chip (Future GWs)
```
┌──────────┐
│ ̶W̶C̶       │  Gray background, crossed out, disabled, not clickable
└──────────┘
```

## Technical Details

### Files Modified
1. **ui-render.js**
   - Updated `renderChipUI()` to render 4 buttons
   - Added logic to check used chips in previous gameweeks
   - Dynamic button styling based on active/used state

2. **ui-init.js**
   - Added `.chip-btn-small` CSS class for smaller buttons
   - Added `.chip-buttons-row` for vertical layout
   - Added `.chip-btn-used` for crossed-out styling
   - Updated mobile responsive styles

### Chip Types Supported
- `wildcard` - Unlimited transfers for one gameweek
- `freehit` - Temporary team for one gameweek only
- `bboost` - Points from bench players count
- `3xc` - Captain points tripled instead of doubled

### Data Structure (Unchanged)
```javascript
state.plan[gw] = {
  starting: [...],
  bench: [...],
  chip: null | 'wildcard' | 'freehit' | 'bboost' | '3xc'
}
```

## Testing Scenarios

### Test 1: Multiple Chip Selection
1. Navigate to GW5
2. Click "Play WC" → chip selected for GW5
3. Navigate to GW6
4. WC button is crossed out and disabled
5. Click "Play BB" → chip selected for GW6
6. Navigate to GW7
7. WC and BB are crossed out, FH and TC available

### Test 2: Deselection
1. Navigate to GW5 with WC active
2. Click "✓ WC" button → chip deselected
3. Navigate to GW6
4. WC no longer crossed out (available again)

### Test 3: Persistence
1. Select chips in multiple gameweeks
2. Save locally or to cloud
3. Refresh page and load
4. Navigate through gameweeks
5. Verify chips are still selected and crossed out correctly

## Browser Compatibility

✅ Desktop: Chrome, Firefox, Safari, Edge
✅ Mobile: iOS Safari, Chrome Mobile
✅ Responsive: Tested at 320px - 1920px widths

## Future Enhancements (Not Implemented)

- Chip usage validation rules (e.g., 2 Wildcards per season)
- Visual chip history timeline
- Chip recommendations based on fixtures
- Conflict detection (can't use 2 chips in same GW)
