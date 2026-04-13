export async function onRequest() {
  const target = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  const res = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  // Build a fresh response – do NOT clone upstream headers (e.g. edge-control)
  // which can cause intermediate caches to serve stale data.
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
    },
  });
}

