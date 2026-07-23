// Maximum drafts allowed per manager ID
const MAX_DRAFTS_PER_MANAGER = 5;

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function onRequestPost({ request, env, context }) {
  try {
    const { teamid, label, password, payload, managerid } = await request.json();
    if (!teamid || !password || !payload) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Cloud database not configured. Ask the site owner to bind a D1 database named DB in the Cloudflare Pages dashboard.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Warn if managerid is missing - draft won't appear in dropdown
    if (!managerid) {
      console.warn(`Warning: Saving draft without managerid for teamid ${teamid} - draft will not appear in dropdown`);
    }

    // Hash password
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordhash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    let existing;
    if (managerid) {
      existing = await env.DB.prepare(
        'SELECT id, passwordhash FROM team_saves WHERE teamid = ? AND managerid = ?'
      ).bind(teamid, managerid).first();
    } else {
      existing = await env.DB.prepare(
        'SELECT id, passwordhash FROM team_saves WHERE teamid = ? AND managerid IS NULL'
      ).bind(teamid).first();
    }

    if (existing) {
      // Overwrite requires the same password used when the draft was created
      const storedHash = existing.passwordhash || '';
      if (!timingSafeEqual(storedHash, passwordhash)) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Update existing - use composite key (teamid, managerid) to identify the correct record
      if (managerid) {
        await env.DB.prepare(
          'UPDATE team_saves SET label=?, passwordhash=?, payload=?, updated_at=datetime(\'now\') WHERE teamid=? AND managerid=?'
        ).bind(label || teamid, passwordhash, JSON.stringify(payload), teamid, managerid).run();
      } else {
        await env.DB.prepare(
          'UPDATE team_saves SET label=?, passwordhash=?, payload=?, updated_at=datetime(\'now\') WHERE teamid=? AND managerid IS NULL'
        ).bind(label || teamid, passwordhash, JSON.stringify(payload), teamid).run();
      }
    } else {
      // This is a new insert - check if manager has reached limit
      if (managerid) {
        const countResult = await env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM team_saves WHERE managerid = ?'
        ).bind(managerid).first();

        if ((countResult?.cnt || 0) >= MAX_DRAFTS_PER_MANAGER) {
          return new Response(JSON.stringify({
            error: `Maximum draft limit reached. You can save up to ${MAX_DRAFTS_PER_MANAGER} drafts per manager. Please delete an old draft or update an existing one.`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      await env.DB.prepare(
        'INSERT INTO team_saves (teamid, managerid, label, passwordhash, payload) VALUES (?,?,?,?,?)'
      ).bind(teamid, managerid || null, label || teamid, passwordhash, JSON.stringify(payload)).run();
    }

    return new Response(JSON.stringify({ success: true, message: 'Team saved successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Worker Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


