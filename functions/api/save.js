export async function onRequestPost({ request, env, context }) {
  try {
    const { teamid, label, password, payload, managerid } = await request.json();
    if (!teamid || !password || !payload) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
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

    // Save to Supabase
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    
    const getHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    // Build query string to check for existing draft with composite key (teamid, managerid)
    // Use URL encoding to safely include parameters
    const encodedTeamId = encodeURIComponent(teamid);
    let queryString = `teamid=eq.${encodedTeamId}`;
    if (managerid) {
      const encodedManagerId = encodeURIComponent(managerid);
      queryString += `&managerid=eq.${encodedManagerId}`;
    } else {
      queryString += `&managerid=is.null`;
    }

    // Check existing with better response
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/team_saves?${queryString}`, {
      method: 'GET',
      headers: getHeaders
    });
    const existing = await getResponse.json();

    const saveData = {
      teamid,
      label: label || teamid,
      passwordhash,
      payload,
      managerid: managerid || null
    };

    let saveResponse;
    if (existing.length > 0) {
      // Update existing - use composite key (teamid, managerid) to identify the correct record
      saveResponse = await fetch(`${supabaseUrl}/rest/v1/team_saves?${queryString}`, {
        method: 'PATCH',
        headers: getHeaders,
        body: JSON.stringify(saveData)
      });
    } else {
      // Insert new
      saveResponse = await fetch(`${supabaseUrl}/rest/v1/team_saves`, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify(saveData)
      });
    }

    if (!saveResponse.ok) {
      const errorData = await saveResponse.json();
      console.error('Supabase Error:', errorData);  // Log for debugging
      throw new Error(`Supabase save failed: ${JSON.stringify(errorData)}`);
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



