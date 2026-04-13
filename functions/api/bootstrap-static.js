export async function onRequest() {
  const target = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  const res = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const newRes = new Response(res.body, res);
  newRes.headers.set('Access-Control-Allow-Origin', '*');
  newRes.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  newRes.headers.set('Pragma', 'no-cache');
  newRes.headers.set('Expires', '0');
  newRes.headers.delete('ETag');
  newRes.headers.delete('Last-Modified');
  return newRes;
}

