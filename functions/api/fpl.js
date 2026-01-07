// functions/api/fpl.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // Strip /api/fpl prefix
  let fplPath = url.pathname.replace('/api/fpl', '');
  
  // Ensure trailing slash for FPL API (critical for redirects)
  if (!fplPath.endsWith('/') && !fplPath.includes('.')) {
    fplPath += '/';
  }

  const target = 'https://fantasy.premierleague.com/api' + fplPath + url.search;

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      return new Response(`FPL Error: ${res.status} ${res.statusText}`, { status: res.status });
    }

    // Pass through the response
    const newRes = new Response(res.body, res);
    newRes.headers.set('Access-Control-Allow-Origin', '*');
    return newRes;

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

