// ui-render.js - Rendering-related functionality (pitch, bench, player cards, etc.)

import { state, loadFixtures } from './data.js';
import { getElementType } from './validation.js';
import { getBatchTransferInfo } from './team-operations.js';
import { shouldShowPlayerFlag } from './player-status-utils.js';

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

function allFixturesForTeamInGW(teamId, fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

  const matches = fixtures.filter(
    (f) => f && (f.team_h === teamId || f.team_a === teamId)
  );

  matches.sort((a, b) => kickoffTimeValue(a) - kickoffTimeValue(b));
  return matches;
}

function formatOpponent(teamId, fixture) {
  if (!fixture) return '--';

  const isHome = fixture.team_h === teamId;
  const oppId = isHome ? fixture.team_a : fixture.team_h;
  const opp = getTeamShortName(oppId) || '???';
  return `${opp} (${isHome ? 'H' : 'A'})`;
}

function formatOpponentCompact(teamId, fixture) {
  if (!fixture) return '--';

  const isHome = fixture.team_h === teamId;
  const oppId = isHome ? fixture.team_a : fixture.team_h;
  const opp = getTeamShortName(oppId) || '???';
  // Home fixtures: UPPERCASE, Away fixtures: lowercase
  return isHome ? opp.toUpperCase() : opp.toLowerCase();
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
    const matches = allFixturesForTeamInGW(teamId, list);
    if (matches.length === 0) {
      out.push('--');
      continue;
    }
    out.push(matches.map((fx) => formatOpponent(teamId, fx)).join(' + '));
  }
  return out;
}

function getNextFixturesCompact(teamId, startGW, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const gw = startGW + i;

    if (!fixturesByGW.has(gw)) {
      out.push('--');
      continue;
    }

    const list = fixturesByGW.get(gw);
    const matches = allFixturesForTeamInGW(teamId, list);
    if (matches.length === 0) {
      out.push('--');
      continue;
    }
    out.push(matches.map((fx) => formatOpponentCompact(teamId, fx)).join('+'));
  }
  return out;
}

