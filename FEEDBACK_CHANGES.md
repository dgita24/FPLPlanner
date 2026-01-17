# Layout Update - Response to Feedback

## Changes Made (Commit 739ccbe)

### 1. Fixtures Panel - Moved Back to Left
**Before (Previous PR)**: Fixtures panel was at the bottom
**After (Current)**: Fixtures panel is back on the left side of the pitch

### 2. Transfer Table - Simplified Column Structure

**Before (Previous PR)**: 
- Columns: Select | Status | Name | Pos | £ | Pts | Stat1 | Stat2 | Info
- Two dynamic stat columns that changed based on dropdown category

**After (Current)**:
- Columns: Select | Status | Name | Pos | £ | [Filterable Stat] | Info
- Single filterable column with dropdown to select from:
  - Points (default)
  - Goals
  - Assists
  - Clean Sheets
  - Bonus
  - Transfers In
  - Transfers Out
  - Ownership %

### 3. Layout Structure

**Current Layout** (Three-Column Grid):
```
+----------------+-------------------------+----------------+
|   Fixtures     |      Pitch + Bench      |   Transfers    |
|   Panel        |                         |    Panel       |
|   (340px)      |       (flexible)        |   (340px)      |
|                |                         |                |
| GW selector    | [Player cards on pitch] | Search         |
| Match list     | [Bench cards]           | Position filter|
|                |                         | Stat dropdown  |
|                |                         | Player table   |
|                |                         | [5 columns +   |
|                |                         |  1 filterable] |
+----------------+-------------------------+----------------+
```

**Responsive Behavior**:
- **Desktop (>1280px)**: All three columns side-by-side
- **Tablet (<1024px)**: Stacks vertically - Fixtures → Pitch → Transfers
- **Mobile**: Optimized spacing and scrolling

### 4. Permanent Columns in Transfer Table

The following columns are **always visible**:
1. **Select** - Checkbox to select player
2. **Status** - Injury/suspension flags (circular badges)
3. **Name** - Player name
4. **Position** - GK/DEF/MID/FWD
5. **Price** - Current price in £m

### 5. Filterable Column

One additional column that changes based on dropdown selection:
- Shows the selected stat for all players
- Sortable by clicking the column header
- Dropdown persists selection across table updates

### Technical Changes

**Files Modified**:
1. `index.html` - Restructured layout, updated table headers
2. `styles/main.css` - Changed grid to `340px 1fr 340px`
3. `styles/components.css` - Restored fixtures panel margin-top
4. `styles/responsive.css` - Updated responsive breakpoints
5. `table.js` - Simplified stat configuration from multi-column to single column

**Key Code Changes**:
```javascript
// Changed from multiple stat configs to single stat config
const statConfig = {
  points: { key: 'total_points', label: 'Pts', tooltip: 'Total Points' },
  goals_scored: { key: 'goals_scored', label: 'G', tooltip: 'Goals' },
  // ... other stats
};

// Render single filterable column instead of two
const statCol = statConfig[currentStatView] || statConfig.points;
const statValue = formatStatValue(player[statCol.key], statCol.key);
```

### Benefits

1. **Cleaner Table**: Fewer columns means easier scanning
2. **Focused Information**: 5 essential columns always visible
3. **Flexible Stats**: Users can switch to view the stat that matters to them
4. **Better Layout**: Fixtures on left provides context while planning transfers
5. **Space Efficient**: Three-column layout fits well on standard desktop screens

---

**Commit**: 739ccbe
**Date**: 2026-01-17
**Status**: Ready for testing and review
