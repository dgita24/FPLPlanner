// fixture-planner.js
// Fixture Planner modal: team × gameweek matrix with FDR colour coding,
// GW hide/show capability, and N-week sorting by overall / attack / defence.

import { state } from './data.js';
import { getResolvedFixturesMap } from './fixture-resolver.js';
import { MAX_GAMEWEEK } from './constants.js';

// ─────────────────────────────────────────────
//  Module state
// ─────────────────────────────────────────────

let plannerHiddenGWs = new Set();
let plannerSortMode = 'overall'; // 'overall' | 'attack' | 'defence'
let plannerNWeeks = 6;
let plannerStartGW = null;

// ─────────────────────────────────────────────
//  Public window API
// ─────────────────────────────────────────────

/**
 * Open the fixture planner modal.
 * @param {number} [startGW] - The first gameweek to display. Defaults to state.viewingGW.
 */
window.openFixturePlanner = function (startGW) {
  const modal = document.getElementById('fixturePlannerModal');
  if (!modal) return;

  // Reset hidden GWs each time the modal is opened fresh
  plannerHiddenGWs = new Set();

  // Determine starting GW
  const events = state.bootstrap?.events || [];
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  plannerStartGW = startGW || next || current || state.currentGW || 1;

  modal.classList.add('open');
  renderFixturePlanner();

  // Move focus to close button for accessibility
  const closeBtn = modal.querySelector('.fp-modal-close');
  if (closeBtn) closeBtn.focus();
};

/** Close the fixture planner modal. */
window.closeFixturePlanner = function () {
  const modal = document.getElementById('fixturePlannerModal');
  if (!modal) return;
  modal.classList.remove('open');
};

/** Hide a specific gameweek column from the matrix. */
window.fpHideGW = function (gw) {
  plannerHiddenGWs.add(Number(gw));
  renderFixturePlanner();
};

/** Restore all hidden gameweeks. */
window.fpRestoreGWs = function () {
  plannerHiddenGWs.clear();
  renderFixturePlanner();
};

/** Change the sort mode ('overall' | 'attack' | 'defence'). */
window.fpSetSortMode = function (mode) {
  plannerSortMode = mode;
  renderFixturePlanner();
};

/** Change the number of weeks to display/sort over. */
window.fpSetNWeeks = function (n) {
  plannerNWeeks = Math.max(1, Math.min(16, parseInt(n, 10) || 6));
  renderFixturePlanner();
};

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function getTeamById(teamId) {
  return state.teams.find(t => t.id === teamId) || null;
}

function getTeamBadgeUrl(team) {
  if (!team) return '';
  return `https://resources.premierleague.com/premierleague/badges/70/t${team.code}.png`;
}

/** Map FDR 1-5 to CSS variable name. */
function fdrVar(difficulty) {
  const d = Math.max(1, Math.min(5, difficulty));
  return `var(--fdr-${d})`;
}

// ─────────────────────────────────────────────
//  Sorting / scoring
// ─────────────────────────────────────────────

/**
 * Compute a sortable aggregate score for `teamId` over `visibleGWs`.
 *
 * Sort modes:
 *  - 'overall':  Sum of fixture FDR values for this team.
 *                Lower = easier run of fixtures.
 *  - 'attack':   Sum of opponent's defensive strength (home or away depending
 *                on venue). Lower opponent defence = better attacking prospect.
 *  - 'defence':  Sum of opponent's attacking strength (home or away depending
 *                on venue). Lower opponent attack = better defensive prospect.
 *
 * Teams with zero visible fixtures receive Infinity so they sort last.
 * Average per fixture is returned so DGW/BGW teams are treated fairly.
 *
 * @param {number} teamId
 * @param {number[]} visibleGWs
 * @param {Map<number, Array>} fixturesByGW
 * @param {'overall'|'attack'|'defence'} mode
 * @returns {{ score: number, fixtureCount: number }}
 */
export function computeTeamScore(teamId, visibleGWs, fixturesByGW, mode) {
  let total = 0;
  let fixtureCount = 0;

  for (const gw of visibleGWs) {
    const gwFixtures = fixturesByGW.get(gw) || [];
    for (const f of gwFixtures) {
      const isHome = f.team_h === teamId;
      const isAway = f.team_a === teamId;
      if (!isHome && !isAway) continue;

      fixtureCount++;

      if (mode === 'overall') {
        // FDR value assigned to this team for this fixture
        total += isHome ? (f.team_h_difficulty || 3) : (f.team_a_difficulty || 3);
      } else {
        const opponentId = isHome ? f.team_a : f.team_h;
        const opponent = getTeamById(opponentId);

        if (mode === 'attack') {
          // We want to score against opponent's defence.
          // Opponent plays at the opposite venue to us:
          //   we play home → opponent plays away → use their away defence strength
          //   we play away → opponent plays home → use their home defence strength
          const oppDefStr = opponent
            ? (isHome
                ? (opponent.strength_defence_away || 1200)
                : (opponent.strength_defence_home || 1200))
            : 1200;
          total += oppDefStr;
        } else {
          // mode === 'defence'
          // Opponent's attacking threat (home/away) that we must defend against.
          const oppAttStr = opponent
            ? (isHome
                ? (opponent.strength_attack_away || 1200)
                : (opponent.strength_attack_home || 1200))
            : 1200;
          total += oppAttStr;
        }
      }
    }
  }

  if (fixtureCount === 0) return { score: Infinity, fixtureCount: 0 };

  // Average per fixture for fair comparison across DGW / BGW weeks
  return { score: total / fixtureCount, fixtureCount };
}

// ─────────────────────────────────────────────
//  Rendering
// ─────────────────────────────────────────────

