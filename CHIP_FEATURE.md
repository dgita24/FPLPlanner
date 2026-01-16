# Chip Selection Feature

## Overview
The FPL Planner now supports chip selection for gameweeks. Users can select chips (like Wildcard) for specific gameweeks and the selection is saved along with their team planning data.

## Features Implemented

### 1. Chip Selection UI
- **Location**: Top-right corner of the pitch layout
- **Button**: "Play Wildcard" button that toggles chip selection
- **Visual States**:
  - Default: Green button with text "Play Wildcard"
  - Active: Orange button with text "✓ Wildcard"

### 2. Chip Indicator
- When a chip is selected, an animated indicator appears above the button
- Shows: 🎯 icon, chip name (e.g., "Wildcard"), and gameweek (e.g., "GW5")
- Orange background with subtle pulse animation for visibility

### 3. Data Persistence
- Chip selections are stored in `state.plan[gw].chip`
- Automatically saved with:
  - Local browser storage (Local Save/Load)
  - Cloud storage (Cloud Save/Load via Supabase)
- Persists across browser sessions

### 4. User Experience
- Click "Play Wildcard" to select the chip for the current gameweek
- Click again to deselect
- Toast notifications confirm selection/deselection
- Chip selection is preserved when navigating between gameweeks

## Technical Implementation

### Data Structure
```javascript
state.plan[gw] = {
  starting: [...],  // Starting XI players
  bench: [...],     // Bench players
  chip: null        // null | 'wildcard' | 'bboost' | '3xc' | 'freehit'
}
```

### Key Functions
- `selectChip(chipType, updateUI)` - Toggle chip selection for current gameweek
- `renderChipUI()` - Render chip button and indicator in UI
- `getActiveChip(gw)` - Get the active chip for a gameweek

### Files Modified
1. `data.js` - Added chip field to plan structure
2. `team-operations.js` - Added chip selection logic
3. `ui-render.js` - Added chip UI rendering
4. `ui-init.js` - Added chip CSS styles and exposed selectChip globally

## Future Enhancements
Currently implemented for Wildcard chip. Can be extended to support:
- Bench Boost
- Triple Captain
- Free Hit
- Chip usage validation (e.g., one Wildcard per half season)
- Visual chip history across all gameweeks
