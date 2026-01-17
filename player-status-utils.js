// player-status-utils.js - Utility functions for player status and flags

// Shared regex pattern for matching month names
const MONTH_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

// Compiled regex patterns for date parsing (cached for performance)
const DAY_FIRST_REGEX = new RegExp(`(\\d+)\\s+(${MONTH_PATTERN})`, 'i');
const MONTH_FIRST_REGEX = new RegExp(`(${MONTH_PATTERN})\\s+(\\d+)`, 'i');
const DATE_IN_NEWS_REGEX = new RegExp(`(?:until|back|return)\\s+(?:on\\s+)?(\\d+\\s+(?:${MONTH_PATTERN})|(?:${MONTH_PATTERN})\\s+\\d+)(?:st|nd|rd|th)?`, 'i');

// Map month names to month numbers (0-indexed for JavaScript Date)
const MONTH_MAP = {
  'jan': 0, 'january': 0,
  'feb': 1, 'february': 1,
  'mar': 2, 'march': 2,
  'apr': 3, 'april': 3,
  'may': 4,
  'jun': 5, 'june': 5,
  'jul': 6, 'july': 6,
  'aug': 7, 'august': 7,
  'sep': 8, 'september': 8,
  'oct': 9, 'october': 9,
  'nov': 10, 'november': 10,
  'dec': 11, 'december': 11
};

/**
 * Parse a date string from suspension news and convert to Date object
 * @param {string} dateStr - Date string like "31 January" or "Jan 31"
 * @param {number} currentYear - Current year to use for parsing
 * @returns {Date|null} - Parsed date or null if invalid
 */
function parseSuspensionDate(dateStr, currentYear) {
  if (!dateStr) return null;
  
  // Extract date components: "31 January", "Jan 31", "January 31st"
  // Use cached regexes for performance
  let day, monthStr;
  
  const dayFirstMatch = dateStr.match(DAY_FIRST_REGEX);
  if (dayFirstMatch) {
    day = parseInt(dayFirstMatch[1]);
    monthStr = dayFirstMatch[2];
  } else {
    const monthFirstMatch = dateStr.match(MONTH_FIRST_REGEX);
    if (monthFirstMatch) {
      monthStr = monthFirstMatch[1];
      day = parseInt(monthFirstMatch[2]);
    } else {
      return null;
    }
  }
  
  if (!monthStr) return null;
  
  const month = MONTH_MAP[monthStr.toLowerCase()];
  if (month === undefined) return null;
  
  // Handle year rollover (if month is before June, assume next year during current season)
  let year = currentYear;
  const now = new Date();
  if (month < 6 && now.getMonth() >= 6) {
    year = currentYear + 1;
  }
  
  try {
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Find the gameweek for a given date based on event deadlines
 * Returns the LAST gameweek the player is suspended for
 * @param {Date} targetDate - The date until which player is suspended
 * @param {Array} events - Array of gameweek objects with deadline_time
 * @returns {number|null} - Last suspended gameweek number or null if not found
 */
function getGameweekForDate(targetDate, events) {
  if (!targetDate || !events || events.length === 0) return null;
  
  // Player is suspended UNTIL targetDate (inclusive, entire day)
  // Set to end of day to ensure we capture deadlines on the same day
  const suspensionEndOfDay = new Date(targetDate);
  suspensionEndOfDay.setHours(23, 59, 59, 999);
  
  // Find the last gameweek whose deadline is on or before the end of the suspension date
  // That's the last GW they're suspended for
  let lastSuspendedGW = null;
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.deadline_time) continue;
    
    const deadline = new Date(event.deadline_time);
    
    // If the deadline is on or before the end of suspension date,
    // the player is suspended for this gameweek
    if (deadline <= suspensionEndOfDay) {
      lastSuspendedGW = event.id;
    } else {
      // Once we find a deadline after the suspension date, we're done
      break;
    }
  }
  
  return lastSuspendedGW;
}

