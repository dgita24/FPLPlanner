// ui.js - UI interactions + planner actions
// ui.js - Added to try force git commit
import { state, loadTeamEntry, calculateSellingPrice, loadFixtures } from './data.js';
import { renderTable } from './table.js';

// Sidebar toggle
let sidebarJustToggled = false;
window.toggleSidebarMenu = function () {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.toggle('open');
  // Prevent immediate outside-click handler from closing the sidebar right after toggle
  sidebarJustToggled = true;
  setTimeout(() => (sidebarJustToggled = false), 300);
};

function closeSidebar() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  sb.classList.remove('open');
  sidebarJustToggled = false;
}

// Remember where the last sale came from so the next buy goes there.
let lastSoldSide = null; // 'starting' | 'bench'

// Snapshot used to cancel a planned transfer (sale before buy).
let pendingTransfer = null; // { plan, bank }

// --- Two-click swap state ---
let pendingSwap = null; // { id: number, side: 'starting'|'bench' }

// --- Fixtures cache (per GW) ---
const fixturesByGW = new Map(); // gw -> fixtures[]
let fixturesLoadToken = 0;

export function initUI() {
  // Inject CSS for two-click swap highlight + fixture UI (no index.html change needed)
  if (!document.getElementById('plannerInjectedStyle')) {
    const style = document.createElement('style');
    style.id = 'plannerInjectedStyle';
    style.textContent = `
      .player-card.pending-swap {
        outline: 3px solid #00ff87;
        box-shadow: 0 0 0 3px rgba(0, 255, 135, 0.25);
      }

      /* Next fixture + fixtures strip */
      .player-card .fixture {
        font-size: 11px;
        color: #6f2dbd; /* purple */
        text-align: center;
        white-space: nowrap;
      }

      .player-card .fixture-next {
        font-weight: 800;
      }

      /* Put team | next fixture | price on one centered row */
      .player-card .info {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        column-gap: 6px;
      }

      .player-card .info .team {
        justify-self: start;
      }

      .player-card .info .next-fixture {
        justify-self: center;
        font-size: 11px;
        font-weight: 800;
        color: #6f2dbd; /* purple */
        white-space: nowrap;
      }

      .player-card .info .price {
        justify-self: end;
      }

      .player-card .future-fixtures {
        margin-top: 4px;
        padding: 3px 4px;
        border-top: 1px solid rgba(0,0,0,0.12);
        display: flex;
        justify-content: center;
        gap: 8px;
        flex-wrap: nowrap;
      }

      .player-card .future-fixtures .fixture {
        font-size: 10px;
        font-weight: 600;
        opacity: 0.95;
      }
    `;
    document.head.appendChild(style);
  }

  // Bank input should be editable and reflect state.bank
  const bankInput = document.getElementById('bankInput');
  if (bankInput) {
    bankInput.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 0) {
        e.target.value = state.bank.toFixed(1);
        return;
      }
      state.bank = v;
      updateUI();
    });
  }

  // Price mode dropdown should update player card prices
  const pm = document.getElementById('priceModeSelect');
  if (pm) {
    pm.addEventListener('change', (e) => {
      state.priceMode = e.target.value;
      updateUI();
    });
  }

  // Expose nav + actions used by inline onclicks in index.html
  window.changeGW = changeGW;
  window.removePlayer = removePlayer;
  window.substitutePlayer = substitutePlayer;
  window.addSelectedToSquad = addSelectedToSquad;
  window.cancelTransfer = cancelTransfer;

  // Close sidebar when clicking outside it (but avoid immediately closing right after toggle)
  document.addEventListener('click', (e) => {
    if (sidebarJustToggled) return;
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    if (!sb.classList.contains('open')) return;
    // If click is outside the sidebar, close it
    if (!e.target.closest('#sidebar')) {
      closeSidebar();
    }
  });

  // Close sidebar on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });

  updateUI();
}

