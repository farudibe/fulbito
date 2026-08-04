// Worker de Cloudflare para "fulbito": sirve el sitio estático (index.html, /assets, etc.)
// y atiende /api/careers (guardar y leer el Salón de la Fama) usando el binding CAREERS_KV.

const MAX_RECORDS = 5000; // tope simple para no dejar crecer el KV sin límite

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/careers') {
      if (request.method === 'GET') return handleGet(env);
      if (request.method === 'POST') return handlePost(request, env);
      return new Response('Method not allowed', { status: 405 });
    }

    // Cualquier otra ruta: servir el sitio estático (index.html, assets/, etc.)
    return env.ASSETS.fetch(request);
  }
};

async function handleGet(env) {
  try {
    const list = await env.CAREERS_KV.list({ prefix: 'careers:' });
    const records = await Promise.all(
      list.keys.map(k => env.CAREERS_KV.get(k.name, 'json'))
    );
    return new Response(JSON.stringify(records.filter(Boolean)), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'No se pudo leer el ranking' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePost(request, env) {
  let record;
  try {
    record = await request.json();
  } catch (e) {
    return new Response('JSON inválido', { status: 400 });
  }

  // Validación básica para evitar basura o abuso del endpoint.
  if (!record || typeof record.name !== 'string' || record.name.length > 40) {
    return new Response('Registro inválido', { status: 400 });
  }
  const clean = {
    name: String(record.name || 'Jugador Anónimo').slice(0, 40),
    nat: String(record.nat || '').slice(0, 40),
    flag: String(record.flag || '').slice(0, 8),
    role: String(record.role || '').slice(0, 10),
    pos: String(record.pos || '').slice(0, 10),
    goals: Math.max(0, Math.min(9999, Number(record.goals) || 0)),
    assists: Math.max(0, Math.min(9999, Number(record.assists) || 0)),
    ga: Math.max(0, Math.min(9999, Number(record.ga) || 0)),
    matches: Math.max(0, Math.min(9999, Number(record.matches) || 0)),
    lastClub: String(record.lastClub || '').slice(0, 60),
    clubs: (record.clubs && typeof record.clubs === 'object') ? record.clubs : {},
    day: String(record.day || '').slice(0, 10),
    ts: new Date().toISOString()
  };

  const key = 'careers:' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  await env.CAREERS_KV.put(key, JSON.stringify(clean));

  // Poda simple: si hay demasiados registros, borra los más viejos.
  const list = await env.CAREERS_KV.list({ prefix: 'careers:' });
  if (list.keys.length > MAX_RECORDS) {
    const sorted = list.keys.map(k => k.name).sort(); // las keys empiezan con el timestamp
    const toDelete = sorted.slice(0, sorted.length - MAX_RECORDS);
    await Promise.all(toDelete.map(k => env.CAREERS_KV.delete(k)));
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