function renderFixturePlanner() {
  const container = document.getElementById('fpMatrixContainer');
  if (!container) return;

  const fixturesByGW = getResolvedFixturesMap();
  if (!fixturesByGW) {
    container.innerHTML = '<div class="fp-loading">Loading fixtures…</div>';
    return;
  }

  const teams = state.teams || [];
  if (teams.length === 0) {
    container.innerHTML = '<div class="fp-loading">No team data available.</div>';
    return;
  }

  // Build full GW range based on start + N
  const endGW = Math.min(plannerStartGW + plannerNWeeks - 1, MAX_GAMEWEEK);
  const allGWs = [];
  for (let gw = plannerStartGW; gw <= endGW; gw++) allGWs.push(gw);

  // Remove hidden GWs
  const visibleGWs = allGWs.filter(gw => !plannerHiddenGWs.has(gw));

  // Compute scores and sort
  const scored = teams.map(team => ({
    team,
    ...computeTeamScore(team.id, visibleGWs, fixturesByGW, plannerSortMode),
  }));

  scored.sort((a, b) => {
    if (a.score === Infinity && b.score === Infinity)
      return a.team.name.localeCompare(b.team.name);
    if (a.score === Infinity) return 1;
    if (b.score === Infinity) return -1;
    const diff = a.score - b.score;
    if (diff !== 0) return diff;
    return a.team.name.localeCompare(b.team.name); // stable tie-break
  });

  // Build GW date labels from first kickoff in that GW
  const gwDateLabels = {};
  for (const gw of visibleGWs) {
    const first = (fixturesByGW.get(gw) || []).find(f => f.kickoff_time);
    if (first) {
      const d = new Date(first.kickoff_time);
      gwDateLabels[gw] = d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
      });
    }
  }

  // ── Header row ─────────────────────────────
  let html = '<div class="fp-table-wrap"><table class="fp-matrix-table">';
  html += '<thead><tr>';
  html += '<th class="fp-team-header">Team</th>';

  for (const gw of visibleGWs) {
    html += `<th class="fp-gw-header">
      <button class="fp-gw-hide-btn" onclick="fpHideGW(${gw})" aria-label="Hide GW${gw}" title="Hide GW${gw}">×</button>
      <div class="fp-gw-label">GW${gw}</div>
      ${gwDateLabels[gw] ? `<div class="fp-gw-date">${gwDateLabels[gw]}</div>` : ''}
    </th>`;
  }

  html += '</tr></thead>';

  // ── Body rows ──────────────────────────────
  html += '<tbody>';
  for (const { team } of scored) {
    html += `<tr class="fp-team-row">`;
    html += `<td class="fp-team-cell">
      <img class="fp-team-badge-sm" src="${getTeamBadgeUrl(team)}" alt="${team.name}" />
      <span class="fp-team-short" title="${team.name}">${team.short_name}</span>
    </td>`;

    for (const gw of visibleGWs) {
      const gwFixtures = (fixturesByGW.get(gw) || []).filter(
        f => f.team_h === team.id || f.team_a === team.id
      );

      if (gwFixtures.length === 0) {
        html += `<td class="fp-fixture-cell fp-fixture-blank"><span class="fp-chip fp-chip-blank">—</span></td>`;
      } else {
        const chips = gwFixtures
          .map(f => {
            const isHome = f.team_h === team.id;
            const opponentId = isHome ? f.team_a : f.team_h;
            const opponent = getTeamById(opponentId);
            const difficulty = isHome ? (f.team_h_difficulty || 3) : (f.team_a_difficulty || 3);
            const bgColor = fdrVar(difficulty);
            const venue = isHome ? 'H' : 'A';
            const oppShort = opponent?.short_name || '?';
            const oppName = opponent?.name || '?';
            return `<span class="fp-chip fp-chip-fdr" style="background:${bgColor};" title="GW${gw}: ${isHome ? 'Home' : 'Away'} vs ${oppName} (FDR ${difficulty})">${oppShort}<span class="fp-chip-venue">${venue}</span></span>`;
          })
          .join('');
        html += `<td class="fp-fixture-cell">${chips}</td>`;
      }
    }

    html += '</tr>';
  }
  html += '</tbody></table></div>';

  container.innerHTML = html;

  // Update restore button visibility
  const restoreBtn = document.getElementById('fpRestoreBtn');
  if (restoreBtn) {
    const n = plannerHiddenGWs.size;
    if (n > 0) {
      restoreBtn.style.display = 'inline-flex';
      restoreBtn.textContent = `↩ Restore ${n} hidden GW${n !== 1 ? 's' : ''}`;
    } else {
      restoreBtn.style.display = 'none';
    }
  }

  // Sync sort button active state and aria-pressed
  document.querySelectorAll('.fp-sort-btn').forEach(btn => {
    const isActive = btn.dataset.sort === plannerSortMode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  // Sync N-weeks selector
  const nWeeksSelect = document.getElementById('fpNWeeksSelect');
  if (nWeeksSelect && nWeeksSelect.value !== String(plannerNWeeks)) {
    nWeeksSelect.value = String(plannerNWeeks);
  }
}

// ─────────────────────────────────────────────
//  Initialisation (called from main.js)
// ─────────────────────────────────────────────

export function initFixturePlanner() {
  // Keyboard: Escape closes the modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('fixturePlannerModal');
      if (modal?.classList.contains('open')) {
        window.closeFixturePlanner();
      }
    }
  });

  // Click on the backdrop (outside modal content) closes the modal
  const modal = document.getElementById('fixturePlannerModal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) window.closeFixturePlanner();
    });
  }
}
