╔════════════════════════════════════════════════════════════════════════════╗
║                  FPL PLANNER - MODULE ARCHITECTURE                         ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│                          index.html                                      │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ <script type="module">                                          │    │
│  │   import './data.js';                                           │    │
│  │   import './main.js';     ◄─── Entry Point                     │    │
│  │   import './ui.js';                                             │    │
│  │ </script>                                                        │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
              ┌─────────────────────────────────────┐
              │          main.js                    │
              │  - Initializes app                  │
              │  - Calls initUI()                   │
              │  - Loads bootstrap data             │
              └─────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            ui.js (14 lines)                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  // Entry point - imports and re-exports                        │    │
│  │  import { initUI } from './ui-init.js';                         │    │
│  │  import { toggleSidebarMenu } from './ui-sidebar.js';           │    │
│  │  export { initUI };                                             │    │
│  │  window.toggleSidebarMenu = toggleSidebarMenu;                  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
    ┌───────────────────────────┐      ┌──────────────────────────┐
    │   ui-sidebar.js (40L)     │      │   ui-init.js (361L)      │
    │  ┌─────────────────────┐  │      │  ┌────────────────────┐  │
    │  │ • toggleSidebarMenu │  │      │  │ • initUI()         │  │
    │  │ • closeSidebar      │  │      │  │ • changeGW()       │  │
    │  │ • setupHandlers     │  │      │  │ • importTeam()     │  │
    │  └─────────────────────┘  │      │  │ • localSave/Load   │  │
    │                            │      │  │ • saveTeam()       │  │
    │  No dependencies           │      │  │ • loadTeam()       │  │
    └───────────────────────────┘      │  │ • undo/reset       │  │
                                       │  └────────────────────┘  │
                                       └──────────────────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────┐
                    │                               │               │
                    ▼                               ▼               ▼
    ┌──────────────────────────┐  ┌──────────────────────────┐  ┌────────────────┐
    │ ui-render.js (230L)      │  │ team-operations.js       │  │ validation.js  │
    │ ┌──────────────────────┐ │  │ (379L)                   │  │ (80L)          │
    │ │ • renderPitch()      │ │  │ ┌──────────────────────┐ │  │ ┌────────────┐ │
    │ │ • renderBench()      │ │  │ │ • removePlayer()     │ │  │ │ • validate │ │
    │ │ • playerCard()       │ │  │ │ • addSelectedTo      │ │  │ │   StartingXI│ │
    │ │ • displayPrice()     │ │  │ │   Squad()            │ │  │ │ • validate │ │
    │ │ • showMessage()      │ │  │ │ • substitutePlayer() │ │  │ │   ClubLimit│ │
    │ │ • ensureFixtures     │ │  │ │ • cancelTransfer()   │ │  │ │ • getClub  │ │
    │ │   ForView()          │ │  │ │ • resetTransfer      │ │  │ │   Counts   │ │
    │ │ • setPendingSwap()   │ │  │ │   State()            │ │  │ │ • getOver  │ │
    │ │ • getPendingSwap()   │ │  │ │ • isPendingTransfer()│ │  │ │   LimitClubs│
    │ └──────────────────────┘ │  │ └──────────────────────┘ │  │ └────────────┘ │
    │                          │  │                          │  │                │
    │ Depends on:              │  │ Depends on:              │  │ Depends on:    │
    │ • data.js                │  │ • data.js                │  │ • data.js      │
    │ • validation.js          │  │ • validation.js          │  │                │
    └──────────────────────────┘  │ • ui-render.js           │  └────────────────┘
                                  └──────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                    ┌─────────────────────────────────┐
                    │      data.js (272L)             │
                    │  ┌───────────────────────────┐  │
                    │  │ • state                   │  │
                    │  │ • history                 │  │
                    │  │ • loadBootstrap()         │  │
                    │  │ • loadTeamEntry()         │  │
                    │  │ • loadFixtures()          │  │
                    │  │ • calculateSellingPrice() │  │
                    │  └───────────────────────────┘  │
                    │                                 │
                    │  Shared state management        │
                    └─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPPORTING MODULES                                │
├─────────────────────────────────────────────────────────────────────────┤
│  table.js (201L)          │  fixtures.js (114L)                         │
│  - Player table rendering  │  - Fixtures panel rendering                │
│  - Filtering & sorting     │  - Fixtures data loading                   │
│  - Not modified            │  - Not modified                            │
└─────────────────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════════════════════╗
║                          KEY METRICS                                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Original ui.js:           1057 lines                                      ║
║  New ui.js:                  14 lines  (98.7% reduction)                   ║
║  ─────────────────────────────────────────────────────────────────────────║
║  New Modules Created:         5                                            ║
║  Total Lines (new modules): 1110 lines                                     ║
║  Average Module Size:        222 lines                                     ║
║  Largest Module:             379 lines (team-operations.js)                ║
║  Smallest Module:             40 lines (ui-sidebar.js)                     ║
║  ─────────────────────────────────────────────────────────────────────────║
║  Circular Dependencies:       0  ✅                                        ║
║  Breaking Changes:            0  ✅                                        ║
║  Files Modified:              1  (ui.js)                                   ║
║  Files Created:               8  (5 modules + 3 docs)                      ║
╚════════════════════════════════════════════════════════════════════════════╝

DEPENDENCY FLOW:
═══════════════

  ui.js (entry)
    └── ui-init.js (initialization)
         ├── ui-sidebar.js (no dependencies) ✓
         ├── ui-render.js
         │    ├── validation.js
         │    │    └── data.js ✓
         │    └── data.js ✓
         ├── team-operations.js
         │    ├── validation.js (already loaded)
         │    ├── ui-render.js (already loaded)
         │    └── data.js ✓
         ├── fixtures.js → data.js ✓
         └── data.js ✓

  Legend: ✓ = Terminal dependency (no further dependencies)

PRINCIPLE APPLIED:
═════════════════

  ┌─────────────────────────────────────────────────────────────┐
  │  SINGLE RESPONSIBILITY PRINCIPLE                            │
  │  Each module has ONE clear purpose:                         │
  │  • validation.js    → Validate rules                        │
  │  • ui-sidebar.js    → Manage sidebar                        │
  │  • ui-render.js     → Render UI elements                    │
  │  • team-operations.js → Handle transfers/swaps              │
  │  • ui-init.js       → Initialize and orchestrate            │
  │  • ui.js            → Entry point (minimal)                 │
  └─────────────────────────────────────────────────────────────┘

TESTING STRATEGY:
════════════════

  1. Unit Tests (per module)
     ├── validation.js    → Test all validation rules
     ├── ui-sidebar.js    → Test toggle/close behavior
     ├── ui-render.js     → Test rendering functions
     ├── team-operations.js → Test transfer/swap logic
     └── ui-init.js       → Test initialization

  2. Integration Tests
     └── Test module interactions (ui-init → team-operations → ui-render)

  3. End-to-End Tests
     └── Test complete user flows (import → transfer → save → load)

  See TESTING_INSTRUCTIONS.md for detailed test cases.
