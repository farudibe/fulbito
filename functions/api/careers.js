// Cloudflare Pages Function.
// Con este archivo en /functions/api/careers.js, Cloudflare Pages publica automáticamente
// el endpoint /api/careers junto con el resto del sitio (no hace falta un Worker aparte).
//
// Requiere un namespace de KV llamado (binding) "CAREERS_KV" conectado a este proyecto de Pages:
// Cloudflare Dashboard → tu proyecto de Pages → Settings → Functions → KV namespace bindings
// → Add binding → Variable name: CAREERS_KV → elegí (o creá) el namespace.

const MAX_RECORDS = 5000; // tope simple para no dejar crecer el KV sin límite

export async function onRequestGet({ env }) {
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

export async function onRequestPost({ request, env }) {
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