// Import team from FPL
window.importTeam = async function () {
  const teamId = document.getElementById('importTeamId')?.value?.trim();
  if (!teamId) {
    showMessage('Enter Team ID', 'error');
    return;
  }

  showMessage(`Loading team (planning GW${state.currentGW})...`, 'info');

  const data = await loadTeamEntry(teamId, state.currentGW);

  if (!data || !data.picks) {
    showMessage('Failed to load team.', 'error');
    return;
  }

  const importedGW = data._imported_gw || state.importedGW;
  if (importedGW && importedGW !== state.currentGW) {
    showMessage(
      `Imported from GW${importedGW} (GW${state.currentGW} not public yet).`,
      'success'
    );
  } else {
    showMessage(`Team imported for GW${state.currentGW}.`, 'success');
  }

  // Always show/planning the active GW after import
  state.viewingGW = state.currentGW;

  // reset transient UI state
  lastSoldSide = null;
  pendingTransfer = null;
  pendingSwap = null;

  // Close the menu after import
  closeSidebar();

  updateUI();
};

function changeGW(delta) {
  if (pendingTransfer) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return;
  }

  const minGW = state.currentGW;
  const maxGW = state.currentGW + 7;

  let next = state.viewingGW + delta;
  if (next < minGW) next = minGW;
  if (next > maxGW) next = maxGW;

  state.viewingGW = next;

  // cancel any in-progress swap when changing GW
  pendingSwap = null;

  updateUI();
}

function getPlayer(id) {
  return state.elements.find((p) => p.id === id);
}

function getTeamShortName(teamId) {
  const t = state.teams.find((x) => x.id === teamId);
  return t ? (t.short_name || t.shortname || t.name) : '';
}

function getTeamCode(teamId) {
  const t = state.teams.find((x) => x.id === teamId);
  return t ? t.code : null;
}

function displayPrice(entry) {
  const p = getPlayer(entry.id);
  const current = p ? p.now_cost / 10 : 0;

  if (state.priceMode === 'current') return current;
  if (state.priceMode === 'purchase') return entry.purchasePrice ?? current;

  // default: selling
  return entry.sellingPrice ?? current;
}

/* -------------------------
   FIXTURE HELPERS
-------------------------- */

function kickoffTimeValue(fx) {
  // kickoff_time is ISO string or null; null should sort last.
  if (!fx?.kickoff_time) return Number.POSITIVE_INFINITY;
  const t = Date.parse(fx.kickoff_time);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function bestFixtureForTeamInGW(teamId, fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return null;

  const matches = fixtures.filter(
    (f) => f && (f.team_h === teamId || f.team_a === teamId)
  );
  if (matches.length === 0) return null;

  matches.sort((a, b) => kickoffTimeValue(a) - kickoffTimeValue(b));
  return matches[0];
}

function formatOpponent(teamId, fixture) {
  if (!fixture) return '--';

  const isHome = fixture.team_h === teamId;
  const oppId = isHome ? fixture.team_a : fixture.team_h;
  const opp = getTeamShortName(oppId) || '???';
  return `${opp} (${isHome ? 'H' : 'A'})`;
}

function getNextFixturesForTeam(teamId, startGW, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const gw = startGW + i;

    if (!fixturesByGW.has(gw)) {
      out.push('--');
      continue;
    }

    const list = fixturesByGW.get(gw);
    const fx = bestFixtureForTeamInGW(teamId, list);
    out.push(formatOpponent(teamId, fx));
  }
  return out;
}

function ensureFixturesForView() {
  const token = ++fixturesLoadToken;
  const start = state.viewingGW;
  const needed = [start, start + 1, start + 2, start + 3];
  const missing = needed.filter((gw) => !fixturesByGW.has(gw));

  if (missing.length === 0) return;

  Promise.all(
    missing.map((gw) =>
      loadFixtures(gw)
        .then((fx) => {
          fixturesByGW.set(gw, Array.isArray(fx) ? fx : []);
        })
        .catch(() => {
          fixturesByGW.set(gw, []);
        })
    )
  ).then(() => {
    if (token !== fixturesLoadToken) return;
    // Re-render once fixtures arrive
    renderPitch();
    renderBench();
  });
}

/* -------------------------
   FPL RULE HELPERS
-------------------------- */

function getElementType(playerId) {
  const p = getPlayer(playerId);
  return p?.element_type ?? null; // 1 GK, 2 DEF, 3 MID, 4 FWD
}

function getPlayerTeamId(playerId) {
  const p = getPlayer(playerId);
  return p?.team ?? null;
}

