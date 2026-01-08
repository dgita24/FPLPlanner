export async function onRequest(context) {
  const url = new URL(context.request.url);
  // Strip /api/fpl/ prefix
  let fplPath = url.pathname.replace('/api/fpl/', '/');
  const target = `https://fantasy.premierleague.com/api${fplPath}${url.search}`;
  
  console.log(`Proxy: ${url.pathname} -> ${target}`);
  
  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const newRes = new Response(res.body, res);
    newRes.headers.set('Access-Control-Allow-Origin', '*');
    newRes.headers.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
    return newRes;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


