// js/error-log.js — captura erro de JS em producao e manda pro backend
// (api/log-error.js -> tabela error_log no Supabase), pra dar visibilidade
// de erro real sem depender de ninguem abrir o F12 e mandar print.
// Carregado ANTES de qualquer outro script, de proposito: pega erro de
// carregamento dos scripts seguintes tambem.
(function() {
  'use strict';

  var ENVIADOS = 0;
  var MAX_ENVIOS_SESSAO = 30; // loop de erro no cliente nao pode virar flood de requisicao
  var ultimaMensagem = '';
  var ultimoEnvioEm = 0;

  function enviar(mensagem, stack, contexto) {
    if (ENVIADOS >= MAX_ENVIOS_SESSAO) return;
    var agora = Date.now();
    // mesma mensagem repetindo rapido (loop) -- so a primeira vale.
    if (mensagem === ultimaMensagem && (agora - ultimoEnvioEm) < 2000) return;
    ultimaMensagem = mensagem;
    ultimoEnvioEm = agora;
    ENVIADOS += 1;

    var payload = {
      mensagem: String(mensagem || 'Erro desconhecido').slice(0, 2000),
      stack: stack ? String(stack).slice(0, 4000) : null,
      url: String(location.href || '').slice(0, 500),
      empresa_id: (window.SESSION && window.SESSION.empresa_id) || null,
      user_email: (window.SESSION && window.SESSION.email) || null,
      contexto: contexto || null
    };

    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    } catch (e) { /* o proprio log de erro nunca pode quebrar a pagina */ }
  }

  window.addEventListener('error', function(ev) {
    // Falha de carregar recurso (img/script) tambem dispara 'error' sem
    // message/error -- so interessa erro de script de verdade.
    if (!ev || (!ev.message && !ev.error)) return;
    var err = ev.error;
    enviar(ev.message || (err && err.message), err && err.stack, {
      tipo: 'window.onerror', linha: ev.lineno, coluna: ev.colno, arquivo: ev.filename
    });
  });

  window.addEventListener('unhandledrejection', function(ev) {
    var razao = ev && ev.reason;
    var mensagem = (razao && razao.message) ? razao.message : String(razao);
    enviar(mensagem, razao && razao.stack, { tipo: 'unhandledrejection' });
  });
})();