// Enforced: exactly 1 GK, min 3 DEF, min 2 MID, min 1 FWD.
function validateStartingXI(team) {
  if (!team || !Array.isArray(team.starting)) {
    return { ok: false, message: 'Internal error: missing starting XI.' };
  }

  // Only validate when XI is complete.
  if (team.starting.length !== 11) return { ok: true, message: '' };

  let gk = 0, def = 0, mid = 0, fwd = 0;

  for (const e of team.starting) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }

  if (gk !== 1) return { ok: false, message: 'Invalid formation: must have exactly 1 GK in the starting XI.' };
  if (def < 3) return { ok: false, message: 'Invalid formation: must have at least 3 defenders in the starting XI.' };
  if (mid < 2) return { ok: false, message: 'Invalid formation: must have at least 2 midfielders in the starting XI.' };
  if (fwd < 1) return { ok: false, message: 'Invalid formation: must have at least 1 forward in the starting XI.' };

  if (def > 5) return { ok: false, message: 'Invalid formation: max 5 defenders in the starting XI.' };
  if (mid > 5) return { ok: false, message: 'Invalid formation: max 5 midfielders in the starting XI.' };
  if (fwd > 3) return { ok: false, message: 'Invalid formation: max 3 forwards in the starting XI.' };

  return { ok: true, message: '' };
}

function getClubCounts(team) {
  const counts = new Map();
  if (!team) return counts;

  const all = [...(team.starting || []), ...(team.bench || [])];
  for (const e of all) {
    const tid = getPlayerTeamId(e.id);
    if (tid == null) continue;
    counts.set(tid, (counts.get(tid) || 0) + 1);
  }
  return counts;
}

function getOverLimitClubs(team) {
  const counts = getClubCounts(team);
  const over = new Set();
  for (const [tid, c] of counts.entries()) {
    if (c > 3) over.add(tid);
  }
  return over;
}

function validateClubLimit(team) {
  const counts = getClubCounts(team);
  for (const [, c] of counts.entries()) {
    if (c > 3) return { ok: false, message: 'Invalid squad: max 3 players per club.' };
  }
  return { ok: true, message: '' };
}

/* -------------------------
   CANCEL TRANSFER (ROBUST)
-------------------------- */

function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function snapshotForCancel() {
  return {
    plan: deepClone(state.plan),
    bank: state.bank,
  };
}

function restorePlanInPlace(snapshotPlan) {
  // Keep the same object reference for state.plan; replace its contents.
  for (const k of Object.keys(state.plan)) delete state.plan[k];
  for (const [k, v] of Object.entries(snapshotPlan)) state.plan[k] = v;
}

function cancelTransfer() {
  if (!pendingTransfer) {
    showMessage('No pending transfer to cancel.', 'info');
    return;
  }

  restorePlanInPlace(pendingTransfer.plan);
  state.bank = pendingTransfer.bank;

  pendingTransfer = null;
  lastSoldSide = null;

  showMessage('Transfer cancelled. Sold player restored.', 'success');
  updateUI();
}

/* -------------------------
   TWO-CLICK SWAP
-------------------------- */

function getSide(team, playerId) {
  if (team.starting.some((e) => e.id === playerId)) return 'starting';
  if (team.bench.some((e) => e.id === playerId)) return 'bench';
  return null;
}

function isGK(playerId) {
  return getElementType(playerId) === 1;
}

function swapWithinTeam(team, aId, bId) {
  const aStart = team.starting.findIndex((e) => e.id === aId);
  const aBench = team.bench.findIndex((e) => e.id === aId);
  const bStart = team.starting.findIndex((e) => e.id === bId);
  const bBench = team.bench.findIndex((e) => e.id === bId);

  if (aStart !== -1 && bBench !== -1) {
    const tmp = team.starting[aStart];
    team.starting[aStart] = team.bench[bBench];
    team.bench[bBench] = tmp;
    return true;
  }

  if (aBench !== -1 && bStart !== -1) {
    const tmp = team.bench[aBench];
    team.bench[aBench] = team.starting[bStart];
    team.starting[bStart] = tmp;
    return true;
  }

  return false;
}