/**
 * Parse suspension duration from player news text
 * @param {Object} player - Player object with news field
 * @param {number} currentGW - Current gameweek number
 * @param {Array} events - Array of gameweek objects from bootstrap
 * @returns {number|null} - Gameweek number when suspension ends, or null if not parseable
 */
export function getSuspensionEndGW(player, currentGW, events = []) {
  if (!player.news) return null;
  
  // Parse: "Suspended for 2 matches" or "Suspended for 2 games"
  const suspensionMatch = player.news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
  if (suspensionMatch) {
    const suspendedMatches = parseInt(suspensionMatch[1]);
    // Suspension ends after the last suspended gameweek
    return currentGW + suspendedMatches - 1;
  }
  
  // Parse: "Unavailable until gameweek 24" or "Returns in gameweek 24"
  const gwMatch = player.news.match(/(?:until|in) gameweek (\d+)/i);
  if (gwMatch) {
    return parseInt(gwMatch[1]) - 1; // Available FROM that GW, so ends before it
  }
  
  // Parse date-based suspension: "Suspended until 31 January" or "Expected back 31 Jan"
  const dateMatch = player.news.match(DATE_IN_NEWS_REGEX);
  if (dateMatch && events && events.length > 0) {
    const currentYear = new Date().getFullYear();
    const suspensionDate = parseSuspensionDate(dateMatch[1], currentYear);
    
    if (suspensionDate) {
      // getGameweekForDate returns the last GW the player is suspended for
      const lastSuspendedGW = getGameweekForDate(suspensionDate, events);
      if (lastSuspendedGW) {
        return lastSuspendedGW;
      }
    }
  }
  
  return null; // Injury or unknown - treat as indefinite
}

/**
 * Check if a suspension has expired for a given gameweek
 * @param {Object} player - Player object with status and news
 * @param {number} gwToCheck - Gameweek to check
 * @param {number} currentGW - Current gameweek number
 * @param {Array} events - Array of gameweek objects from bootstrap
 * @returns {boolean} - True if suspension has expired, false otherwise
 */
export function isSuspensionExpiredForGW(player, gwToCheck, currentGW, events = []) {
  // Only applies to suspended players
  if (player.status !== 's') return false;
  
  const suspensionEndGW = getSuspensionEndGW(player, currentGW, events);
  
  // If we can't parse suspension end, treat as indefinite (not expired)
  if (!suspensionEndGW) return false;
  
  // Suspension has expired if viewing GW is after the suspension end GW
  return gwToCheck > suspensionEndGW;
}

/**
 * Check if a player should show a status flag in a given gameweek
 * @param {Object} player - Player object with status, news, and chance_of_playing fields
 * @param {number} viewingGW - Gameweek being viewed
 * @param {number} currentGW - Current gameweek number
 * @param {Array} events - Array of gameweek objects from bootstrap
 * @returns {boolean} - True if flag should be shown, false otherwise
 */
export function shouldShowPlayerFlag(player, viewingGW, currentGW, events = []) {
  // Player must have a non-available status to show a flag
  if (!player.status || player.status === 'a') return false;
  
  // For current and next gameweek, use chance_of_playing fields if available
  // These are more accurate than news parsing for immediate availability
  if (viewingGW === currentGW && player.chance_of_playing_this_round !== null && player.chance_of_playing_this_round !== undefined) {
    // If chance is 100%, don't show flag even if status says otherwise
    if (player.chance_of_playing_this_round === 100) return false;
  }
  
  if (viewingGW === currentGW + 1 && player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round !== undefined) {
    // If chance is 100%, don't show flag even if status says otherwise
    if (player.chance_of_playing_next_round === 100) return false;
  }
  
  // For suspensions, check if expired
  if (player.status === 's' && isSuspensionExpiredForGW(player, viewingGW, currentGW, events)) {
    return false;
  }
  
  // For all other statuses (injuries, doubtful, etc.), show the flag
  return true;
}
