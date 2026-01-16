# Chip Selection Feature - Visual Guide

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                          FPL Team Planner                       │
│                                                                 │
│  [Bank: 5.0m]  [Show: Selling]  [Save] [Load] [Undo] [Menu]   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Gameweek 5 Navigation                       │
│                  [← GW]  Gameweek 5  [GW →]                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PITCH                                                           │
│                                            ┌──────────────────┐ │
│                                            │  🎯 Wildcard     │ │ ← Chip Indicator
│                                            │  GW5             │ │   (when active)
│                                            └──────────────────┘ │
│                                            ┌──────────────────┐ │
│                                            │ ✓ Wildcard       │ │ ← Chip Button
│              [Goalkeeper]                  └──────────────────┘ │   (top-right)
│                                                                 │
│                                                                 │
│       [Def]    [Def]    [Def]    [Def]                        │
│                                                                 │
│                                                                 │
│    [Mid]    [Mid]    [Mid]    [Mid]    [Mid]                 │
│                                                                 │
│                                                                 │
│              [Fwd]          [Fwd]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Button States

### State 1: No Chip Selected (Default)
```
┌─────────────────┐
│ Play Wildcard   │  ← Green button (#00ff87)
└─────────────────┘
```

### State 2: Chip Selected (Active)
```
┌──────────────────┐
│  🎯 Wildcard     │  ← Orange indicator (animated)
│  GW5             │     with pulse effect
└──────────────────┘
┌──────────────────┐
│ ✓ Wildcard       │  ← Orange button (#ff9800)
└──────────────────┘
```

## User Interaction Flow

```
┌─────────────────┐
│    User         │
│  clicks button  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│   No chip       │       │  Chip selected  │
│   selected      │◄─────►│  (Wildcard)     │
│                 │ click │                 │
│  Green button   │ again │ Orange button   │
│  No indicator   │       │ + indicator     │
└─────────────────┘       └─────────────────┘
```

## Data Structure

```javascript
state.plan = {
  5: {
    starting: [ /* 11 players */ ],
    bench: [ /* 4 players */ ],
    chip: 'wildcard'  // ← New field
  },
  6: {
    starting: [ /* 11 players */ ],
    bench: [ /* 4 players */ ],
    chip: null  // ← No chip for GW6
  },
  // ... GW 7-12
}
```

## Mobile View

```
┌────────────────────────────┐
│  FPL Team Planner          │
│                            │
│  [Bank]  [Mode]            │
│  [Save] [Load] [Menu]      │
├────────────────────────────┤
│    [← GW] GW5 [GW →]      │
├────────────────────────────┤
│ PITCH                      │
│                            │
│               ┌──────────┐ │
│               │🎯 WC GW5 │ │ ← Smaller
│               └──────────┘ │   on mobile
│               ┌──────────┐ │
│               │✓Wildcard │ │
│   [GK]        └──────────┘ │
│                            │
│  [D] [D] [D]               │
│                            │
│ [M] [M] [M]                │
│                            │
│  [F] [F]                   │
└────────────────────────────┘
```

## Color Scheme

### Default Button
- **Background**: `#00ff87` (FPL green)
- **Text**: `#37003c` (Dark purple)
- **Border**: `2px solid #00ff87`

### Active Button  
- **Background**: `#ff9800` (Orange)
- **Text**: `#ffffff` (White)
- **Border**: `2px solid #f57c00`

### Indicator
- **Background**: `rgba(255, 153, 0, 0.95)` (Orange)
- **Border**: `2px solid #ff9800`
- **Animation**: Pulse effect (scale 1.0 → 1.05)

## Animation Effects

### Pulse Animation (Indicator)
```css
@keyframes chipPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
/* Duration: 2s, Infinite */
```

### Button Hover
```css
/* Default button hover */
background: #00e676;
transform: translateY(-2px);
box-shadow: 0 4px 8px rgba(0,0,0,0.3);

/* Active button hover */
background: #f57c00;
border-color: #e65100;
```

## Responsive Breakpoints

### Desktop (> 768px)
- Button: 10px from top-right
- Font size: 13px
- Padding: 10px 16px

### Mobile (≤ 768px)  
- Button: 5px from top-right
- Font size: 12px
- Padding: 8px 12px
- Indicator: Slightly smaller

## Toast Notifications

### Selection
```
┌─────────────────────────────┐
│ ✓ Wildcard selected for GW5 │  ← Green background
└─────────────────────────────┘
```

### Deselection
```
┌───────────────────────────────┐
│ ✓ Wildcard deselected for GW5 │  ← Green background
└───────────────────────────────┘
```

## Integration with Existing Features

### Works With:
- ✅ Add/Remove Players (Transfers)
- ✅ Swap Players (Starting XI ↔ Bench)
- ✅ Gameweek Navigation (← GW / GW →)
- ✅ Undo/Reset Functions
- ✅ Local Save/Load
- ✅ Cloud Save/Load
- ✅ Team Import from FPL

### Does Not Interfere With:
- Formation validation
- Club limits (max 3 per club)
- Budget calculations
- Fixture display
- Player statistics

## Future Chip Types

### Planned Visual Indicators
```
🎯 Wildcard      (Current)
💪 Bench Boost   (Future)
3️⃣ Triple Captain (Future)
🆓 Free Hit      (Future)
```

### Multiple Chip Buttons (Future)
```
┌────────────────────┐
│ 🎯 Wildcard        │
├────────────────────┤
│ 💪 Bench Boost     │
├────────────────────┤
│ 3️⃣ Triple Captain  │
├────────────────────┤
│ 🆓 Free Hit        │
└────────────────────┘
```