function substitutePlayer(playerId) {
  const gw = state.viewingGW;
  const teamNow = state.plan[gw];
  if (!teamNow) return;

  if (pendingTransfer) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return;
  }

  const sideNow = getSide(teamNow, playerId);
  if (!sideNow) return;

  // First click: arm selection.
  if (!pendingSwap) {
    pendingSwap = { id: playerId, side: sideNow };
    updateUI();
    return;
  }

  // Click same player again: cancel.
  if (pendingSwap.id === playerId) {
    pendingSwap = null;
    updateUI();
    return;
  }

  // Clicking a different player on the same side: keep original armed selection.
  if (pendingSwap.side === sideNow) {
    const want = pendingSwap.side === 'starting' ? 'bench' : 'starter';
    showMessage(
      `Swap in progress: select a ${want} to complete (or click again to cancel).`,
      'info'
    );
    updateUI();
    return;
  }

  // GK must swap with GK.
  if (isGK(pendingSwap.id) !== isGK(playerId)) {
    pendingSwap = null;
    showMessage('Invalid swap: GK must swap with GK.', 'error');
    updateUI();
    return;
  }

  const a = pendingSwap.id;
  const b = playerId;

  // Validate formation for every affected GW before applying
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const temp = {
      starting: t.starting.map((x) => ({ ...x })),
      bench: t.bench.map((x) => ({ ...x })),
    };

    swapWithinTeam(temp, a, b);
    const v = validateStartingXI(temp);
    if (!v.ok) {
      pendingSwap = null;
      showMessage(v.message, 'error');
      updateUI();
      return;
    }
  }

  // Apply swap from this GW forward
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    swapWithinTeam(t, a, b);
  }

  pendingSwap = null;
  updateUI();
}

/* -------------------------
   TRANSFERS (SELL/BUY)
-------------------------- */

function removePlayer(playerId, source) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  if (pendingTransfer) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return;
  }

  // If currently over the 3-per-club limit, the next transfer out must be from that club.
  const overLimit = getOverLimitClubs(team);
  if (overLimit.size > 0) {
    const playerClub = getPlayerTeamId(playerId);
    if (!overLimit.has(playerClub)) {
      showMessage('You have 4+ players from a club. Your next transfer out must be from that club.', 'error');
      return;
    }
  }

  // Find the entry in the currently viewed GW (sell once)
  const entry =
    team.starting.find((e) => e.id === playerId) ||
    team.bench.find((e) => e.id === playerId);

  if (!entry) return;

  // Snapshot BEFORE any mutations so we can cancel and restore
  pendingTransfer = snapshotForCancel();

  // record where the sale came from, so the next buy goes there
  if (source === 'starting' || source === 'bench') lastSoldSide = source;

  // Add selling price to bank once
  const sell = entry.sellingPrice ?? displayPrice(entry);
  state.bank = Number((state.bank + sell).toFixed(1));

  // Remove from this GW and all future planned GWs
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    t.starting = t.starting.filter((e) => e.id !== playerId);
    t.bench = t.bench.filter((e) => e.id !== playerId);
  }

  showMessage('Player sold. Pick a replacement and click Add to squad (or Cancel transfer).', 'info');
  updateUI();
}

function addSelectedToSquad() {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  const playerId = window.selectedPlayerId;
  if (!playerId) {
    showMessage('Select a player in the table first.', 'error');
    return;
  }

  if (!lastSoldSide || !pendingTransfer) {
    showMessage('Sell a player first (X), then Add to squad (or Cancel transfer).', 'info');
    return;
  }

  const p = getPlayer(playerId);
  if (!p) {
    showMessage('Player data not found.', 'error');
    return;
  }

  // Prevent duplicates
  const already =
    team.starting.some((e) => e.id === playerId) ||
    team.bench.some((e) => e.id === playerId);
  if (already) {
    showMessage('That player is already in your squad.', 'error');
    return;
  }

  // Budget check
  const buy = p.now_cost / 10;
  if (state.bank < buy) {
    showMessage(
      `Not enough money. Need ${buy.toFixed(1)}m, have ${Number(state.bank).toFixed(1)}m.`,
      'error'
    );
    return;
  }

  // Capacity check on the CURRENT GW team
  if (lastSoldSide === 'starting' && team.starting.length >= 11) {
    showMessage('Starting XI is already full.', 'error');
    return;
  }
  if (lastSoldSide === 'bench' && team.bench.length >= 4) {
    showMessage('Bench is already full.', 'error');
    return;
  }

  const purchasePrice = buy;
  const sellingPrice = calculateSellingPrice(purchasePrice, buy);
  const entry = { id: playerId, purchasePrice, sellingPrice };

  // Validate across all affected GWs BEFORE spending money / applying
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const temp = {
      starting: t.starting.map((x) => ({ ...x })),
      bench: t.bench.map((x) => ({ ...x })),
    };

    if (lastSoldSide === 'starting') temp.starting.push({ ...entry });
    else temp.bench.push({ ...entry });

    const clubOk = validateClubLimit(temp);
    if (!clubOk.ok) {
      showMessage('Invalid transfer: max 3 players per club (or fix an over-limit club first).', 'error');
      return;
    }

    const v = validateStartingXI(temp);
    if (!v.ok) {
      showMessage(v.message, 'error');
      return;
    }
  }

  // Spend once (only after validation passes)
  state.bank = Number((state.bank - buy).toFixed(1));

  // Apply add from this GW forward
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const exists =
      t.starting.some((e) => e.id === playerId) ||
      t.bench.some((e) => e.id === playerId);
    if (exists) continue;

    if (lastSoldSide === 'starting') {
      if (t.starting.length < 11) t.starting.push({ ...entry });
    } else {
      if (t.bench.length < 4) t.bench.push({ ...entry });
    }
  }

  // Clear pending transfer state
  lastSoldSide = null;
  pendingTransfer = null;

  showMessage('Player bought and added to squad.', 'success');
  updateUI();
}

