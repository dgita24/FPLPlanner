export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/'); 
  const managerId = pathParts[3]; // "1"
  const gw = pathParts[5];         // "1"
  const target = `https://fantasy.premierleague.com/api/entry/${managerId}/event/${gw}/picks/`;
  
  const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });

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
