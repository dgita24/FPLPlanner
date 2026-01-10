import { state } from './data.js';

const fixturesByGW = new Map();
let fixturesGW = null;

/**
 * Load all fixtures once and group by GW
 */
export async function loadFixturesData() {
  const res = await fetch('/api/fpl/fixtures');
  const data = await res.json();

  fixturesByGW.clear();

  for (const f of data) {
    if (!f.event) continue;

    if (!fixturesByGW.has(f.event)) {
      fixturesByGW.set(f.event, []);
    }
    fixturesByGW.get(f.event).push(f);
  }

  fixturesGW = state.currentGW;
  renderFixtures();
}

/**
 * GW navigation (fixtures panel only)
 */
window.changeFixturesGW = function (delta) {
  fixturesGW = Math.max(1, Math.min(38, fixturesGW + delta));
  renderFixtures();
};

/**
 * Render fixtures panel (FPL-style)
 */
export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  // Group fixtures by calendar date
  const byDate = new Map();

  for (const f of fixtures) {
    if (!f.kickoff_time) continue;

    const d = new Date(f.kickoff_time);
    const dateLabel = d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    if (!byDate.has(dateLabel)) {
      byDate.set(dateLabel, []);
    }

    byDate.get(dateLabel).push(f);
  }

  let html = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>
  `;

  for (const [dateLabel, dayFixtures] of byDate) {
    html += `<div class="fixture-date">${dateLabel}</div>`;

    for (const f of dayFixtures) {
      const ko = new Date(f.kickoff_time).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      });

      const home = getTeam(f.team_h);
      const away = getTeam(f.team_a);

      html += `
        <div class="fixture-row">
          <div class="fixture-team home">
            <span class="team-name">${home.short}</span>
            <img class="team-badge" src="${home.badge}" />
          </div>

          <div class="fixture-time">${ko}</div>

          <div class="fixture-team away">
            <img class="team-badge" src="${away.badge}" />
            <span class="team-name">${away.short}</span>
          </div>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

/**
 * Get team data from state
 */
function getTeam(teamId) {
  const t = state.teams.find(team => team.id === teamId);

  return {
    short: t ? t.short_name || t.name : '?',
    badge: t
      ? `https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`
      : ''
  };
}