/* -------------------------
   RENDER
-------------------------- */

function updateUI() {
  // kick off fixture loads for current viewing window (async)
  ensureFixturesForView();

  // Show the GW being viewed/planned
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.viewingGW;

  const prevBtn = document.getElementById('prevGW');
  const nextBtn = document.getElementById('nextGW');
  if (prevBtn) prevBtn.disabled = state.viewingGW <= state.currentGW;
  if (nextBtn) nextBtn.disabled = state.viewingGW >= state.currentGW + 7;

  const bankInput = document.getElementById('bankInput');
  if (bankInput) bankInput.value = Number(state.bank).toFixed(1);

  const pm = document.getElementById('priceModeSelect');
  if (pm && pm.value !== state.priceMode) pm.value = state.priceMode;

  // Enable/disable cancel transfer button (if present)
  const cancelBtn = document.getElementById('cancelTransferBtn');
  if (cancelBtn) cancelBtn.disabled = !pendingTransfer;

  renderPitch();
  renderBench();
}

// Render GK first (top), then DEF, MID, FWD
function renderPitch() {
  const pitch = document.getElementById('pitch');
  const team = state.plan[state.viewingGW];
  if (!pitch || !team) {
    if (pitch) pitch.innerHTML = '';
    return;
  }

  const starting = team.starting;

  const gk = [];
  const def = [];
  const mid = [];
  const fwd = [];

  for (const e of starting) {
    const et = getElementType(e.id);
    if (et === 1) gk.push(e);
    else if (et === 2) def.push(e);
    else if (et === 3) mid.push(e);
    else if (et === 4) fwd.push(e);
  }

  pitch.innerHTML = `
    <div class="formation-line">${gk.map((e) => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${def.map((e) => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${mid.map((e) => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${fwd.map((e) => playerCard(e, 'starting')).join('')}</div>
  `;
}

function renderBench() {
  const benchSlots = document.getElementById('benchSlots');
  const team = state.plan[state.viewingGW];
  if (!benchSlots || !team) {
    if (benchSlots) benchSlots.innerHTML = '';
    return;
  }

  benchSlots.innerHTML = team.bench.map((e) => playerCard(e, 'bench')).join('');
}

renderTable();

