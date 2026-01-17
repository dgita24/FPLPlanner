# Testing Checklist for Layout Reorganization

## Desktop Testing (1920x1080+)
After deployment to Cloudflare Pages, verify:

### Layout
- [ ] Pitch is visibly smaller (player cards ~145px vs 170px before)
- [ ] Transfer table is positioned on the right side of the pitch
- [ ] Fixtures panel is below the main content (not on the left)
- [ ] All elements fit comfortably on screen without excessive scrolling

### Transfer Table
- [ ] Search box works for filtering players
- [ ] Position dropdown filters correctly (All/GK/DEF/MID/FWD)
- [ ] Stat dropdown switches columns correctly:
  - Basic Stats: Goals + Assists
  - Defensive: Clean Sheets + Bonus
  - Transfers: Transfers In + Transfers Out
  - Ownership: TSB% + Transfers In
- [ ] Player names and prices always visible regardless of stat view
- [ ] Sorting works on all columns

### Player Info Modal
- [ ] Click 'i' button next to any player
- [ ] Modal opens with player details
- [ ] Shows comprehensive stats (18 different statistics)
- [ ] Close button (×) works
- [ ] Clicking outside modal closes it

### Existing Functionality
- [ ] Can select players from transfer table
- [ ] Can add players to squad
- [ ] Can remove players from pitch
- [ ] Can swap players between pitch and bench
- [ ] Captain/Vice-captain selection works
- [ ] All existing features remain functional

## Tablet Testing (768px - 1024px)
- [ ] Transfer table stacks below pitch (not side-by-side)
- [ ] All filters and controls remain accessible
- [ ] Player info modal displays properly
- [ ] Touch interactions work smoothly

## Mobile Testing (< 768px)
- [ ] All elements scale appropriately
- [ ] Player cards are readable (minimum 62px on smallest screens)
- [ ] Info buttons are easily tappable
- [ ] Modal is usable on small screens
- [ ] Horizontal scrolling works where needed

## Console Check
- [ ] No JavaScript errors in browser console
- [ ] No CSS warnings
- [ ] API calls complete successfully

---

**Deployment URL**: [To be added after Cloudflare Pages deployment]
**Testing Date**: [To be completed]
**Tester**: [To be assigned]
