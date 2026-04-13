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
  // Strip the cache-busting _cb param before forwarding to upstream
  const upstreamParams = new URLSearchParams(url.search);
  upstreamParams.delete('_cb');
  const qs = upstreamParams.toString();
  const target = `https://fantasy.premierleague.com/api${fplPath}${qs ? '?' + qs : ''}`;

  const res = await fetch(target, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    },
  });

  const newRes = new Response(res.body, res);

  newRes.headers.set('Access-Control-Allow-Origin', '*');
  newRes.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  newRes.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  newRes.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  newRes.headers.set('Pragma', 'no-cache');
  newRes.headers.set('Expires', '0');
  // Remove ETag/Last-Modified to prevent conditional re-use
  newRes.headers.delete('ETag');
  newRes.headers.delete('Last-Modified');

  const ct = res.headers.get('Content-Type');
  if (ct) newRes.headers.set('Content-Type', ct);

  return newRes;
}