function playerCard(entry, source) {
  const p = getPlayer(entry.id);
  if (!p) return '';

  const teamId = p.team;
  const teamCode = getTeamCode(teamId);
  const teamShort = getTeamShortName(teamId);

  const price = displayPrice(entry).toFixed(1);
  const label =
    state.priceMode === 'current'
      ? 'Cur'
      : state.priceMode === 'purchase'
        ? 'Buy'
        : 'Sell';

  const fx = getNextFixturesForTeam(teamId, state.viewingGW, 4);
  const fx1 = fx[0] || '--';
  const fx2 = fx[1] || '--';
  const fx3 = fx[2] || '--';
  const fx4 = fx[3] || '--';

  const removeFn = `removePlayer(${entry.id}, '${source}')`;
  const subFn = `substitutePlayer(${entry.id})`;

  const armed = pendingSwap && pendingSwap.id === entry.id;
  const cardClass = `player-card${armed ? ' pending-swap' : ''}`;
  const swapTitle = armed ? 'Cancel swap' : 'Swap';

  return `
    <div class="${cardClass}">
      <button class="card-btn btn-remove" onclick="${removeFn}" title="Transfer out">×</button>
      <button class="card-btn btn-swap" onclick="${subFn}" title="${swapTitle}">⇅</button>

      <img src="https://resources.premierleague.com/premierleague/badges/t${teamCode}.png"
           class="badge" alt="${teamShort}">

      <div class="name">${p.web_name}</div>

      <div class="info">
        <span class="team">${teamShort}</span>
        <span class="next-fixture fixture-next">${fx1}</span>
        <span class="price">${label} ${price}</span>
      </div>

      <div class="future-fixtures">
        <span class="fixture">${fx2}</span>
        <span class="fixture">${fx3}</span>
        <span class="fixture">${fx4}</span>
      </div>
    </div>
  `;
}

// Toast
function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = `message msg-${type}`;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 3000);
}

window.localSave = function() {
    try {
        const data = {
            plan: state.plan,
            bank: state.bank,
            viewingGW: state.viewingGW,
            priceMode: state.priceMode
        };
        localStorage.setItem('fplplanner-state', JSON.stringify(data));
        showMessage('Team saved locally', 'success');
    } catch (e) {
        showMessage('Local save failed', 'error');
    }
};

window.localLoad = function() {
    try {
        const saved = localStorage.getItem('fplplanner-state');
        if (!saved) {
            showMessage('No local save found', 'info');
            return;
        }
        const data = JSON.parse(saved);
        state.plan = data.plan;
        state.bank = data.bank;
        state.viewingGW = data.viewingGW;
        state.priceMode = data.priceMode;
        updateUI();
        showMessage('Team loaded locally', 'success');
    } catch (e) {
        showMessage('Local load failed', 'error');
    }
};

// Cloud Save
window.saveTeam = async function() {
    const teamId = document.getElementById('saveTeamId')?.value?.trim();
    const password = document.getElementById('savePassword')?.value?.trim();
    const label = document.getElementById('saveLabel')?.value?.trim();
    
    if (!teamId || !password) {
        showMessage('Enter Team ID and Password', 'error');
        return;
    }
    
    const sideMsg = document.getElementById('sideMsg');
    if (sideMsg) sideMsg.textContent = 'Saving...';
    
    try {
        const payload = {
            plan: state.plan,
            bank: state.bank,
            viewingGW: state.viewingGW,
            priceMode: state.priceMode
        };
        
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamid: teamId, label, password, payload })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showMessage('Team saved to cloud!', 'success');
            if (sideMsg) sideMsg.textContent = `✓ Saved as: ${teamId}`;
            // Close sidebar after successful save
            closeSidebar();
        } else {
            throw new Error(result.error || 'Save failed');
        }
    } catch (err) {
        showMessage(`Save error: ${err.message}`, 'error');
        if (sideMsg) sideMsg.textContent = `Error: ${err.message}`;
    }
};

// Cloud Load
window.loadTeam = async function() {
    const teamId = document.getElementById('loadTeamId')?.value?.trim();
    const password = document.getElementById('loadPassword')?.value?.trim();
    
    if (!teamId || !password) {
        showMessage('Enter Team ID and Password', 'error');
        return;
    }
    
    const sideMsg = document.getElementById('sideMsg');
    if (sideMsg) sideMsg.textContent = 'Loading...';
    
    try {
        const response = await fetch('/api/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teamid: teamId, password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const data = result.data;
            state.plan = data.payload.plan;
            state.bank = data.payload.bank;
            state.viewingGW = data.payload.viewingGW;
            state.priceMode = data.payload.priceMode;
            
            updateUI();
            showMessage('Team loaded from cloud!', 'success');
            if (sideMsg) sideMsg.textContent = `✓ Loaded: ${data.label || teamId}`;
            
            // Close sidebar after load
            closeSidebar();
        } else {
            throw new Error(result.error || 'Load failed');
        }
    } catch (err) {
        showMessage(`Load error: ${err.message}`, 'error');
        if (sideMsg) sideMsg.textContent = `Error: ${err.message}`;
    }
};

