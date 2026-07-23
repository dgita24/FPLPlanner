// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const { teamid, managerid, password } = await request.json();
    if (!teamid || !password) {
      return new Response(JSON.stringify({ error: 'Missing teamid or password' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!managerid) {
      return new Response(JSON.stringify({ error: 'Missing managerid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Cloud database not configured.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash input password
    const encoder = new TextEncoder();
    const pwdData = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', pwdData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const row = await env.DB.prepare(
      'SELECT * FROM team_saves WHERE teamid = ? AND managerid = ?'
    ).bind(teamid, managerid).first();

    if (row) {
      const storedHash = row.passwordhash || '';
      if (!timingSafeEqual(storedHash, inputHash)) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let parsedPayload = row.payload;
      if (typeof row.payload === 'string') {
        try {
          parsedPayload = JSON.parse(row.payload);
        } catch (_parseError) {
          parsedPayload = row.payload;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        data: {
          ...row,
          payload: parsedPayload
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    try {
      // Fetch by teamid scoped to managerid (same composite key used by save and delete)
      const encodedTeamId = encodeURIComponent(teamid);
      const encodedManagerId = encodeURIComponent(managerid);
      const response = await fetch(
        `${supabaseUrl}/rest/v1/team_saves?teamid=eq.${encodedTeamId}&managerid=eq.${encodedManagerId}`,
        {
          method: 'GET',
          headers
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(JSON.stringify(err));
      }

      const result = await response.json();
      if (result.length === 0) {
        return new Response(JSON.stringify({ error: 'Team not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const team = result[0];
      const storedHash = team.passwordhash || '';
      if (!timingSafeEqual(storedHash, inputHash)) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await env.DB.prepare(
        'INSERT OR IGNORE INTO team_saves (teamid, managerid, label, passwordhash, payload, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(
        team.teamid,
        team.managerid,
        team.label,
        team.passwordhash,
        typeof team.payload === 'string' ? team.payload : JSON.stringify(team.payload),
        team.created_at || new Date().toISOString(),
        team.updated_at || new Date().toISOString()
      ).run();

      return new Response(JSON.stringify({
        success: true,
        data: team
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (fallbackError) {
      console.error('Supabase fallback load error:', fallbackError);
      return new Response(JSON.stringify({ error: 'Team not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Load Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
