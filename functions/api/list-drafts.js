export async function onRequestPost({ request, env }) {
  try {
    const { managerid } = await request.json();
    
    if (!managerid) {
      return new Response(JSON.stringify({ error: 'Missing managerid' }), {
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

    // Fetch all drafts for this manager ID
    const response = await fetch(
      `${supabaseUrl}/rest/v1/team_saves?managerid=eq.${managerid}&select=teamid,label,created_at&order=created_at.desc`, 
      {
        method: 'GET',
        headers
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(JSON.stringify(err));
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
    console.error('List Drafts Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
