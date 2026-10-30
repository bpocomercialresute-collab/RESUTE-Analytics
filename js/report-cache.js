(function() {
  'use strict';

  var TABLE = 'relatorios_cache';
  var VERSION = 'dashboard-v1';
  // Sufixo de tipo pras partes de um snapshot dividido em pedacos (empresa
  // grande demais pra caber numa linha so). Um tipo DIFERENTE do snapshot
  // principal -- nunca aparece pra quem le "o mais recente, de qualquer
  // cache_key" (getLatest com key=null), que so enxerga o manifesto.
  var PARTE_SUFIXO_TIPO = '_parte';

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

  async function buscarLinha(empresaId, tipo, key) {
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
      console.warn('[ReportCache:buscarLinha]', e);
      return null;
    }
  }

  async function getLatest(empresaId, tipo, key) {
    var row = await buscarLinha(empresaId, tipo, key);

    // Snapshot normal (coube numa linha so, ou linha antiga de antes dessa
    // mudanca): devolve direto, igual sempre foi.
    if (!row || !row.dados || !row.dados.manifesto) return row;

    // Manifesto: empresa grande demais pra uma linha, dividido em partes.
    // Busca e remonta TODAS antes de devolver -- quem chamou getLatest nunca
    // precisa saber que isso existe. Pra um primeiro paint rapido sem
    // esperar tudo, ver getLatestRapido.
    var vendas = await getPartes(empresaId, row.tipo + PARTE_SUFIXO_TIPO, row.cache_key, row.dados.partes || 0);
    if (!vendas) return null; // partes incompletas/corrompidas: nao devolve dado parcial sem avisar
    return Object.assign({}, row, {
      dados: {
        vendas: vendas,
        origem: row.dados.origem,
        total_registros: row.dados.total_registros,
        gerado_em: row.dados.gerado_em
      }
    });
  }

  // Mesma coisa que getLatest, mas pra manifesto dividido em partes so le a
  // PRIMEIRA parte (que guarda o periodo mais recente, ver
  // _dcDividirSlimEmPedacos em auth.js) em vez de todas. Empresa grande nao
  // precisa esperar transferir o historico inteiro so pra pintar a tela --
  // `dados.parcial: true` e `dados.partes_total` avisam quem chamou que tem
  // mais dado disponivel, pra completar depois com getLatest (sem pressa,
  // em segundo plano). Snapshot que nao foi dividido (coube numa linha so)
  // ja vem completo mesmo, `parcial` nem aparece.
  async function getLatestRapido(empresaId, tipo, key) {
    var row = await buscarLinha(empresaId, tipo, key);
    if (!row || !row.dados || !row.dados.manifesto) return row;

    var partesTotal = row.dados.partes || 0;
    var primeira = await getPartes(empresaId, row.tipo + PARTE_SUFIXO_TIPO, row.cache_key, Math.min(1, partesTotal));
    if (!primeira) return null;
    return Object.assign({}, row, {
      dados: {
        vendas: primeira,
        origem: row.dados.origem,
        total_registros: row.dados.total_registros,
        gerado_em: row.dados.gerado_em,
        parcial: partesTotal > 1,
        partes_total: partesTotal
      }
    });
  }

  async function getPartes(empresaId, tipoParte, cacheKeyBase, totalPartes) {
    if (!totalPartes) return [];
    var chaves = [];
    for (var i = 0; i < totalPartes; i++) chaves.push(cacheKeyBase + ':p' + i);
    var url = supaUrl() + '/rest/v1/' + TABLE +
      '?empresa_id=eq.' + encodeURIComponent(empresaId) +
      '&tipo=eq.' + encodeURIComponent(tipoParte) +
      '&cache_key=in.(' + chaves.map(encodeURIComponent).join(',') + ')' +
      '&select=cache_key,dados';
    try {
      var resp = await fetch(url, { headers: headers() });
      var text = await readText(resp);
      if (!resp.ok) return null;
      var rows = safeParse(text, []);
      if (!Array.isArray(rows) || rows.length !== totalPartes) return null;
      var porChave = {};
      rows.forEach(function(r) { porChave[r.cache_key] = r; });
      var vendas = [];
      for (var i = 0; i < totalPartes; i++) {
        var r = porChave[cacheKeyBase + ':p' + i];
        if (!r || !r.dados || !Array.isArray(r.dados.vendas)) return null;
        vendas = vendas.concat(r.dados.vendas);
      }
      return vendas;
    } catch (e) {
      console.warn('[ReportCache:getPartes]', e);
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

  // Salva um snapshot grande demais pra uma linha so, dividido em pedacos ja
  // prontos (cada um dentro do limite de corpo do proxy -- quem chama decide
  // o tamanho de cada pedaco, aqui so persiste). Salva as partes primeiro e
  // SO escreve o manifesto depois de todas confirmadas: se uma parte falhar
  // no meio, o snapshot anterior (ainda com seu proprio manifesto antigo)
  // continua valido, em vez de apontar pra partes incompletas.
  async function saveChunked(base, pedacos) {
    if (!base || !base.empresa_id || !base.tipo || !supaUrl() || !Array.isArray(pedacos) || !pedacos.length) return false;
    var key = cacheKey(base.origem);
    var tipoParte = base.tipo + PARTE_SUFIXO_TIPO;
    var geradoEm = base.gerado_em || new Date().toISOString();

    for (var i = 0; i < pedacos.length; i++) {
      var ok = await save({
        empresa_id: base.empresa_id,
        tipo: tipoParte,
        cache_key: key + ':p' + i,
        origem: base.origem,
        periodo_inicio: base.periodo_inicio,
        periodo_fim: base.periodo_fim,
        total_registros: pedacos[i].length,
        dados: { vendas: pedacos[i], parte: i, partes: pedacos.length, origem: base.origem, gerado_em: geradoEm }
      });
      if (!ok) return false;
    }

    // Limpa partes orfas de uma geracao anterior com MAIS pedacos do que a
    // atual (empresa diminuiu, ou o tamanho do pedaco mudou) -- senao uma
    // parte antiga sobrando ficaria la, nunca lida mas nunca apagada.
    try {
      var chavesAtuais = pedacos.map(function(_, i) { return encodeURIComponent(key + ':p' + i); }).join(',');
      await fetch(
        supaUrl() + '/rest/v1/' + TABLE +
          '?empresa_id=eq.' + encodeURIComponent(base.empresa_id) +
          '&tipo=eq.' + encodeURIComponent(tipoParte) +
          '&cache_key=not.in.(' + chavesAtuais + ')',
        { method: 'DELETE', headers: headers({ 'Prefer': 'return=minimal' }) }
      );
    } catch (e) { console.warn('[ReportCache:saveChunked] limpeza de partes antigas falhou', e); }

    return save({
      empresa_id: base.empresa_id,
      tipo: base.tipo,
      cache_key: key,
      origem: base.origem,
      periodo_inicio: base.periodo_inicio,
      periodo_fim: base.periodo_fim,
      total_registros: base.total_registros,
      dados: { manifesto: true, partes: pedacos.length, origem: base.origem, total_registros: base.total_registros, gerado_em: geradoEm }
    });
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
    getLatestRapido: getLatestRapido,
    save: save,
    saveChunked: saveChunked,
    clearEmpresa: clearEmpresa
  };
})();
