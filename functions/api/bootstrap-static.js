export async function onRequest() {
  const target = 'https://fantasy.premierleague.com/api/bootstrap-static/';
  const res = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const newRes = new Response(res.body, res);
  newRes.headers.set('Access-Control-Allow-Origin', '*');
  return newRes;
}

