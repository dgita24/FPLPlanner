# Testing Instructions for Modularized UI

## Quick Verification (5 minutes)

### 1. Module Loading Test
**What to test:** Verify all modules load without errors
**Steps:**
1. Open the application in a browser (Cloudflare Pages preview or local server)
2. Open browser console (F12)
3. Check for any import/export errors
4. Look for any "undefined" function errors

**Expected Result:** No console errors, page loads normally

### 2. Basic Functionality Test
**What to test:** Core features work after modularization
**Steps:**
1. Click "Menu" button → Sidebar should open
2. Click outside sidebar → Sidebar should close
3. Enter an FPL Team ID (e.g., 123456) and click "Import from FPL"
4. Verify team loads on pitch and bench

**Expected Result:** All basic UI interactions work as before

## Comprehensive Testing (30 minutes)

### Module: ui-sidebar.js

#### Test 1: Sidebar Toggle
- [ ] Click "Menu" button → Sidebar slides in from right
- [ ] Click "Menu" again → Sidebar closes
- [ ] Open sidebar, click outside → Sidebar closes
- [ ] Open sidebar, press ESC → Sidebar closes
- [ ] Rapid clicking menu button → No flickering or issues

### Module: ui-render.js

#### Test 2: Pitch Rendering
- [ ] Import team → Players appear on pitch in formation (GK, DEF, MID, FWD)
- [ ] Player cards show: badge, name, team, price
- [ ] Next fixture displays correctly (or "--" if not loaded)
- [ ] Future fixtures (3 more) display below
- [ ] Change price mode (dropdown) → Prices update on all cards

#### Test 3: Bench Rendering  
- [ ] Import team → Bench shows 4 players
- [ ] Bench players have same card format as starting XI
- [ ] GK appears first on bench (if not starting)

#### Test 4: Fixture Loading
- [ ] Import team → Fixtures load asynchronously
- [ ] Fixtures panel (left side) shows correct GW
- [ ] Click fixtures GW arrows → Updates correctly
- [ ] Player cards update with correct opponent abbreviations

### Module: validation.js

#### Test 5: Formation Validation
- [ ] Try creating team with 0 GK → Error: "must have exactly 1 GK"
- [ ] Try creating team with 2 GK → Error: "must have exactly 1 GK"
- [ ] Try creating team with 2 DEF → Error: "must have at least 3 defenders"
- [ ] Try creating team with 1 MID → Error: "must have at least 2 midfielders"
- [ ] Try creating team with 0 FWD → Error: "must have at least 1 forward"
- [ ] Try creating team with 6 DEF → Error: "max 5 defenders"
- [ ] Try creating team with 6 MID → Error: "max 5 midfielders"
- [ ] Try creating team with 4 FWD → Error: "max 3 forwards"

#### Test 6: Club Limit Validation
- [ ] Import team with 4 players from same club → Shows error/warning
- [ ] Try buying 4th player from club → Error: "max 3 players per club"
- [ ] Selling a player from over-limit club → Allows transfer
- [ ] Selling from non-over-limit club when over limit → Error: "next transfer out must be from that club"

### Module: team-operations.js

#### Test 7: Transfer Out (Sell)
- [ ] Click X on a starter → Player removed, bank increases
- [ ] Click X on bench player → Player removed, bank increases
- [ ] Sell price reflects correct mode (selling/purchase/current)
- [ ] After sell → Message: "Player sold. Pick a replacement..."
- [ ] Cancel button becomes enabled

#### Test 8: Transfer In (Buy)
- [ ] After selling, select player in table
- [ ] Click "Add to squad" → Player added, bank decreases
- [ ] Try buying without selling first → Error: "Sell a player first"
- [ ] Try buying player over budget → Error: "Not enough money"
- [ ] Try buying duplicate player → Error: "already in your squad"
- [ ] Buy player that causes formation error → Shows validation error
- [ ] Successful transfer → Message: "Player bought and added"

#### Test 9: Cancel Transfer
- [ ] Sell a player → Click "Cancel transfer"
- [ ] Original player restored → Bank returned to previous value
- [ ] Cancel button disabled after cancel
- [ ] Click cancel without pending transfer → Message: "No pending transfer"

#### Test 10: Two-Click Swap
- [ ] Click ⇅ on starter → Green outline appears
- [ ] Click ⇅ on bench player → Swap completes, formation updates
- [ ] Click ⇅ twice on same player → Cancels swap (outline removed)
- [ ] Click ⇅ on starter, then another starter → Shows message: "select a bench to complete"
- [ ] Try swapping GK with outfield → Error: "GK must swap with GK"
- [ ] Swap that breaks formation → Error message with formation rule
- [ ] Change GW during pending swap → Swap cancelled

### Module: ui-init.js

#### Test 11: GW Navigation
- [ ] Click "GW →" → Advances to next GW (GW+1)
- [ ] Click "← GW" → Goes back to current GW
- [ ] At current GW → Left arrow disabled
- [ ] At GW+7 → Right arrow disabled
- [ ] GW display updates correctly
- [ ] Team plan persists across GW navigation
- [ ] Try changing GW during pending transfer → Error: "Finish the pending transfer"

