// validation.js - Team formation and rule validation logic

import { state } from './data.js';

function getPlayer(id) {
  return state.elements.find((p) => p.id === id);
}

function getElementType(playerId) {
  const p = getPlayer(playerId);
  return p?.element_type ?? null; // 1 GK, 2 DEF, 3 MID, 4 FWD
}

function getPlayerTeamId(playerId) {
  const p = getPlayer(playerId);
  return p?.team ?? null;
}

// Enforced: exactly 1 GK, min 3 DEF, min 2 MID, min 1 FWD.
export function validateStartingXI(team) {
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

export function getClubCounts(team) {
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

export function getOverLimitClubs(team) {
  const counts = getClubCounts(team);
  const over = new Set();
  for (const [tid, c] of counts.entries()) {
    if (c > 3) over.add(tid);
  }
  return over;
}

export function validateClubLimit(team) {
  const counts = getClubCounts(team);
  for (const [, c] of counts.entries()) {
    if (c > 3) return { ok: false, message: 'Invalid squad: max 3 players per club.' };
  }
  return { ok: true, message: '' };
}

export { getElementType, getPlayerTeamId };
