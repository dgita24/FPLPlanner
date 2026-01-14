# Batch Transfer Feature - Testing Guide

## Overview
This document provides comprehensive testing scenarios for the new batch/multi-player transfer functionality.

## Feature Description
The batch transfer feature allows users to:
- Remove multiple players (N players) from their squad before adding replacements
- Track all removed players and the bank balance throughout the process
- Add replacement players one by one until all slots are filled
- Cancel all transfers at once, restoring the original squad
- Maintain FPL rules compliance throughout (formation, club limits, budget)

## Key Changes

### 1. State Management
- **Old**: Single transfer tracked with `pendingTransfer` and `lastSoldSide`
- **New**: Batch transfers tracked with `batchTransfers` object containing:
  - `snapshot`: Original state before any transfers
  - `removedPlayers`: Array of removed players with their side and selling price
  - `isActive`: Whether batch mode is currently active

### 2. Transfer Flow
- **Old**: Remove 1 player → Add 1 replacement → Transfer complete
- **New**: Remove N players → Add N replacements (one by one) → All transfers complete

### 3. Visual Feedback
- Orange status banner showing "X players removed - add replacements"
- Cancel button remains enabled throughout batch process
- Progressive messaging as players are added back

## Test Scenarios

### Scenario 1: Single Player Transfer (Backward Compatibility)
**Purpose**: Ensure single transfers still work as before

**Steps**:
1. Import an FPL team
2. Click X on any starter player
3. Verify bank increases by selling price
4. Verify player is removed from pitch
5. Select a replacement from the table
6. Click "Add to squad"
7. Verify replacement appears on pitch
8. Verify bank decreases by purchase price
9. Verify no remaining transfer slots

**Expected Result**: ✅ Single transfer completes successfully

---

### Scenario 2: Simple Batch Transfer (2 Players)
**Purpose**: Test basic batch transfer functionality

**Steps**:
1. Import an FPL team
2. Click X on starter player 1 (e.g., a defender)
3. Verify status shows "1 player removed"
4. Verify bank increased
5. Click X on starter player 2 (e.g., a midfielder)
6. Verify status shows "2 players removed"
7. Verify bank increased again
8. Select replacement 1 from table
9. Click "Add to squad"
10. Verify status shows "1 more slot to fill"
11. Select replacement 2 from table
12. Click "Add to squad"
13. Verify success message "All transfers completed successfully!"
14. Verify both replacements are on pitch

**Expected Result**: ✅ Both players successfully replaced

---

### Scenario 3: Batch Transfer with Cancel
**Purpose**: Test cancel functionality with multiple removals

**Steps**:
1. Import an FPL team
2. Note original bank amount
3. Click X on 3 different players
4. Verify bank increases appropriately
5. Verify status shows "3 players removed"
6. Click "Cancel transfer" button
7. Verify all 3 players are restored
8. Verify bank returns to original amount
9. Verify no active transfer status

**Expected Result**: ✅ All transfers cancelled, squad restored

---

### Scenario 4: Batch Transfer - Mixed Starting XI and Bench
**Purpose**: Test removing players from both starting XI and bench

**Steps**:
1. Import an FPL team
2. Remove 2 players from starting XI
3. Remove 1 player from bench
4. Verify status shows "3 players removed"
5. Add replacement 1 (should fill first starting XI slot)
6. Add replacement 2 (should fill second starting XI slot)
7. Add replacement 3 (should fill bench slot)
8. Verify each player goes to the correct location
9. Verify squad is complete (11 starters + 4 bench)

**Expected Result**: ✅ Players added to correct positions (FIFO order)

---

### Scenario 5: Budget Constraint During Batch
**Purpose**: Test budget validation during batch transfers

**Steps**:
1. Import an FPL team
2. Remove 2 cheap players (e.g., 4.5m each, bank +9.0m)
3. Verify bank increase
4. Try to add an expensive player (e.g., 15.0m)
5. Verify error: "Not enough money"
6. Select a player within budget
7. Successfully add first replacement
8. Try to add second replacement beyond remaining budget
9. Verify error: "Not enough money"

**Expected Result**: ✅ Budget validation works correctly throughout batch

---

### Scenario 6: Formation Validation During Batch
**Purpose**: Test formation rules during batch transfers

**Steps**:
1. Import an FPL team with a balanced formation (e.g., 3-4-3)
2. Remove all 3 forwards
3. Try to add 3 midfielders as replacements
4. Verify error when completing: "Invalid formation: must have at least 1 forward"
5. Cancel transfer
6. Remove 3 forwards again
7. Add back 3 forwards
8. Verify success

**Expected Result**: ✅ Formation validation enforces FPL rules

---

### Scenario 7: Club Limit Validation During Batch
**Purpose**: Test 3-per-club rule during batch transfers

**Steps**:
1. Import an FPL team
2. Note any club with 3 players already
3. Remove 2 players from different clubs
4. Try to add 2 players from the club that already has 3
5. Verify error: "Invalid transfer: max 3 players per club"
6. Select players from different clubs
7. Verify success

**Expected Result**: ✅ Club limit enforced during batch transfers

---

### Scenario 8: Over-Limit Club Enforcement
**Purpose**: Test that when over limit (4+ from one club), must sell from that club

**Steps**:
1. Manually create a scenario with 4 players from one club (if possible)
2. Try to remove a player from a different club
3. Verify error: "You have 4+ players from a club. Your next transfer out must be from that club."
4. Remove a player from the over-limit club
5. Verify success

**Expected Result**: ✅ Over-limit club rule enforced

---

### Scenario 9: Large Batch Transfer (5+ Players)
**Purpose**: Test performance and stability with many transfers

