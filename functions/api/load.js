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

    // Hash input password
    const encoder = new TextEncoder();
    const pwdData = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', pwdData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

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
    if (team.passwordhash !== inputHash) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: team
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Load Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
