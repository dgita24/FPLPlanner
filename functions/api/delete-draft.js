export async function onRequestPost({ request, env }) {
  try {
    const { teamid, managerid } = await request.json();
    
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

    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_ANON_KEY;
    
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    // Delete the draft - only if it belongs to this manager (security)
    const encodedTeamId = encodeURIComponent(teamid);
    const encodedManagerId = encodeURIComponent(managerid);
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
