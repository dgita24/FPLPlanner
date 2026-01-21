export async function onRequestPost({ request, env }) {
  try {
    const { managerid } = await request.json();
    
    if (!managerid) {
      return new Response(JSON.stringify({ error: 'Missing managerid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate manager ID format (should be numeric)
    const managerIdNum = parseInt(managerid, 10);
    if (isNaN(managerIdNum) || managerIdNum <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid managerid format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    };

    // Use URL encoding to safely include manager ID in query
    const encodedManagerId = encodeURIComponent(managerIdNum);
    
    // Fetch all drafts for this manager ID
    const response = await fetch(
      `${supabaseUrl}/rest/v1/team_saves?managerid=eq.${encodedManagerId}&select=teamid,label,created_at&order=created_at.desc`, 
      {
        method: 'GET',
        headers
      }
    );

    if (!response.ok) {
      console.error('Supabase error fetching drafts');
      return new Response(JSON.stringify({ error: 'Failed to fetch drafts' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const drafts = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      drafts: drafts || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('List Drafts Error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
