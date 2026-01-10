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
 * GW navigation for fixtures panel only
 */
window.changeFixturesGW = function (delta) {
  fixturesGW = Math.max(1, Math.min(38, fixturesGW + delta));
  renderFixtures();
};

/**
 * Render fixtures panel
 */
export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  // Group fixtures by date string
  const byDate = new Map();

  for (const f of fixtures) {
    if (!f.kickoff_time) continue;

    const date = new Date(f.kickoff_time);
    const dateKey = date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey).push(f);
  }

  let html = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>
  `;

  for (const [dateLabel, dayFixtures] of byDate) {
    html += `
      <div class="fixture-date">${dateLabel}</div>
    `;

    for (const f of dayFixtures) {
      const date = new Date(f.kickoff_time);
      const time = date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      });

      html += `
        <div class="fixture-row">
          <div class="fixture-team home">
            ${teamBadge(f.team_h)}
            <span>${teamShortName(f.team_h)}</span>
          </div>

          <div class="fixture-time">${time}</div>

          <div class="fixture-team away">
            ${teamBadge(f.team_a)}
            <span>${teamShortName(f.team_a)}</span>
          </div>
        </div>
      `;
    }
  }

  panel.innerHTML = html;
}

/**
 * Render one fixture row (FPL-style)
 */
function renderFixtureRow(f) {
  const home = getTeam(f.team_h);
  const away = getTeam(f.team_a);

  const kickoff = f.kickoff_time
    ? new Date(f.kickoff_time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  return `
    <div class="fixture-row">
      <div class="team home">
        <span class="team-name">${home.name}</span>
        <img class="team-badge" src="${home.badge}" />
      </div>

      <div class="ko">${kickoff}</div>

      <div class="team away">
        <img class="team-badge" src="${away.badge}" />
        <span class="team-name">${away.name}</span>
      </div>
    </div>
  `;
}

/**
 * Get team info from state
 */
function getTeam(teamId) {
  const t = state.teams.find(team => team.id === teamId);

  return {
    name: t ? t.name : '?',
    badge: t
      ? `https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`
      : ''
  };
}

