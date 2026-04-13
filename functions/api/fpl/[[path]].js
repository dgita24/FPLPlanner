export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Remove "/api/fpl" prefix
  const fplPath = url.pathname.replace(/^\/api\/fpl/, '');
  const target = `https://fantasy.premierleague.com/api${fplPath}${url.search}`;

  const res = await fetch(target, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });

  // Build a fresh response – do NOT clone upstream headers (e.g. edge-control)
  // which can cause intermediate caches to serve stale data.
  const body = await res.arrayBuffer();
  const ct = res.headers.get('Content-Type') || 'application/json';

  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': ct,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
    },
  });
}



