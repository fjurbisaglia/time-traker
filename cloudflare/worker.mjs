// SYNC_KEY is a Worker secret, never a value committed to GitHub.
const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGIN;
    if (!allowed || !env.SYNC_KEY || env.SYNC_KEY.length < 32) {
      return json({ error: 'Configura ALLOWED_ORIGIN y SYNC_KEY (mínimo 32 caracteres).' }, 503);
    }
    if (origin && origin !== allowed) return json({ error: 'Origen no permitido.' }, 403);
    const headers = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
      'Cache-Control': 'no-store'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let response;
    if (request.headers.get('Authorization') !== `Bearer ${env.SYNC_KEY}`) {
      response = json({ error: 'Clave incorrecta.' }, 401);
    } else if (new URL(request.url).pathname !== '/state') {
      response = json({ error: 'Ruta no encontrada.' }, 404);
    } else if (!['GET', 'PUT'].includes(request.method)) {
      response = json({ error: 'Método no permitido.' }, 405);
    } else {
      const id = env.LEO_STATE.idFromName('leo');
      response = await env.LEO_STATE.get(id).fetch(request);
    }
    const result = new Response(response.body, response);
    for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
    return result;
  }
};

export class LeoState {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    if (request.method === 'GET') {
      const snapshot = await this.ctx.storage.get('snapshot');
      return json(snapshot || { revision: 0, state: null });
    }
    // Bound the streamed body rather than trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Falta el JSON.' }, 400);
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512000) { await reader.cancel(); return json({ error: 'JSON demasiado grande.' }, 413); }
      chunks.push(value);
    }
    let payload;
    try { payload = JSON.parse(await new Blob(chunks).text()); }
    catch { return json({ error: 'JSON inválido.' }, 400); }
    if (!Number.isSafeInteger(payload?.revision) || payload.revision < 0 || !validState(payload.state)) {
      return json({ error: 'Estado inválido.' }, 400);
    }
    // Compare and write inside one transaction: a stale device cannot overwrite a newer revision.
    return this.ctx.storage.transaction(async txn => {
      const current = await txn.get('snapshot') || { revision: 0, state: null };
      if (current.revision !== payload.revision) return json({ error: 'El estado cambió en otro dispositivo.', ...current }, 409);
      const next = { revision: current.revision + 1, state: payload.state };
      await txn.put('snapshot', next);
      return json(next);
    });
  }
}

function validState(state) {
  if (!state || !Array.isArray(state.platforms) || state.platforms.length > 100 || !state.days || typeof state.days !== 'object' || Array.isArray(state.days)) return false;
  const ids = new Set();
  for (const p of state.platforms) {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 36 || !minutes(p.limit)) return false;
    ids.add(p.id);
  }
  for (const [day, record] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !record || !record.limits || !record.used) return false;
    if (![record.limits, record.used].every(v => typeof v === 'object' && !Array.isArray(v))) return false;
    if (!Object.entries(record.limits).every(([id,v]) => ids.has(id) && minutes(v))) return false;
    if (!Object.entries(record.used).every(([id,v]) => ids.has(id) && Number.isFinite(v) && v >= 0 && v <= 86400)) return false;
  }
  const run = state.running;
  return run === null || (run && ids.has(run.id) && /^\d{4}-\d{2}-\d{2}$/.test(run.day) && Number.isFinite(run.updatedAt) && run.updatedAt > 0);
}
function minutes(value) { return Number.isInteger(value) && value >= 0 && value <= 1440; }