**Steps**:
1. Import an FPL team
2. Remove 5 different players (mix of starters and bench)
3. Verify status updates correctly ("5 players removed")
4. Add back 5 replacements one by one
5. Verify status counts down (4, 3, 2, 1, 0)
6. Verify final squad is complete and valid

**Expected Result**: ✅ Large batch transfers work correctly

---

### Scenario 10: Batch Transfer with GW Navigation Blocked
**Purpose**: Test that GW navigation is blocked during batch transfers

**Steps**:
1. Import an FPL team (viewing GW X)
2. Remove 2 players
3. Try to click "GW →" button
4. Verify message: "Finish the pending transfers (Add players) or Cancel first."
5. Try to click "← GW" button
6. Verify same message
7. Complete or cancel transfers
8. Verify GW navigation works again

**Expected Result**: ✅ GW navigation blocked during active batch

---

### Scenario 11: Batch Transfer with Swap Blocked
**Purpose**: Test that swaps are blocked during batch transfers

**Steps**:
1. Import an FPL team
2. Remove 1 player
3. Try to click the swap button (⇅) on any player
4. Verify message: "Finish the pending transfers (Add players) or Cancel first."
5. Complete or cancel transfers
6. Verify swap functionality works again

**Expected Result**: ✅ Swaps blocked during active batch

---

### Scenario 12: Incomplete Squad During Batch
**Purpose**: Test that validation allows incomplete squad during batch but enforces at completion

**Steps**:
1. Import an FPL team
2. Remove 3 players (squad now has 12 players)
3. Verify no validation errors (incomplete squad is allowed during batch)
4. Add back 2 players (squad now has 14 players)
5. Verify no validation errors yet
6. Try to add a player that would create invalid formation
7. Verify error appears only when trying to complete with 15 players

**Expected Result**: ✅ Validation lenient during batch, strict at completion

---

### Scenario 13: Undo After Batch Transfer
**Purpose**: Test undo functionality after batch transfers

**Steps**:
1. Import an FPL team
2. Complete a batch transfer (remove 2, add 2)
3. Click "Undo" button
4. Verify squad returns to state before the batch
5. Verify bank returns to previous amount

**Expected Result**: ✅ Undo works correctly after batch transfers

---

### Scenario 14: Reset After Batch Transfer
**Purpose**: Test reset to imported team after batch transfers

**Steps**:
1. Import an FPL team
2. Complete multiple batch transfers
3. Click "Reset" button
4. Verify squad returns to originally imported state
5. Verify bank returns to imported amount

**Expected Result**: ✅ Reset works correctly after batch transfers

---

### Scenario 15: Batch Transfer Across Multiple GWs
**Purpose**: Test that batch transfers propagate to future GWs

**Steps**:
1. Import an FPL team (GW X)
2. Remove 2 players
3. Add 2 replacements
4. Navigate to GW X+1
5. Verify the 2 new players are present
6. Navigate to GW X+2
7. Verify the 2 new players are present
8. Navigate back to GW X
9. Verify everything is consistent

**Expected Result**: ✅ Transfers propagate correctly across all 8 planned GWs

---

## Browser Compatibility Testing

Test all scenarios in:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Performance Testing

- [ ] Test with 10 consecutive batch transfers
- [ ] Verify no memory leaks (check browser dev tools)
- [ ] Verify UI remains responsive throughout
- [ ] Verify no console errors

## Edge Cases

### Edge Case 1: Remove All Starters
**Steps**:
1. Remove all 11 starting players
2. Add back 11 players
3. Verify formation validation works

**Expected**: ✅ Should work if final formation is valid

### Edge Case 2: Remove All Bench Players
**Steps**:
1. Remove all 4 bench players
2. Add back 4 bench players
3. Verify bench is correctly populated

**Expected**: ✅ Should work correctly

### Edge Case 3: Rapid Clicking
**Steps**:
1. Rapidly click X on multiple players
2. Verify each click is registered correctly
3. Verify no duplicate removals

**Expected**: ✅ No bugs from rapid clicking

### Edge Case 4: Add Then Remove Same Player Type
**Steps**:
1. Remove a goalkeeper
2. Add a different goalkeeper
3. Immediately remove another outfield player
4. Continue with batch
5. Verify no conflicts

**Expected**: ✅ No conflicts, batch continues correctly

## Regression Testing

Verify that existing functionality still works:
- [ ] Single player transfers (backward compatibility)
- [ ] Player swaps (two-click swap)
- [ ] Import from FPL
- [ ] Local save/load
- [ ] Cloud save/load
- [ ] Undo functionality
- [ ] Reset functionality
- [ ] GW navigation (when no active batch)
- [ ] Fixture display
- [ ] Price mode switching (selling/purchase/current)
- [ ] Player table filtering and sorting

## Known Limitations

1. **FIFO Order**: Players must be added back in FIFO order (first removed = first replaced)
   - This is by design to maintain consistent slot assignment
   
2. **Same Side Assignment**: Removed starting XI players must be replaced with starting XI players
   - This prevents accidental formation changes
   
3. **No Partial Cancel**: Cannot cancel individual removals, must cancel all or none
   - This is by design to maintain state consistency

## Success Criteria

For this feature to be considered complete:
- ✅ All 15 main test scenarios pass
- ✅ All edge cases handled gracefully
- ✅ No console errors during operation
- ✅ All existing functionality still works (regression testing passes)
- ✅ Works across all major browsers
- ✅ Clear user feedback throughout the process
- ✅ FPL rules enforced correctly

## Deployment Checklist

Before merging to main:
- [ ] All tests pass on preview site
- [ ] Code review completed
- [ ] Security scan (CodeQL) passed
- [ ] Documentation updated
- [ ] No performance degradation
- [ ] User feedback collected (if applicable)
