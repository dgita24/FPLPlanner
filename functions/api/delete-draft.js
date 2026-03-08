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
    
    if (!teamid) {
      return new Response(JSON.stringify({ error: 'Missing teamid' }), {
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

    if (!password) {
      return new Response(JSON.stringify({ error: 'Missing password' }), {
        status: 400,
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

    // Hash the provided password using SHA-256 (same method as save.js and load.js)
    const encoder = new TextEncoder();
    const pwdData = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', pwdData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Fetch the draft record to verify the password before deleting
    const encodedTeamId = encodeURIComponent(teamid);
    const encodedManagerId = encodeURIComponent(managerid);
    const fetchResponse = await fetch(
      `${supabaseUrl}/rest/v1/team_saves?teamid=eq.${encodedTeamId}&managerid=eq.${encodedManagerId}&select=passwordhash`,
      {
        method: 'GET',
        headers
      }
    );

    if (!fetchResponse.ok) {
      console.error(`Supabase error fetching draft for password verification: ${fetchResponse.status} ${fetchResponse.statusText}`);
      return new Response(JSON.stringify({ error: 'Failed to verify password' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const records = await fetchResponse.json();
    if (!records || records.length === 0) {
      return new Response(JSON.stringify({ error: 'Draft not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify password hash using constant-time comparison to prevent timing attacks
    const storedHash = records[0].passwordhash || '';
    if (storedHash.length !== inputHash.length || !timingSafeEqual(storedHash, inputHash)) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete the draft - only if it belongs to this manager (security)
    const response = await fetch(
      `${supabaseUrl}/rest/v1/team_saves?teamid=eq.${encodedTeamId}&managerid=eq.${encodedManagerId}`,
      {
        method: 'DELETE',
        headers
      }
    );

    if (!response.ok) {
      console.error('Supabase error deleting draft');
      return new Response(JSON.stringify({ error: 'Failed to delete draft' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if any rows were deleted
    const deletedRecords = await response.json();
    if (!deletedRecords || deletedRecords.length === 0) {
      return new Response(JSON.stringify({ error: 'Draft not found or already deleted' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Draft deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Delete Draft Error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
