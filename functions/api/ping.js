export async function onRequest({ request }) {
  const url = new URL(request.url);
  if (url.pathname === '/api/ping') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response('Not Found', { status: 404 });
}