// Returns an array where each element represents one GW and contains a fixtures
// array of {text, fdr} objects — one per fixture (2 entries for Double Gameweeks).
function getNextFixturesFDRData(teamId, startGW, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const gw = startGW + i;
    if (!fixturesByGW.has(gw)) {
      out.push({ fixtures: [{ text: '?', fdr: null }] });
      continue;
    }
    const list = fixturesByGW.get(gw);
    const matches = allFixturesForTeamInGW(teamId, list);
    if (matches.length === 0) {
      out.push({ fixtures: [{ text: '-', fdr: null }] });
      continue;
    }
    const gwFixtures = matches.map((fx) => {
      const isHome = fx.team_h === teamId;
      const oppId = isHome ? fx.team_a : fx.team_h;
      const opp = getTeamShortName(oppId) || '???';
      const text = isHome ? opp.toUpperCase() : opp.toLowerCase();
      const fdr = isHome ? fx.team_h_difficulty : fx.team_a_difficulty;
      return { text, fdr };
    });
    out.push({ fixtures: gwFixtures });
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
   CHIP UI
-------------------------- */

function renderChipUI() {
  const team = state.plan[state.viewingGW];
  if (!team) return '';

  const currentChip = team.chip;
  const gw = state.viewingGW;

  // Chip indicator - shown when a chip is selected
  const chipIndicator = currentChip ? `
    <div class="chip-indicator">
      <span class="chip-icon">🎯</span>
      <span class="chip-name">${getChipDisplayName(currentChip)}</span>
      <span class="chip-gw">GW${gw}</span>
    </div>
  ` : '';

  // Check which chips have been used in previous gameweeks
  const usedChips = new Set();
  for (let g = state.currentGW; g < gw; g++) {
    const prevTeam = state.plan[g];
    if (prevTeam && prevTeam.chip) {
      usedChips.add(prevTeam.chip);
    }
  }

  // Define all chip types with their labels
  const chips = [
    { type: 'wildcard', label: 'Play WC', title: 'Select Wildcard chip for this gameweek' },
    { type: 'freehit', label: 'Play FH', title: 'Select Free Hit chip for this gameweek' },
    { type: 'bboost', label: 'Play BB', title: 'Select Bench Boost chip for this gameweek' },
    { type: '3xc', label: 'Play TC', title: 'Select Triple Captain chip for this gameweek' }
  ];

  // Render all chip buttons
  const chipButtons = chips.map(chip => {
    const isActive = currentChip === chip.type;
    const isUsed = usedChips.has(chip.type);
    
    let buttonClass = 'chip-btn-small';
    if (isActive) {
      buttonClass += ' chip-btn-active';
    } else if (isUsed) {
      buttonClass += ' chip-btn-used';
    }
    
    const buttonText = isActive 
      ? `✓ ${chip.label.replace('Play ', '')}` 
      : isUsed 
        ? `${chip.label.replace('Play ', '')}` 
        : chip.label;
    
    const buttonTitle = isUsed 
      ? `${getChipDisplayName(chip.type)} already used in a previous gameweek` 
      : chip.title;
    
    const disabledAttr = isUsed && !isActive ? 'disabled' : '';
    
    return `<button class="${buttonClass}" onclick="selectChip('${chip.type}')" title="${buttonTitle}" ${disabledAttr}>${buttonText}</button>`;
  }).join('');

  return `
    <div class="chip-container">
      ${chipIndicator}
      <div class="chip-buttons-row">
        ${chipButtons}
      </div>
    </div>
  `;
}

export function getChipDisplayName(chipType) {
  const chipNames = {
    'wildcard': 'Wildcard',
    'bboost': 'Bench Boost',
    '3xc': 'Triple Captain',
    'freehit': 'Free Hit'
  };
  return chipNames[chipType] || chipType;
}

/* -------------------------
   RENDER
-------------------------- */

// Render GK first (top), then DEF, MID, FWD
export function renderPitch() {
  const pitch = document.getElementById('pitch');
  const team = state.plan[state.viewingGW];
  
  if (!pitch || !team) {
    if (pitch) {
      pitch.innerHTML = '';
    }
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

  // Determine formation for CSS targeting
  const formation = `${def.length}${mid.length}${fwd.length}`;
  pitch.setAttribute('data-formation', formation);

  pitch.innerHTML = `
    <div class="pitch-left-controls">
      <button class="pitch-save-btn" onclick="openCloudSave()" title="Cloud Save">💾 Save</button>
      <button class="pitch-import-btn" onclick="openImportMenu()" title="Import Team">📥 Import</button>
      <button class="pitch-drafts-btn" onclick="openDraftsMenu()">📂 Drafts</button>
    </div>
    <div class="pitch-right-controls">
      <button class="pitch-reset-btn" onclick="resetToImportedTeam()">⏮️ Reset</button>
      <select class="pitch-price-btn" id="priceModeSelect" onchange="changePriceMode(this.value)">
        <option value="selling" ${state.priceMode === 'selling' ? 'selected' : ''}>Selling</option>
        <option value="purchase" ${state.priceMode === 'purchase' ? 'selected' : ''}>Purchase</option>
        <option value="current" ${state.priceMode === 'current' ? 'selected' : ''}>Current</option>
      </select>
      <div class="pitch-bank-badge pitch-bank-editable" id="pitchBankBadge" onclick="editPitchBank()" title="Edit bank balance">£${Number(state.bank).toFixed(1)}m</div>
    </div>
    <div class="formation-line" data-player-count="${gk.length}">${gk.map(renderCard).join('')}</div>
    <div class="formation-line" data-player-count="${def.length}">${def.map(renderCard).join('')}</div>
    <div class="formation-line" data-player-count="${mid.length}">${mid.map(renderCard).join('')}</div>
    <div class="formation-line" data-player-count="${fwd.length}">${fwd.map(renderCard).join('')}</div>
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

  // Render chip buttons in chip area below bench
  const chipArea = document.getElementById('chipArea');
  if (chipArea) {
    chipArea.innerHTML = renderChipUI();
  }
}

// Renders a single GW segment for the future-fixtures band.
// DGW segments stack two fixtures vertically; single GW shows one centered text.
function renderFutureFxSegment(gwData) {
  const fxs = gwData.fixtures;
  const fdrClass = (fdr) => (fdr != null ? `fdr-${fdr}` : 'fdr-none');
  if (fxs.length > 1) {
    const items = fxs
      .map((fx) => `<span class="${fdrClass(fx.fdr)}">${fx.text}</span>`)
      .join('');
    return `<div class="fdr-segment dgw">${items}</div>`;
  }
  const fx = fxs[0] || { text: '--', fdr: null };
  return `<div class="fdr-segment ${fdrClass(fx.fdr)}">${fx.text}</div>`;
}

function playerCard(entry, source) {
  const p = getPlayer(entry.id);
  if (!p) return '';

  const teamId = p.team;
  const teamCode = getTeamCode(teamId);
  const teamShort = getTeamShortName(teamId);

  const price = displayPrice(entry).toFixed(1);

  // Get compact fixtures with FDR data (4 GWs: current + 3 future)
  const fxData = getNextFixturesFDRData(teamId, state.viewingGW, 4);
  const gw1 = fxData[0] || { fixtures: [{ text: '--', fdr: null }] };
  const gw2 = fxData[1] || { fixtures: [{ text: '--', fdr: null }] };
  const gw3 = fxData[2] || { fixtures: [{ text: '--', fdr: null }] };
  const gw4 = fxData[3] || { fixtures: [{ text: '--', fdr: null }] };

  const removeFn = `removePlayer(${entry.id}, '${source}')`;
  const subFn = `substitutePlayer(${entry.id})`;

  const armed = pendingSwap && pendingSwap.id === entry.id;
  const isMarked = entry.marked === true;
  const cardClass = `player-card${armed ? ' pending-swap' : ''}${isMarked ? ' player-card--marked' : ''}`;
  const swapTitle = armed ? 'Cancel swap' : 'Swap';

  // Injury/suspension status badges
  let statusFlags = '';
  const events = state.bootstrap?.events || [];
  if (shouldShowPlayerFlag(p, state.viewingGW, state.currentGW, events)) {
    const isDoubtful = p.status === 'd';
    let badgeText = '0';
    let badgeClass = 'red';
    if (isDoubtful) {
      badgeClass = 'yellow';
      badgeText = getChanceOfPlayingDisplay(p, state.viewingGW, state.currentGW);
    }
    const flagTitle = escapeHtml(p.news || (isDoubtful ? 'Doubtful' : 'Unavailable'));
    statusFlags = `<div class="status-flag-badge ${badgeClass}" title="${flagTitle}">${badgeText}</div>`;
  }

  // Captain/Vice-Captain UI — only for starting XI players
  const team = state.plan[state.viewingGW];
  const isCaptain = team && team.captain === entry.id;
  const isViceCaptain = team && team.viceCaptain === entry.id;

  let captainBadge = '';
  let captainSelector = '';
  if (source === 'starting') {
    captainBadge = isCaptain ? `<div class="captain-badge c">C</div>`
                 : isViceCaptain ? `<div class="captain-badge vc">VC</div>`
                 : '';
    captainSelector = `
      <div class="captain-selector">
        <button class="captain-btn" onclick="event.stopPropagation(); setCaptain(${entry.id})" title="Set as Captain">C</button>
        <button class="captain-btn" onclick="event.stopPropagation(); setViceCaptain(${entry.id})" title="Set as Vice-Captain">VC</button>
      </div>
    `;
  }

  // FDR CSS class helper
  const fdrClass = (fdr) => fdr != null ? `fdr-${fdr}` : 'fdr-none';

  // Next fixture display: DGW shows two stacked lines
  const nextFxHtml = gw1.fixtures.length > 1
    ? `<div class="card-fixture-next dgw-next">${gw1.fixtures.map((fx) => `<span class="fxline">${fx.text}</span>`).join('')}</div>`
    : `<div class="card-fixture-next">${(gw1.fixtures[0] || { text: '--' }).text}</div>`;

  return `
    <div class="${cardClass}" onclick="onPlayerCardClick(${entry.id}, '${source}')">
      <div class="price-and-actions">
        <button class="quick-btn quick-remove" onclick="event.stopPropagation(); removePlayer(${entry.id}, '${source}')" aria-label="Transfer out">✖</button>
        <span class="card-price">${price}</span>
        <button class="quick-btn quick-swap" onclick="event.stopPropagation(); substitutePlayer(${entry.id})" aria-label="Swap">⇅</button>
      </div>
      ${captainBadge}
      ${statusFlags}

      <div class="badge-container">
        ${captainSelector}
        <img src="https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png"
             class="badge" alt="${teamShort}">
      </div>

      <div class="name">${p.web_name}</div>

      ${nextFxHtml}

      <div class="future-fixtures">
        ${renderFutureFxSegment(gw2)}
        ${renderFutureFxSegment(gw3)}
        ${renderFutureFxSegment(gw4)}
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
  const reinstateFn = `reinstatePlayer(${removedPlayer.id})`;

  return `
    <div class="player-card placeholder-card">
      <span class="card-price">${price}</span>
      <div class="placeholder-overlay">
        <button class="reinstate-btn" onclick="${reinstateFn}" title="Undo removal">↶</button>
        <span class="placeholder-text">SOLD</span>
        <span class="placeholder-price">+£${price}m</span>
      </div>

      <div class="badge-container">
        <img src="https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png"
             class="badge" alt="${teamShort}">
      </div>

      <div class="name">${p.web_name}</div>

      <div class="card-fixture-next">--</div>

      <div class="future-fixtures">
        <div class="fdr-segment fdr-none">--</div>
        <div class="fdr-segment fdr-none">--</div>
        <div class="fdr-segment fdr-none">--</div>
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

/* -------------------------
   SQUAD PLAYER INFO MODAL
-------------------------- */

const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper function to get team badge URL
function getTeamBadgeUrl(teamCode) {
  return teamCode ? `https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png` : '';
}

// Helper function to get chance of playing display value
// Returns the percentage to display for doubtful players
function getChanceOfPlayingDisplay(player, viewingGW, currentGW) {
  const isDoubtful = player.status === 'd';
  if (!isDoubtful) return '0';
  
  const chanceOfPlaying = viewingGW === currentGW 
    ? player.chance_of_playing_this_round 
    : viewingGW === currentGW + 1 
      ? player.chance_of_playing_next_round 
      : null;
  
  if (chanceOfPlaying !== null && chanceOfPlaying !== undefined) {
    // For player cards, show rounded values (25/50/75)
    if (chanceOfPlaying <= 25) return '25';
    else if (chanceOfPlaying <= 50) return '50';
    else if (chanceOfPlaying <= 75) return '75';
    else return '75';
  }
  
  return '50'; // Default if no data
}

// Show player info modal for squad players (pitch and bench)
window.showSquadPlayerInfo = function (playerId, source) {
  const player = getPlayer(playerId);
  if (!player) return;
  
  const team = state.teams.find(t => t.id === player.team);
  const teamName = team ? team.name : 'Unknown';
  const teamCode = team ? team.code : '';
  const teamNameEscaped = escapeHtml(teamName);
  const playerNameEscaped = escapeHtml(player.web_name);
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('squadPlayerInfoModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'squadPlayerInfoModal';
    modal.className = 'player-info-modal';
    document.body.appendChild(modal);
  }
  
  // Check if player is in starting XI
  const currentTeam = state.plan[state.viewingGW];
  const isStartingXI = currentTeam && currentTeam.starting.some(p => p.id === playerId);
  const isCaptain = currentTeam && currentTeam.captain === playerId;
  const isViceCaptain = currentTeam && currentTeam.viceCaptain === playerId;
  const playerEntry = currentTeam && (
    currentTeam.starting.find(e => e.id === playerId) ||
    currentTeam.bench.find(e => e.id === playerId)
  );
  const isMarked = playerEntry && playerEntry.marked === true;
  
  // Build availability flag section
  const events = state.bootstrap?.events || [];
  let availabilityFlagHtml = '';
  
  if (shouldShowPlayerFlag(player, state.viewingGW, state.currentGW, events)) {
    const isDoubtful = player.status === 'd';
    
    let badgeText = '0%';
    let badgeClass = 'red';
    let statusText = 'Unavailable';
    
    if (isDoubtful) {
      badgeClass = 'yellow';
      statusText = 'Doubtful';
      
      const chanceOfPlaying = state.viewingGW === state.currentGW 
        ? player.chance_of_playing_this_round 
        : state.viewingGW === state.currentGW + 1 
          ? player.chance_of_playing_next_round 
          : null;
      
      if (chanceOfPlaying !== null && chanceOfPlaying !== undefined) {
        badgeText = `${chanceOfPlaying}%`;
      } else {
        badgeText = '50%';
      }
    }
    
    const newsEscaped = player.news ? escapeHtml(player.news) : statusText;
    
    availabilityFlagHtml = `
      <div class="player-info-section">
        <h3>Availability</h3>
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
          <div class="table-status-flag-badge ${badgeClass}">${badgeText}</div>
          <p style="color: var(--text); margin: 0; line-height: 1.4; font-size: 13px;">${newsEscaped}</p>
        </div>
      </div>
    `;
  }
  
  // Build stats grid including DEFCON points
  const statsHtml = `
    <div class="player-info-stats">
      <div class="player-stat-item">
        <div class="player-stat-label">Total Points</div>
        <div class="player-stat-value">${player.total_points || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Price</div>
        <div class="player-stat-value">£${(player.now_cost / 10).toFixed(1)}m</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Form</div>
        <div class="player-stat-value">${player.form || '0'}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Goals Scored</div>
        <div class="player-stat-value">${player.goals_scored || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Assists</div>
        <div class="player-stat-value">${player.assists || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Clean Sheets</div>
        <div class="player-stat-value">${player.clean_sheets || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Bonus Points</div>
        <div class="player-stat-value">${player.bonus || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Minutes Played</div>
        <div class="player-stat-value">${player.minutes || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Goals Conceded</div>
        <div class="player-stat-value">${player.goals_conceded || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Yellow Cards</div>
        <div class="player-stat-value">${player.yellow_cards || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Red Cards</div>
        <div class="player-stat-value">${player.red_cards || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Saves</div>
        <div class="player-stat-value">${player.saves || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Penalties Saved</div>
        <div class="player-stat-value">${player.penalties_saved || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Penalties Missed</div>
        <div class="player-stat-value">${player.penalties_missed || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Owned By</div>
        <div class="player-stat-value">${parseFloat(player.selected_by_percent || 0).toFixed(1)}%</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Transfers In (GW)</div>
        <div class="player-stat-value">${player.transfers_in_event || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Transfers Out (GW)</div>
        <div class="player-stat-value">${player.transfers_out_event || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">ICT Index</div>
        <div class="player-stat-value">${parseFloat(player.ict_index || 0).toFixed(1)}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">DEFCON Points</div>
        <div class="player-stat-value">${player.defensive_contribution || 0}</div>
      </div>
    </div>
  `;
  
  // Captain/Vice-Captain selector (starting XI only)
  // Note: defensive_contribution field stores DEFCON season total (2pts per game with sufficient defensive actions)
  let captainSelectorHtml = '';
  if (isStartingXI) {
    captainSelectorHtml = `
      <div class="player-info-section">
        <h3>Captain Selection</h3>
        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button 
            class="modal-action-btn ${isCaptain ? 'active' : ''}" 
            onclick="setCaptain(${playerId}); closeSquadPlayerInfo();"
            style="flex: 1;">
            ${isCaptain ? '✓ Captain' : 'Set as Captain'}
          </button>
          <button 
            class="modal-action-btn ${isViceCaptain ? 'active' : ''}" 
            onclick="setViceCaptain(${playerId}); closeSquadPlayerInfo();"
            style="flex: 1;">
            ${isViceCaptain ? '✓ Vice-Captain' : 'Set as Vice-Captain'}
          </button>
        </div>
      </div>
    `;
  }
  
  // Action buttons (transfer/substitute)
  const actionButtonsHtml = `
    <div class="player-info-section">
      <h3>Actions</h3>
      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button 
          class="modal-action-btn" 
          onclick="removePlayer(${playerId}, '${source}'); closeSquadPlayerInfo();"
          style="flex: 1; background: var(--error);">
          Transfer Out
        </button>
        <button 
          class="modal-action-btn" 
          onclick="substitutePlayer(${playerId}); closeSquadPlayerInfo();"
          style="flex: 1; background: var(--accent);">
          Swap/Substitute
        </button>
      </div>
      <div style="margin-top: 8px;">
        <button 
          class="modal-action-btn ${isMarked ? 'active' : ''}" 
          onclick="togglePlayerMark(${playerId}); closeSquadPlayerInfo();"
          style="width: 100%; background: ${isMarked ? 'var(--error)' : 'var(--primary)'};">
          ${isMarked ? '✓ Marked (click to unmark)' : 'Mark / Target'}
        </button>
      </div>
    </div>
  `;
  
  modal.innerHTML = `
    <div class="player-info-content" style="max-width: 700px;">
      <button class="player-info-close" onclick="closeSquadPlayerInfo()">×</button>
      
      <div class="player-info-header">
        <img src="${getTeamBadgeUrl(teamCode)}" 
             class="player-info-badge" alt="${teamNameEscaped}">
        <div class="player-info-title">
          <h2>${playerNameEscaped}</h2>
          <p>${teamNameEscaped} • ${posNames[player.element_type]}</p>
        </div>
      </div>
      
      ${availabilityFlagHtml}
      
      ${captainSelectorHtml}
      
      ${actionButtonsHtml}
      
      <div class="player-info-section">
        <h3>Season Statistics</h3>
        ${statsHtml}
      </div>
    </div>
  `;
  
  modal.classList.add('open');
  
  // Close modal when clicking outside
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeSquadPlayerInfo();
    }
  };
};

window.closeSquadPlayerInfo = function () {
  const modal = document.getElementById('squadPlayerInfoModal');
  if (modal) {
    modal.classList.remove('open');
    modal.onclick = null;
  }
};
