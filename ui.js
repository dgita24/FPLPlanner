// ui.js - UI interactions + planner actions
import { state, loadTeamEntry, calculateSellingPrice } from './data.js';

// Sidebar toggle
window.toggleSidebarMenu = function () {
  document.getElementById('sidebar').classList.toggle('open');
};

// Remember where the last sale came from so the next buy goes there.
let lastSoldSide = null; // 'starting' | 'bench'

export function initUI() {
  // Inject CSS for two-click swap highlight (no index.html change needed)
  if (!document.getElementById('pendingSwapStyle')) {
    const style = document.createElement('style');
    style.id = 'pendingSwapStyle';
    style.textContent = `
      .player-card.pending-swap {
        outline: 3px solid #00ff87;
        box-shadow: 0 0 0 3px rgba(0, 255, 135, 0.25);
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

  updateUI();
}

// Import team from FPL (Option A: latest publicly available picks)
window.importTeam = async function () {
  const teamId = document.getElementById('importTeamId').value.trim();
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

  // reset transfer intent
  lastSoldSide = null;

  updateUI();
};

function changeGW(delta) {
  const minGW = state.currentGW;
  const maxGW = state.currentGW + 7;

  let next = state.viewingGW + delta;
  if (next < minGW) next = minGW;
  if (next > maxGW) next = maxGW;

  state.viewingGW = next;

  // cancel any in-progress swap when changing GW
  pendingSwap = null;

  // also clear transfer intent when changing GW
  lastSoldSide = null;

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

// --- Two-click swap state ---
let pendingSwap = null; // { id: number, side: 'starting'|'bench' }

function getSide(team, playerId) {
  if (team.starting.some((e) => e.id === playerId)) return 'starting';
  if (team.bench.some((e) => e.id === playerId)) return 'bench';
  return null;
}

function isGK(playerId) {
  const p = getPlayer(playerId);
  return p?.element_type === 1;
}

function swapWithinTeam(team, aId, bId) {
  const aStart = team.starting.findIndex((e) => e.id === aId);
  const aBench = team.bench.findIndex((e) => e.id === aId);
  const bStart = team.starting.findIndex((e) => e.id === bId);
  const bBench = team.bench.findIndex((e) => e.id === bId);

  // Must be opposite sides.
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

function removePlayer(playerId, source) {
  if (pendingSwap && pendingSwap.id === playerId) pendingSwap = null;

  // record where the sale came from, so the next buy goes there
  if (source === 'starting' || source === 'bench') lastSoldSide = source;

  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  // Find the entry in the currently viewed GW (sell once)
  const entry =
    team.starting.find((e) => e.id === playerId) ||
    team.bench.find((e) => e.id === playerId);

  if (!entry) return;

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

  showMessage(
    'Player sold. Now pick a replacement from the table and click Add to squad.',
    'info'
  );
  updateUI();
}

// Two-click substitute swap (starter ↔ bench)
function substitutePlayer(playerId) {
  const gw = state.viewingGW;
  const teamNow = state.plan[gw];
  if (!teamNow) return;

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

  // Basic safety: GK must swap with GK.
  if (isGK(pendingSwap.id) !== isGK(playerId)) {
    pendingSwap = null;
    showMessage('Invalid swap: GK must swap with GK.', 'error');
    updateUI();
    return;
  }

  const a = pendingSwap.id;
  const b = playerId;

  // Apply swap from this GW forward (same propagation model as your other actions).
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    swapWithinTeam(t, a, b);
  }

  pendingSwap = null;
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

  if (!lastSoldSide) {
    showMessage(
      "Sell a player (X) first so the app knows whether to add to XI or bench.",
      'info'
    );
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

  const p = getPlayer(playerId);
  if (!p) {
    showMessage('Player data not found.', 'error');
    return;
  }

  const buy = p.now_cost / 10;
  if (state.bank < buy) {
    showMessage(
      `Not enough money. Need ${buy.toFixed(1)}m, have ${Number(state.bank).toFixed(1)}m.`,
      'error'
    );
    return;
  }

  // capacity check on the CURRENT GW team
  if (lastSoldSide === 'starting' && team.starting.length >= 11) {
    showMessage('Starting XI is already full.', 'error');
    return;
  }

  if (lastSoldSide === 'bench' && team.bench.length >= 4) {
    showMessage('Bench is already full.', 'error');
    return;
  }

  // Spend once
  state.bank = Number((state.bank - buy).toFixed(1));

  const purchasePrice = buy;
  const sellingPrice = calculateSellingPrice(purchasePrice, buy);
  const entry = { id: playerId, purchasePrice, sellingPrice };

  // Add from this GW forward
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

  // Reset intent so you can't add repeatedly without selling again.
  lastSoldSide = null;

  showMessage('Player bought and added to squad.', 'success');
  updateUI();
}

function updateUI() {
  // Always show the GW we are planning/viewing (starts at currentGW)
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.currentGW;

  // Enable/disable GW nav buttons
  const prevBtn = document.getElementById('prevGW');
  const nextBtn = document.getElementById('nextGW');
  if (prevBtn) prevBtn.disabled = state.viewingGW <= state.currentGW;
  if (nextBtn) nextBtn.disabled = state.viewingGW >= state.currentGW + 7;

  // Sync bank input
  const bankInput = document.getElementById('bankInput');
  if (bankInput) bankInput.value = Number(state.bank).toFixed(1);

  // Sync price dropdown
  const pm = document.getElementById('priceModeSelect');
  if (pm && pm.value !== state.priceMode) pm.value = state.priceMode;

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
    const p = getPlayer(e.id);
    const et = p ? p.element_type : null;
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
        <span>${teamShort}</span>
        <span>${label} ${price}</span>
      </div>
    </div>
  `;
}

// Toast
function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.className = `message msg-${type}`;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 3000);
}
