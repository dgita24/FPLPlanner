// ui-render.js - Rendering-related functionality (pitch, bench, player cards, etc.)

import { state, loadFixtures } from './data.js';
import { getElementType } from './validation.js';
import { getBatchTransferInfo } from './team-operations.js';

// --- Fixtures cache (per GW) ---
const fixturesByGW = new Map(); // gw -> fixtures[]
let fixturesLoadToken = 0;

// State for pending swap (two-click swap highlight)
let pendingSwap = null; // { id: number, side: 'starting'|'bench' }

export function setPendingSwap(value) {
  pendingSwap = value;
}

export function getPendingSwap() {
  return pendingSwap;
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

export function displayPrice(entry) {
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

export function ensureFixturesForView() {
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
   RENDER
-------------------------- */

// Render GK first (top), then DEF, MID, FWD
export function renderPitch() {
  const pitch = document.getElementById('pitch');
  const team = state.plan[state.viewingGW];
  if (!pitch || !team) {
    if (pitch) pitch.innerHTML = '';
    return;
  }

  const starting = team.starting;
  const batchInfo = getBatchTransferInfo();

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

  // Add placeholders for removed starting XI players
  if (batchInfo.isActive) {
    const removedStarters = batchInfo.removedPlayers.filter(rp => rp.side === 'starting');
    for (const removed of removedStarters) {
      const p = getPlayer(removed.id);
      if (!p) continue;
      const et = getElementType(removed.id);
      const placeholder = { ...removed, isPlaceholder: true };
      if (et === 1) gk.push(placeholder);
      else if (et === 2) def.push(placeholder);
      else if (et === 3) mid.push(placeholder);
      else if (et === 4) fwd.push(placeholder);
    }
  }

  const renderCard = (e) => e.isPlaceholder ? placeholderCard(e, 'starting') : playerCard(e, 'starting');

  pitch.innerHTML = `
    <div class="formation-line">${gk.map(renderCard).join('')}</div>
    <div class="formation-line">${def.map(renderCard).join('')}</div>
    <div class="formation-line">${mid.map(renderCard).join('')}</div>
    <div class="formation-line">${fwd.map(renderCard).join('')}</div>
  `;
}

export function renderBench() {
  const benchSlots = document.getElementById('benchSlots');
  const team = state.plan[state.viewingGW];
  if (!benchSlots || !team) {
    if (benchSlots) benchSlots.innerHTML = '';
    return;
  }

  const batchInfo = getBatchTransferInfo();
  let benchPlayers = [...team.bench];

  // Add placeholders for removed bench players
  if (batchInfo.isActive) {
    const removedBench = batchInfo.removedPlayers.filter(rp => rp.side === 'bench');
    for (const removed of removedBench) {
      benchPlayers.push({ ...removed, isPlaceholder: true });
    }
  }

  const renderCard = (e) => e.isPlaceholder ? placeholderCard(e, 'bench') : playerCard(e, 'bench');
  benchSlots.innerHTML = benchPlayers.map(renderCard).join('');
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

      <img src="https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png"
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

// Placeholder card for removed players during batch transfers
function placeholderCard(removedPlayer, source) {
  const p = getPlayer(removedPlayer.id);
  if (!p) return '';

  const teamId = p.team;
  const teamCode = getTeamCode(teamId);
  const teamShort = getTeamShortName(teamId);

  const price = removedPlayer.sellingPrice.toFixed(1);

  return `
    <div class="player-card placeholder-card">
      <div class="placeholder-overlay">
        <span class="placeholder-text">SOLD</span>
        <span class="placeholder-price">+£${price}m</span>
      </div>

      <img src="https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png"
           class="badge" alt="${teamShort}">

      <div class="name">${p.web_name}</div>

      <div class="info">
        <span class="team">${teamShort}</span>
        <span class="next-fixture fixture-next">--</span>
        <span class="price">Sell ${price}</span>
      </div>

      <div class="future-fixtures">
        <span class="fixture">--</span>
        <span class="fixture">--</span>
        <span class="fixture">--</span>
      </div>
    </div>
  `;
}

// Toast
export function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.className = `message msg-${type}`;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 3000);
}
