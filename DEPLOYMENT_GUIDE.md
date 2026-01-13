# Deployment Guide for Modularized FPL Planner

## Overview
This guide provides step-by-step instructions for deploying and testing the modularized FPL Team Planner on Cloudflare Pages.

## Pre-Deployment Checklist

- [x] All modules created and committed
- [x] Import/export statements verified
- [x] No circular dependencies
- [x] Syntax validation passed
- [x] Documentation complete

## Deployment Steps

### Option 1: Cloudflare Pages (Recommended)

#### Via Cloudflare Dashboard

1. **Commit and Push Changes**
   ```bash
   git status                    # Verify changes
   git add .                     # Stage all files
   git commit -m "Modularize UI" # Commit
   git push origin <branch-name> # Push to GitHub
   ```

2. **Trigger Cloudflare Pages Build**
   - Cloudflare Pages automatically deploys on push to configured branch
   - Or manually trigger build in Cloudflare Dashboard
   - Wait for build to complete (~2-3 minutes)

3. **Access Preview URL**
   - Find preview URL in Cloudflare Dashboard
   - Typically: `https://<commit-hash>.<project>.pages.dev`
   - Or: `https://<branch>.<project>.pages.dev`

#### Via Wrangler CLI (Alternative)

1. **Install Wrangler** (if not already installed)
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Deploy Pages**
   ```bash
   wrangler pages deploy . --project-name=fplplanner
   ```

### Option 2: Local Testing

#### Using Python HTTP Server
```bash
cd /path/to/FPLPlanner
python3 -m http.server 8000
```
Then open: `http://localhost:8000`

**Note:** API endpoints won't work locally without proxy setup

#### Using Node HTTP Server
```bash
npm install -g http-server
http-server -p 8000
```

**Note:** For full functionality, use Cloudflare Pages preview

## Post-Deployment Verification

### 1. Quick Smoke Test (2 minutes)

Access the deployed URL and verify:
- [ ] Page loads without errors
- [ ] No console errors (F12 → Console)
- [ ] All modules load (check Network tab)
- [ ] Basic UI renders (pitch, bench, table)

### 2. Module Load Verification

Open browser console and run:
```javascript
// Should return functions, not undefined
console.log(typeof window.toggleSidebarMenu);  // "function"
console.log(typeof window.changeGW);           // "function"
console.log(typeof window.removePlayer);       // "function"
console.log(typeof window.substitutePlayer);   // "function"
console.log(typeof window.addSelectedToSquad); // "function"
console.log(typeof window.cancelTransfer);     // "function"
console.log(typeof window.importTeam);         // "function"
console.log(typeof window.localSave);          // "function"
console.log(typeof window.localLoad);          // "function"
console.log(typeof window.saveTeam);           // "function"
console.log(typeof window.loadTeam);           // "function"
```

All should return "function"

### 3. Critical Path Test (5 minutes)

Follow this sequence to verify core functionality:

1. **Import Team**
   - Click Menu → Enter FPL ID: `123456` (or any valid ID)
   - Click "Import from FPL"
   - ✅ Team loads on pitch and bench

2. **View Team**
   - ✅ 11 players on pitch
   - ✅ 4 players on bench
   - ✅ Player cards show fixtures

3. **Make Transfer**
   - Click X on any midfielder
   - Select cheaper midfielder in table
   - Click "Add to squad"
   - ✅ Transfer completes, bank updates

4. **Swap Players**
   - Click ⇅ on a starting player
   - Click ⇅ on a bench player
   - ✅ Swap completes

5. **Save/Load**
   - Click "💾 Local Save"
   - Refresh page
   - Click "📂 Local Load"
   - ✅ Team restored

### 4. Full Test Suite

Refer to `TESTING_INSTRUCTIONS.md` for comprehensive testing

## Troubleshooting

### Issue: "Module not found" error

**Cause:** Incorrect import path or file not deployed

**Fix:**
```bash
# Verify all files are committed
git status

# Check file exists
ls -la ui-*.js validation.js team-operations.js

# Re-commit if needed
git add .
git commit -m "Fix module paths"
git push
```