#### Test 12: Bank Input
- [ ] Click in bank input field → Can edit value
- [ ] Enter valid number (e.g., 50.5) → Updates state.bank
- [ ] Enter negative number → Resets to previous value
- [ ] Enter non-number → Resets to previous value
- [ ] Bank updates after transfers → Input shows correct value

#### Test 13: Price Mode
- [ ] Change to "Selling" → Player prices show selling price
- [ ] Change to "Purchase" → Player prices show purchase price
- [ ] Change to "Current" → Player prices show current market price
- [ ] Price mode persists after save/load

#### Test 14: Import Team
- [ ] Enter valid FPL ID → Team loads successfully
- [ ] Message shows: "Team imported for GW{X}"
- [ ] If importing old GW → Message: "Imported from GW{X} (GW{Y} not public yet)"
- [ ] Enter invalid ID → Error: "Failed to load team"
- [ ] Enter empty ID → Error: "Enter Team ID"
- [ ] Sidebar closes after successful import
- [ ] Transfer state resets after import

#### Test 15: Local Storage
- [ ] Make transfers, click "💾 Local Save"
- [ ] Message: "Team saved locally"
- [ ] Refresh page, click "📂 Local Load"
- [ ] Message: "Team loaded locally"
- [ ] Team restored with all transfers
- [ ] Click load without save → Message: "No local save found"

#### Test 16: Cloud Storage
- [ ] Enter Team ID and Password
- [ ] Click "Save Team" → Message: "Team saved to cloud!"
- [ ] Side message shows: "✓ Saved as: {teamId}"
- [ ] Sidebar closes after save
- [ ] Refresh page or clear local storage
- [ ] Enter same Team ID and Password
- [ ] Click "Load Team" → Message: "Team loaded from cloud!"
- [ ] Team restored correctly
- [ ] Try load without credentials → Error: "Enter Team ID and Password"
- [ ] Try load with wrong password → Error from API

#### Test 17: Undo/Reset
- [ ] Make a transfer
- [ ] Click "↩️ Undo" → Transfer reverted
- [ ] Message: "Last action undone"
- [ ] Make multiple transfers
- [ ] Click undo multiple times → Each transfer reverts in reverse order
- [ ] Click undo 50+ times → Undo stack capped at 50
- [ ] Click undo with no actions → Message: "Nothing to undo"
- [ ] Click "⏮️ Reset" → Team returns to imported state
- [ ] Message: "Team reset to imported state"
- [ ] Click reset without import → Error: "No imported team to reset to"

## Integration Tests

### Test 18: End-to-End Transfer Flow
- [ ] Import team from FPL
- [ ] Navigate to GW+2
- [ ] Sell a midfielder (bank increases)
- [ ] Select expensive midfielder from table
- [ ] Add to squad (bank decreases)
- [ ] Verify new player appears in GW+2
- [ ] Navigate to GW+3 → New player still there
- [ ] Navigate back to GW (current) → Original team intact
- [ ] Click Undo → GW+2 and GW+3 revert to original

### Test 19: Complex Swap Scenario
- [ ] Import team
- [ ] Swap GK from bench to starting XI
- [ ] Verify GK swaps with starting GK (not outfield player)
- [ ] Swap DEF from starting to bench
- [ ] Verify starting XI still has 3+ DEF
- [ ] Swap that would leave 2 DEF → Error shown
- [ ] Complete valid swap
- [ ] Verify changes apply to current and future GWs

### Test 20: Save/Load Persistence
- [ ] Import team, make multiple transfers
- [ ] Navigate to different GW
- [ ] Change price mode
- [ ] Edit bank value
- [ ] Save to cloud
- [ ] Close browser/clear cache
- [ ] Open app, load from cloud
- [ ] Verify: All transfers intact, correct GW displayed, price mode correct, bank correct

## Browser Compatibility Test

Test in multiple browsers:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

## Performance Check

- [ ] Page loads in < 3 seconds
- [ ] No console errors or warnings
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] Smooth animations (sidebar, hover effects)
- [ ] Fixtures load asynchronously without blocking UI

## Regression Tests

Verify nothing broke:
- [ ] Table.js filtering still works (search, position, team, price)
- [ ] Table sorting works (click column headers)
- [ ] Fixtures panel still works (navigation, display)
- [ ] All CSS styles apply correctly
- [ ] No duplicate IDs or conflicts

## Notes for Testers

1. **Console is your friend:** Keep browser console open during testing to catch errors immediately
2. **Test incrementally:** Test each module's functions before moving to next
3. **Document issues:** Note any errors with module name, function, and reproduction steps
4. **Edge cases:** Try boundary values (£0.0 bank, 15 players, etc.)
5. **Network:** Test with and without fixtures loaded (may see "--" initially)

## Known Limitations

- Fixtures may show "--" until API responds (this is expected)
- Import may fall back to previous GW if current GW not yet public
- Cloud save/load requires valid API endpoints

## Success Criteria

✅ All tests pass
✅ No console errors
✅ No breaking changes to existing functionality
✅ Code is cleaner and more maintainable
✅ New modules follow single responsibility principle
