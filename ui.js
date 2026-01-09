// ui.js - UI interactions + planner actions
import { state, loadTeamEntry } from './data.js';

// Sidebar toggle
window.toggleSidebarMenu = function () {
  document.getElementById('sidebar').classList.toggle('open');
};

export function initUI() {
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

  // Expose nav + actions used by inline onclicks in index.html [file:12]
  window.changeGW = changeGW;
  window.removePlayer = removePlayer;
  window.substitutePlayer = substitutePlayer;

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
    showMessage(`Imported from GW${importedGW} (GW${state.currentGW} not public yet).`, 'success');
  } else {
    showMessage(`Team imported for GW${state.currentGW}.`, 'success');
  }

  updateUI();
};

function changeGW(delta) {
  const minGW = state.currentGW;
  const maxGW = state.currentGW + 7;

  let next = state.viewingGW + delta;
  if (next < minGW) next = minGW;
  if (next > maxGW) next = maxGW;

  state.viewingGW = next;
  updateUI();
}

function getPlayer(id) {
  return state.elements.find(p => p.id === id);
}

function getTeamShortName(teamId) {
  const t = state.teams.find(x => x.id === teamId);
  return t ? (t.short_name || t.shortname || t.name) : '';
}

function getTeamCode(teamId) {
  const t = state.teams.find(x => x.id === teamId);
  return t ? t.code : null;
}

function displayPrice(entry) {
  const p = getPlayer(entry.id);
  const current = p ? (p.now_cost / 10) : 0;

  if (state.priceMode === 'current') return current;
  if (state.priceMode === 'purchase') return entry.purchasePrice ?? current;

  // default: selling
  return entry.sellingPrice ?? current;
}

function removePlayer(playerId, source) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  // Find the entry in the currently viewed GW (sell once)
  const entry =
    team.starting.find(e => e.id === playerId) ||
    team.bench.find(e => e.id === playerId);

  if (!entry) return;

  // Add selling price to bank once
  const sell = entry.sellingPrice ?? displayPrice(entry);
  state.bank = Number((state.bank + sell).toFixed(1));

  // Remove from this GW and all future planned GWs
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    t.starting = t.starting.filter(e => e.id !== playerId);
    t.bench = t.bench.filter(e => e.id !== playerId);
  }

  updateUI();
}

function substitutePlayer(playerId) {
  const gw = state.viewingGW;

  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const inStart = t.starting.find(e => e.id === playerId);
    const inBench = t.bench.find(e => e.id === playerId);

    if (inStart) {
      if (t.bench.length >= 4) continue;
      t.starting = t.starting.filter(e => e.id !== playerId);
      if (!t.bench.find(e => e.id === playerId)) t.bench.push(inStart);
    } else if (inBench) {
      if (t.starting.length >= 11) continue;
      t.bench = t.bench.filter(e => e.id !== playerId);
      if (!t.starting.find(e => e.id === playerId)) t.starting.push(inBench);
    }
  }

  updateUI();
}

function updateUI() {
  // Always show the GW we are planning/viewing (starts at currentGW)
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.viewingGW;

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

// FIX #3: render GK first (top), then DEF, MID, FWD
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
    <div class="formation-line">${gk.map(e => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${def.map(e => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${mid.map(e => playerCard(e, 'starting')).join('')}</div>
    <div class="formation-line">${fwd.map(e => playerCard(e, 'starting')).join('')}</div>
  `;
}

function renderBench() {
  const benchSlots = document.getElementById('benchSlots');
  const team = state.plan[state.viewingGW];
  if (!benchSlots || !team) {
    if (benchSlots) benchSlots.innerHTML = '';
    return;
  }

  benchSlots.innerHTML = team.bench.map(e => playerCard(e, 'bench')).join('');
}

function playerCard(entry, source) {
  const p = getPlayer(entry.id);
  if (!p) return '';

  const teamId = p.team;
  const teamCode = getTeamCode(teamId);
  const teamShort = getTeamShortName(teamId);

  const price = displayPrice(entry).toFixed(1);
  const label =
    state.priceMode === 'current' ? 'Cur' :
    state.priceMode === 'purchase' ? 'Buy' : 'Sell';

  // FIX #4: X (transfer out) + Substitute buttons
  // Uses existing CSS classes in your index.html (.card-btn/.btn-remove/.btn-swap) [file:12]
  const removeFn = `removePlayer(${entry.id}, '${source}')`;
  const subFn = `substitutePlayer(${entry.id})`;

  return `
    <div class="player-card">
      <button class="card-btn btn-remove" onclick="${removeFn}" title="Transfer out">×</button>
      <button class="card-btn btn-swap" onclick="${subFn}" title="Substitute">⇅</button>

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
  setTimeout(() => toast.style.display = 'none', 3000);
}
