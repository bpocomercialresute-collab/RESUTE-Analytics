(function() {
  'use strict';

  var TABLE = 'relatorios_cache';
  var VERSION = 'dashboard-v1';

  function supaUrl() {
    return (typeof SUPA_URL !== 'undefined' && SUPA_URL) ? SUPA_URL : '';
  }

  function supaKey() {
    return (typeof SUPA_KEY !== 'undefined' && SUPA_KEY) ? SUPA_KEY : '';
  }

  function serviceKey() {
    return (typeof SVC_KEY !== 'undefined' && SVC_KEY) ? SVC_KEY : '';
  }

  function headers(extra) {
    return Object.assign({
      'Content-Type': 'application/json',
      'apikey': supaKey(),
      'Authorization': 'Bearer ' + serviceKey()
    }, extra || {});
  }

  function unavailable(status, text) {
    var msg = String(text || '');
    return status === 404 ||
      /relatorios_cache/i.test(msg) && /schema cache|not find|does not exist|PGRST/i.test(msg);
  }

  function safeParse(text, fallback) {
    try { return text ? JSON.parse(text) : fallback; }
    catch (e) { return fallback; }
  }

  async function readText(resp) {
    try { return await resp.text(); }
    catch (e) { return ''; }
  }

  function cacheKey(origem) {
    return 'latest:' + String(origem || 'manual').toLowerCase();
  }

  async function getLatest(empresaId, tipo, key) {
    if (!empresaId || !tipo || !supaUrl()) return null;
    var url = supaUrl() + '/rest/v1/' + TABLE +
      '?empresa_id=eq.' + encodeURIComponent(empresaId) +
      '&tipo=eq.' + encodeURIComponent(tipo) +
      (key ? '&cache_key=eq.' + encodeURIComponent(key) : '') +
      '&select=*&order=atualizado_em.desc&limit=1';

    try {
      var resp = await fetch(url, { headers: headers() });
      var text = await readText(resp);
      if (!resp.ok) {
        if (unavailable(resp.status, text)) return null;
        throw new Error('Snapshot indisponivel: HTTP ' + resp.status + ' - ' + text.slice(0, 180));
      }
      var rows = safeParse(text, []);
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    } catch (e) {
      console.warn('[ReportCache:getLatest]', e);
      return null;
    }
  }

  async function save(payload) {
    if (!payload || !payload.empresa_id || !payload.tipo || !supaUrl()) return false;
    var body = Object.assign({
      cache_key: cacheKey(payload.origem),
      versao: VERSION,
      atualizado_em: new Date().toISOString()
    }, payload);

    try {
      var resp = await fetch(supaUrl() + '/rest/v1/' + TABLE, {
        method: 'POST',
        headers: headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(body)
      });
      var text = await readText(resp);
      if (!resp.ok) {
        if (unavailable(resp.status, text)) return false;
        throw new Error('Falha ao salvar snapshot: HTTP ' + resp.status + ' - ' + text.slice(0, 180));
      }
      return true;
    } catch (e) {
      console.warn('[ReportCache:save]', e);
      return false;
    }
  }

  async function clearEmpresa(empresaId) {
    if (!empresaId || !supaUrl()) return false;
    try {
      var resp = await fetch(supaUrl() + '/rest/v1/' + TABLE + '?empresa_id=eq.' + encodeURIComponent(empresaId), {
        method: 'DELETE',
        headers: headers({ 'Prefer': 'return=minimal' })
      });
      var text = await readText(resp);
      if (!resp.ok) {
        if (unavailable(resp.status, text)) return false;
        throw new Error('Falha ao limpar snapshots: HTTP ' + resp.status + ' - ' + text.slice(0, 180));
      }
      return true;
    } catch (e) {
      console.warn('[ReportCache:clearEmpresa]', e);
      return false;
    }
  }

  window.ReportCache = {
    VERSION: VERSION,
    cacheKey: cacheKey,
    getLatest: getLatest,
    save: save,
    clearEmpresa: clearEmpresa
  };
})();