### Issue: "Unexpected token 'export'" error

**Cause:** Browser doesn't support ES6 modules or incorrect script type

**Fix:** Verify in `index.html`:
```html
<script type="module">
  import './data.js';
  import './main.js';
  import './ui.js';
</script>
```

The `type="module"` is critical!

### Issue: Functions are undefined (window.X is not a function)

**Cause:** Module initialization not complete

**Fix:**
1. Check browser console for import errors
2. Verify `ui-init.js` is executing
3. Check `initUI()` is called in `main.js`
4. Ensure `window.addEventListener('load', ...)` in `main.js`

### Issue: Circular dependency warning

**Cause:** Modules importing each other

**Fix:**
Run dependency check:
```bash
node /tmp/check_deps.js
```

Should show "✅ No circular dependencies found"

### Issue: CORS errors for API calls

**Cause:** API endpoints not proxied correctly

**Fix:**
- Ensure `functions/api/` directory structure is correct
- Check Cloudflare Pages Functions are enabled
- Verify proxy paths in API functions

### Issue: Fixtures not loading

**Cause:** API rate limiting or endpoint changes

**Fix:**
1. Check Network tab for failed requests
2. Verify `/api/fpl/fixtures` endpoint
3. May show "--" until fixtures load (expected behavior)

## Rollback Procedure

If deployment fails or breaks functionality:

### Rollback via Git
```bash
# Find previous working commit
git log --oneline

# Revert to previous commit
git revert <commit-hash>

# Or reset (destructive)
git reset --hard <commit-hash>
git push --force
```

### Rollback via Cloudflare Dashboard
1. Go to Cloudflare Pages Dashboard
2. Select Deployment tab
3. Find previous working deployment
4. Click "Rollback to this deployment"

## Monitoring

### What to Monitor Post-Deployment

1. **Error Rate**
   - Check Cloudflare Analytics for 5xx errors
   - Should be < 0.1%

2. **Console Errors**
   - Use browser dev tools
   - Check for JavaScript errors
   - Verify no module load failures

3. **Performance**
   - Page load time < 3 seconds
   - Time to Interactive < 5 seconds
   - No memory leaks

4. **User Feedback**
   - Test with real FPL team IDs
   - Verify transfers work correctly
   - Check save/load functionality

## Success Metrics

✅ Deployment completes without errors
✅ All modules load successfully
✅ No console errors on page load
✅ Critical path test passes
✅ Performance metrics within acceptable range
✅ No increase in error rate

## Next Steps

After successful deployment:

1. **Monitor for 24-48 hours**
   - Watch for user-reported issues
   - Check error logs
   - Monitor performance

2. **Gather Feedback**
   - Test with different team IDs
   - Try various transfer scenarios
   - Test on different devices/browsers

3. **Iterate**
   - Address any issues found
   - Consider further modularization if needed
   - Add tests for regression prevention

## Support

For issues or questions:
- Check `MODULARIZATION_SUMMARY.md` for architecture details
- Review `TESTING_INSTRUCTIONS.md` for test cases
- Inspect browser console for error messages
- Check Cloudflare Pages logs for deployment issues

## File Checklist

Ensure these files are deployed:
- [x] `ui.js` (entry point)
- [x] `ui-init.js` (initialization)
- [x] `ui-render.js` (rendering)
- [x] `ui-sidebar.js` (sidebar)
- [x] `team-operations.js` (transfers/swaps)
- [x] `validation.js` (validation logic)
- [x] `data.js` (unchanged)
- [x] `table.js` (unchanged)
- [x] `fixtures.js` (unchanged)
- [x] `main.js` (unchanged)
- [x] `index.html` (unchanged)

## Deployment Checklist

Before marking deployment as complete:
- [ ] All files committed and pushed
- [ ] Build completed successfully
- [ ] Preview URL accessible
- [ ] Module load verification passed
- [ ] Critical path test passed
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Team import works
- [ ] Transfers work
- [ ] Save/load works

---

**Deployment Date:** ___________  
**Deployed By:** ___________  
**Preview URL:** ___________  
**Status:** ___________
