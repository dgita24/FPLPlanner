# Chip Selection Feature - Testing Guide

## Manual Testing Checklist

### Basic Chip Selection
- [ ] Navigate to any gameweek view
- [ ] Verify "Play Wildcard" button appears in top-right of pitch
- [ ] Click the button - verify toast message "Wildcard selected for GW{N}"
- [ ] Verify chip indicator appears above button showing "🎯 Wildcard GW{N}"
- [ ] Verify button changes to orange with "✓ Wildcard" text
- [ ] Click button again - verify toast "Wildcard deselected for GW{N}"
- [ ] Verify chip indicator disappears
- [ ] Verify button returns to green with "Play Wildcard" text

### Navigation Between Gameweeks
- [ ] Select Wildcard for GW1
- [ ] Navigate to GW2 - verify no chip indicator (chip not selected)
- [ ] Navigate back to GW1 - verify chip indicator appears (chip persists)
- [ ] Navigate to GW3
- [ ] Select Wildcard for GW3
- [ ] Navigate between GW1, GW2, GW3 - verify correct chip states

### Local Storage Persistence
- [ ] Select Wildcard for GW2
- [ ] Click "Local Save" button
- [ ] Refresh the browser page
- [ ] Click "Local Load" button
- [ ] Navigate to GW2 - verify Wildcard is still selected

### Cloud Storage Persistence
Prerequisites: Have Supabase configured with valid credentials

- [ ] Import a team from FPL
- [ ] Select Wildcard for GW5
- [ ] Click "Save Team" in sidebar with Team ID and Password
- [ ] Refresh the browser page
- [ ] Click "Load Team" with same Team ID and Password
- [ ] Navigate to GW5 - verify Wildcard is still selected

### Integration with Team Operations
- [ ] Select Wildcard for current gameweek
- [ ] Add/remove players (transfer operations)
- [ ] Verify chip selection persists after transfers
- [ ] Use Undo feature - verify chip state is also restored
- [ ] Use Reset feature - verify chip selections are cleared

### Mobile Responsiveness
- [ ] Open on mobile device or resize browser to mobile width
- [ ] Verify chip button is visible and clickable
- [ ] Verify chip indicator is properly sized and positioned
- [ ] Test all basic chip selection scenarios on mobile

### Edge Cases
- [ ] Select chip, navigate away, navigate back - verify persistence
- [ ] Select chip, make transfers, cancel transfers - verify chip persists
- [ ] Select chip on GW8 (last plannable gameweek) - verify works correctly
- [ ] Import new team - verify old chip selections are cleared
- [ ] Local Save with chip, Local Load - verify chip data intact

## Expected Results

### Visual Appearance
- Button should be clearly visible in top-right corner
- Green button when no chip selected
- Orange button with checkmark when chip active
- Animated orange indicator when chip selected
- All elements properly scaled on mobile

### Data Integrity
- Chip data stored as: `state.plan[gw].chip` = null | 'wildcard'
- Chip data included in local saves
- Chip data included in cloud saves
- Chip data preserved across page refreshes (when saved)

### User Experience
- Clear visual feedback on selection/deselection
- Toast notifications for all actions
- Intuitive toggle behavior (click to select, click again to deselect)
- Chip state persists when navigating between gameweeks
- No interference with existing features (transfers, swaps, etc.)

## Known Limitations (Future Enhancements)
- Currently only Wildcard chip is implemented
- No validation for chip usage rules (e.g., one Wildcard per half season)
- No visual history of chip usage across all gameweeks
- Other chips (Bench Boost, Triple Captain, Free Hit) not yet implemented

## Browser Compatibility
Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)
