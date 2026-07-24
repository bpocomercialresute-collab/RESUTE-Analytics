// RESUTE BPO admin console. Loaded after auth.js so SESSION and the secure fetch
// wrapper are already available.

var ADMIN_CONSOLE = {
  loaded: false,
  loading: false,
  activeSection: 'overview',
  companies: [],
  users: [],
  integrations: [],
  syncLogs: [],
  persistentAudit: [],
  metricsByCompany: {},
  salesCount: 0,
  userPage: 1,
  userPageSize: 10,
  activities: [],
  refreshTimer: null
};

var ADMIN_SECTION_META = {
  overview: {
    title: 'Visao geral',
    subtitle: 'Controle centralizado de empresas, acessos, integracoes e sincronizacoes.'
  },
  companies: {
    title: 'Empresas',
    subtitle: 'Cadastre operacoes, ajuste a origem dos dados e acompanhe cada empresa.'
  },
  users: {
    title: 'Usuarios e acessos',
    subtitle: 'Crie acessos, vincule empresas e controle o nivel de permissao.'
  },
  integrations: {
    title: 'Integracoes e APIs',
    subtitle: 'Acompanhe conexoes sem expor chaves, tokens ou segredos no navegador.'
  },
  sync: {
    title: 'Sincronizacoes e registros',
    subtitle: 'Consulte o historico operacional e abra a central de sincronizacao.'
  },
  audit: {
    title: 'Registros e auditoria',
    subtitle: 'Acompanhe eventos administrativos e sincronizacoes sem expor dados sensiveis.'
  },
  security: {
    title: 'Seguranca e permissoes',
    subtitle: 'Visualize as responsabilidades e os limites de cada nivel de acesso.'
  },
  settings: {
    title: 'Configuracoes',
    subtitle: 'Consulte o ambiente e ajuste preferencias locais da central BPO.'
  }
};

function adminConsoleEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function adminConsoleDate(value, includeTime) {
  if (!value) return 'Nao registrado';
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
}

function adminConsoleNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function adminConsoleHumanize(value) {
  var text = String(value || '').replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Evento administrativo';
}

function adminConsoleSafeText(value, maxLength) {
  var text = String(value == null ? '' : value)
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[token oculto]')
    .replace(/(client[_-]?secret|service[_-]?role[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[oculto]');
  return maxLength ? text.slice(0, maxLength) : text;
}

async function adminConsoleFetch(path, options) {
  var response = await fetch(SUPA_URL + path, options || {});
  var text = await response.text();
  var payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (e) { payload = text; }
  }
  if (!response.ok) {
    var message = payload && payload.erro
      ? payload.erro
      : (payload && payload.message ? payload.message : ('HTTP ' + response.status));
    throw new Error(message);
  }
  return { data: payload, response: response };
}

async function adminConsoleAction(action, payload) {
  var response = await NATIVE_FETCH('/api/secure-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-token': _getSessionToken()
    },
    body: JSON.stringify({
      action: action,
      payload: payload || {}
    })
  });
  var data = await response.json().catch(function() { return {}; });
  if (!response.ok) throw new Error(data.erro || ('HTTP ' + response.status));
  return data;
}

function adminConsoleAviso(message, type) {
  var notice = document.getElementById('admin-console-notice');
  if (!notice) return;
  notice.hidden = false;
  notice.className = 'admin-console-notice ' + (type || 'info');
  notice.textContent = message;
  window.clearTimeout(adminConsoleAviso._timer);
  adminConsoleAviso._timer = window.setTimeout(function() {
    notice.hidden = true;
  }, 6500);
}

function adminConsoleEmpty(message) {
  return '<div class="admin-empty-state"><strong>Nenhum registro encontrado</strong><span>'
    + adminConsoleEscape(message || 'Ajuste os filtros e tente novamente.')
    + '</span></div>';
}

function adminConsoleCompanyName(companyId) {
  var company = ADMIN_CONSOLE.companies.find(function(item) {
    return String(item.id || item.empresa_id) === String(companyId || '');
  });
  return company ? company.nome : (companyId ? 'Empresa nao localizada' : 'RESUTE');
}

function adminConsoleBadge(label, type) {
  return '<span class="admin-status-badge ' + adminConsoleEscape(type || 'neutral') + '">'
    + adminConsoleEscape(label) + '</span>';
}

function adminConsoleTrackActivity(type, title, detail) {
  ADMIN_CONSOLE.activities.unshift({
    type: type || 'administracao',
    title: title || 'Acao administrativa',
    detail: detail || '',
    at: new Date().toISOString(),
    actor: SESSION && (SESSION.nome || SESSION.email) ? (SESSION.nome || SESSION.email) : 'super_admin'
  });
  ADMIN_CONSOLE.activities = ADMIN_CONSOLE.activities.slice(0, 40);
  adminConsoleRenderAtividades();
  adminConsoleRenderAuditoria();
}

async function adminConsoleInicializar(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (ADMIN_CONSOLE.loading) return;
  if (ADMIN_CONSOLE.loaded && !force) {
    adminConsoleAbrir(ADMIN_CONSOLE.activeSection || 'overview');
    return;
  }

  ADMIN_CONSOLE.loading = true;
  var sessionLabel = document.getElementById('admin-session-label');
  if (sessionLabel) sessionLabel.textContent = (SESSION.email || SESSION.nome || 'RESUTE') + ' - super_admin';

  try {
    var companyRequest = adminConsoleFetch('/rest/v1/empresas?select=*&order=nome.asc');
    var userRequest = adminConsoleFetch('/rest/v1/usuarios?select=*&order=nome.asc');
    var integrationRequest = adminConsoleFetch('/rest/v1/api_config?select=empresa_id,sistema,api_url,ativo&order=empresa_id.asc');
    var syncRequest = adminConsoleFetch('/rest/v1/sync_log?select=*&order=ultima_sync.desc');
    var auditRequest = adminConsoleFetch('/rest/v1/admin_audit_log?select=id,criado_em,ator_email,acao,entidade,entidade_id,empresa_id,resumo,metadados&order=criado_em.desc&limit=200')
      .catch(function() { return { data: [] }; });

    var results = await Promise.all([companyRequest, userRequest, integrationRequest, syncRequest, auditRequest]);
    ADMIN_CONSOLE.companies = Array.isArray(results[0].data) ? results[0].data : [];
    ADMIN_CONSOLE.users = Array.isArray(results[1].data) ? results[1].data : [];
    ADMIN_CONSOLE.integrations = Array.isArray(results[2].data) ? results[2].data : [];
    ADMIN_CONSOLE.syncLogs = Array.isArray(results[3].data) ? results[3].data : [];
    ADMIN_CONSOLE.persistentAudit = Array.isArray(results[4].data) ? results[4].data : [];
    ADMIN_CONSOLE.metricsByCompany = await adminConsoleCarregarMetricas();
    ADMIN_CONSOLE.salesCount = adminConsoleMetricTotal('vendas');
    ADMIN_CONSOLE.loaded = true;
    adminConsolePreencherFiltros();
    adminConsoleRenderTudo();
    adminConsoleCarregarPreferencias();
  } catch (error) {
    console.error('[ADMIN CONSOLE]', error);
    adminConsoleAviso('Nao foi possivel carregar o painel: ' + error.message, 'error');
  } finally {
    ADMIN_CONSOLE.loading = false;
  }
}

async function adminConsoleCountTable(table, companyId) {
  try {
    var result = await adminConsoleFetch(
      '/rest/v1/' + table + '?empresa_id=eq.' + encodeURIComponent(companyId) + '&select=id',
      { headers: { Prefer: 'count=exact', Range: '0-0' } }
    );
    var range = result.response.headers.get('content-range') || '';
    var parts = range.split('/');
    if (parts.length === 2 && parts[1] !== '*') return Number(parts[1] || 0);
    return Array.isArray(result.data) ? result.data.length : 0;
  } catch (error) {
    console.warn('[ADMIN CONSOLE] Falha ao contar ' + table + ':', error.message);
    return 0;
  }
}

async function adminConsoleCarregarMetricas() {
  var tables = ['vendas', 'clientes_cad', 'produtos', 'representantes'];
  var output = {};
  await Promise.all(ADMIN_CONSOLE.companies.map(async function(company) {
    var companyId = company.id || company.empresa_id;
    if (!companyId) return;
    var values = await Promise.all(tables.map(function(table) {
      return adminConsoleCountTable(table, companyId);
    }));
    output[String(companyId)] = {
      vendas: values[0],
      clientes: values[1],
      produtos: values[2],
      representantes: values[3]
    };
  }));
  return output;
}

function adminConsoleMetricTotal(field) {
  return Object.keys(ADMIN_CONSOLE.metricsByCompany).reduce(function(total, companyId) {
    return total + Number((ADMIN_CONSOLE.metricsByCompany[companyId] || {})[field] || 0);
  }, 0);
}

function adminConsoleAbrir(section, navItem) {
  if (!SESSION || SESSION.papel !== 'super_admin') return false;
  var target = ADMIN_SECTION_META[section] ? section : 'overview';
  ADMIN_CONSOLE.activeSection = target;
  if (typeof switchView === 'function') switchView('view-admin-console');

  document.querySelectorAll('.admin-console-section').forEach(function(node) {
    node.classList.toggle('active', node.id === 'admin-section-' + target);
  });
  document.querySelectorAll('.cui-nav-item').forEach(function(node) {
    node.classList.remove('active', 'is-active');
  });
  var activeNav = navItem || document.querySelector('[data-admin-target="' + target + '"]');
  if (activeNav) activeNav.classList.add('active');

  var meta = ADMIN_SECTION_META[target];
  var title = document.getElementById('admin-console-title');
  var subtitle = document.getElementById('admin-console-subtitle');
  var breadcrumb = document.getElementById('breadcrumb-text');
  if (title) title.textContent = meta.title;
  if (subtitle) subtitle.textContent = meta.subtitle;
  if (breadcrumb) breadcrumb.textContent = meta.title;

  if (!ADMIN_CONSOLE.loaded) adminConsoleInicializar();
  if (window.innerWidth <= 900) {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }
  return false;
}

async function adminConsoleAtualizar() {
  ADMIN_CONSOLE.loaded = false;
  await adminConsoleInicializar(true);
  adminConsoleAviso('Dados administrativos atualizados.', 'success');
}

function adminConsoleRenderTudo() {
  adminConsoleRenderResumo();
  adminConsoleFiltrarEmpresas();
  adminConsoleFiltrarUsuarios();
  adminConsoleRenderIntegracoes();
  adminConsoleFiltrarSync();
  adminConsoleRenderAtividades();
  adminConsoleRenderAuditoria();
  adminConsoleRenderSeguranca();
}

function adminConsoleRenderResumo() {
  var activeCompanies = ADMIN_CONSOLE.companies.filter(function(item) { return item.ativo !== false; }).length;
  var activeUsers = ADMIN_CONSOLE.users.filter(function(item) { return item.ativo !== false; }).length;
  var activeIntegrations = ADMIN_CONSOLE.integrations.filter(function(item) { return item.ativo !== false; }).length;
  var disconnected = ADMIN_CONSOLE.companies.filter(function(company) {
    var id = company.id || company.empresa_id;
    return company.exibir_origem === 'api' && !ADMIN_CONSOLE.integrations.some(function(api) {
      return String(api.empresa_id) === String(id) && api.ativo !== false;
    });
  }).length;
  var alertCount = ADMIN_CONSOLE.syncLogs.filter(function(item) {
    return String(item.status || '').toLowerCase().indexOf('erro') >= 0;
  }).length + (ADMIN_CONSOLE.users.length - activeUsers) + disconnected;
  var values = {
    'admin-kpi-companies': activeCompanies,
    'admin-kpi-users': activeUsers,
    'admin-kpi-sales': ADMIN_CONSOLE.salesCount,
    'admin-kpi-clients': adminConsoleMetricTotal('clientes'),
    'admin-kpi-products': adminConsoleMetricTotal('produtos'),
    'admin-kpi-representatives': adminConsoleMetricTotal('representantes'),
    'admin-kpi-integrations': activeIntegrations,
    'admin-kpi-alerts': alertCount
  };
  Object.keys(values).forEach(function(id) {
    var node = document.getElementById(id);
    if (node) node.textContent = adminConsoleNumber(values[id]);
  });

  var latest = ADMIN_CONSOLE.syncLogs[0] || null;
  var settingsApi = document.getElementById('admin-settings-api');
  var settingsSync = document.getElementById('admin-settings-sync');
  if (settingsApi) settingsApi.textContent = activeIntegrations ? 'Configurada' : 'Pendente';
  if (settingsSync) settingsSync.textContent = latest
    ? adminConsoleDate(latest.ultima_sync || latest.ultima_data, true)
    : 'Nao registrada';

  var health = document.getElementById('admin-health-list');
  if (!health) return;
  var inactiveUsers = ADMIN_CONSOLE.users.length - activeUsers;

  var items = [
    {
      label: 'Base comercial',
      detail: ADMIN_CONSOLE.salesCount
        ? adminConsoleNumber(ADMIN_CONSOLE.salesCount) + ' registros disponiveis'
        : 'Nenhum registro de venda localizado',
      type: ADMIN_CONSOLE.salesCount ? 'ok' : 'warn'
    },
    {
      label: 'Ultima sincronizacao',
      detail: latest && latest.ultima_sync
        ? adminConsoleDate(latest.ultima_sync, true) + ' - ' + adminConsoleCompanyName(latest.empresa_id)
        : 'Ainda nao registrada',
      type: latest && String(latest.status || '').toLowerCase().indexOf('erro') < 0 ? 'ok' : 'warn'
    },
    {
      label: 'Acessos',
      detail: inactiveUsers ? inactiveUsers + ' usuario(s) inativo(s)' : 'Todos os usuarios estao ativos',
      type: inactiveUsers ? 'warn' : 'ok'
    },
    {
      label: 'Integracoes',
      detail: disconnected ? disconnected + ' empresa(s) aguardando configuracao' : 'Configuracoes operacionais coerentes',
      type: disconnected ? 'warn' : 'ok'
    }
  ];

  health.innerHTML = items.map(function(item) {
    return '<div class="admin-health-item"><span class="admin-health-icon ' + item.type + '"></span>'
      + '<div><strong>' + adminConsoleEscape(item.label) + '</strong><small>'
      + adminConsoleEscape(item.detail) + '</small></div>'
      + adminConsoleBadge(item.type === 'ok' ? 'Operacional' : 'Atencao', item.type)
      + '</div>';
  }).join('');
}

function adminConsoleOperationalActivities() {
  return ADMIN_CONSOLE.syncLogs.map(function(item) {
    return {
      type: 'sincronizacao',
      title: 'Sincronizacao ' + (item.status || 'registrada'),
      detail: adminConsoleCompanyName(item.empresa_id) + ' - ' + adminConsoleNumber(item.total_registros) + ' registros',
      at: item.ultima_sync || item.ultima_data,
      actor: 'Sistema'
    };
  });
}

function adminConsoleRenderAtividades() {
  var container = document.getElementById('admin-recent-activity');
  if (!container) return;
  var items = adminConsoleAuditItems()
    .sort(function(a, b) { return new Date(b.at || 0) - new Date(a.at || 0); })
    .slice(0, 6);
  if (!items.length) {
    container.innerHTML = adminConsoleEmpty('Nenhuma atividade administrativa ou sincronizacao registrada.');
    return;
  }
  container.innerHTML = items.map(function(item) {
    return '<div class="admin-activity-item"><span class="admin-activity-mark"></span><div><strong>'
      + adminConsoleEscape(item.title) + '</strong><small>' + adminConsoleEscape(item.detail)
      + '</small></div><time>' + adminConsoleEscape(adminConsoleDate(item.at, true)) + '</time></div>';
  }).join('');
}

function adminConsolePreencherFiltros() {
  var options = '<option value="">Todas as empresas</option>' + ADMIN_CONSOLE.companies.map(function(company) {
    var id = company.id || company.empresa_id;
    return '<option value="' + adminConsoleEscape(id) + '">' + adminConsoleEscape(company.nome) + '</option>';
  }).join('');
  ['admin-user-company', 'admin-sync-company'].forEach(function(id) {
    var select = document.getElementById(id);
    if (select) select.innerHTML = options;
  });
}

function adminConsoleFiltrarEmpresas() {
  var query = String((document.getElementById('admin-company-search') || {}).value || '').trim().toLowerCase();
  var status = String((document.getElementById('admin-company-status') || {}).value || '');
  var origin = String((document.getElementById('admin-company-origin') || {}).value || '');
  var list = ADMIN_CONSOLE.companies.filter(function(company) {
    var matchesQuery = !query || String(company.nome || '').toLowerCase().indexOf(query) >= 0
      || String(company.slug || '').toLowerCase().indexOf(query) >= 0;
    var active = company.ativo !== false;
    var matchesStatus = !status || (status === 'active' ? active : !active);
    var matchesOrigin = !origin || String(company.exibir_origem || 'manual') === origin;
    return matchesQuery && matchesStatus && matchesOrigin;
  });
  adminConsoleRenderEmpresas(list);
}

function adminConsoleRenderEmpresas(list) {
  var grid = document.getElementById('admin-companies-grid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = adminConsoleEmpty('Nenhuma empresa corresponde aos filtros selecionados.');
    return;
  }
  grid.innerHTML = list.map(function(company) {
    var id = company.id || company.empresa_id;
    var users = ADMIN_CONSOLE.users.filter(function(user) {
      return String(user.empresa_id || '') === String(id);
    }).length;
    var integration = ADMIN_CONSOLE.integrations.find(function(api) {
      return String(api.empresa_id) === String(id);
    });
    var metrics = ADMIN_CONSOLE.metricsByCompany[String(id)] || {};
    return '<article class="admin-company-card">'
      + '<div class="admin-company-top"><div class="admin-company-monogram">'
      + adminConsoleEscape(String(company.nome || 'E').slice(0, 2).toUpperCase())
      + '</div><div><h2>' + adminConsoleEscape(company.nome || 'Empresa') + '</h2><span>'
      + adminConsoleEscape(company.slug || 'sem slug') + '</span></div>'
      + adminConsoleBadge(company.ativo === false ? 'Inativa' : 'Ativa', company.ativo === false ? 'neutral' : 'ok')
      + '</div>'
      + '<div class="admin-company-metrics"><span><strong>' + users + '</strong> usuarios</span><span><strong>'
      + adminConsoleNumber(metrics.vendas) + '</strong> vendas</span><span><strong>'
      + adminConsoleNumber(metrics.clientes) + '</strong> clientes</span><span><strong>'
      + adminConsoleNumber(metrics.produtos) + '</strong> produtos</span><span><strong>'
      + adminConsoleNumber(metrics.representantes) + '</strong> representantes</span><span><strong>'
      + (integration && integration.ativo !== false ? 'Conectada' : 'Pendente') + '</strong> API</span></div>'
      + '<div class="admin-company-actions"><button onclick="adminConsoleEditarEmpresa(\'' + adminConsoleEscape(id) + '\')">Editar empresa</button>'
      + '<button onclick="adminConsoleAbrirOperacao(\'' + adminConsoleEscape(id) + '\')">Abrir operacao</button></div>'
      + '</article>';
  }).join('');
}

function adminConsoleFiltrarUsuarios() {
  var query = String((document.getElementById('admin-user-search') || {}).value || '').trim().toLowerCase();
  var role = String((document.getElementById('admin-user-role') || {}).value || '');
  var company = String((document.getElementById('admin-user-company') || {}).value || '');
  var status = String((document.getElementById('admin-user-status') || {}).value || '');
  var list = ADMIN_CONSOLE.users.filter(function(user) {
    var searchable = (String(user.nome || '') + ' ' + String(user.email || '')).toLowerCase();
    var active = user.ativo !== false;
    return (!query || searchable.indexOf(query) >= 0)
      && (!role || user.papel === role)
      && (!company || String(user.empresa_id || '') === company)
      && (!status || (status === 'active' ? active : !active));
  });
  ADMIN_CONSOLE.filteredUsers = list;
  var maxPage = Math.max(1, Math.ceil(list.length / ADMIN_CONSOLE.userPageSize));
  if (ADMIN_CONSOLE.userPage > maxPage) ADMIN_CONSOLE.userPage = maxPage;
  adminConsoleRenderUsuarios(list);
}

function adminConsoleRenderUsuarios(list) {
  var body = document.getElementById('admin-users-body');
  if (!body) return;
  var start = (ADMIN_CONSOLE.userPage - 1) * ADMIN_CONSOLE.userPageSize;
  var pageItems = list.slice(start, start + ADMIN_CONSOLE.userPageSize);
  var pageInfo = document.getElementById('admin-users-page-info');
  if (pageInfo) {
    pageInfo.textContent = list.length
      ? (start + 1) + '-' + Math.min(start + ADMIN_CONSOLE.userPageSize, list.length) + ' de ' + list.length + ' usuarios'
      : '0 usuarios';
  }
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7">' + adminConsoleEmpty('Nenhum usuario corresponde aos filtros selecionados.') + '</td></tr>';
    return;
  }
  body.innerHTML = pageItems.map(function(user) {
    var initial = String(user.nome || user.email || 'U').slice(0, 1).toUpperCase();
    var active = user.ativo !== false;
    return '<tr><td><div class="admin-user-cell"><span>' + adminConsoleEscape(initial) + '</span><div><strong>'
      + adminConsoleEscape(user.nome || 'Sem nome') + '</strong><small>' + adminConsoleEscape(user.email || '') + '</small></div></div></td>'
      + '<td>' + adminConsoleEscape(adminConsoleCompanyName(user.empresa_id)) + '</td>'
      + '<td>' + adminConsoleBadge(user.papel || 'cliente', user.papel === 'super_admin' ? 'featured' : 'neutral') + '</td>'
      + '<td>' + adminConsoleBadge(active ? 'Ativo' : 'Inativo', active ? 'ok' : 'neutral') + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(user.criado_em, false)) + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(user.ultimo_acesso || user.last_sign_in_at, true)) + '</td>'
      + '<td><button class="admin-table-action" onclick="adminConsoleEditarUsuario(\'' + adminConsoleEscape(user.id) + '\')">Editar</button></td></tr>';
  }).join('');
}

function adminConsoleMudarPaginaUsuarios(direction) {
  var list = ADMIN_CONSOLE.filteredUsers || [];
  var maxPage = Math.max(1, Math.ceil(list.length / ADMIN_CONSOLE.userPageSize));
  ADMIN_CONSOLE.userPage = Math.min(maxPage, Math.max(1, ADMIN_CONSOLE.userPage + Number(direction || 0)));
  adminConsoleRenderUsuarios(list);
}

function adminConsoleIntegrationStatus(api) {
  var log = ADMIN_CONSOLE.syncLogs.find(function(item) {
    return String(item.empresa_id) === String(api.empresa_id);
  });
  var rawStatus = String(log && log.status || '').toLowerCase();
  if (api.ativo === false) return { label: 'Pendente', type: 'neutral', log: log };
  if (rawStatus.indexOf('erro') >= 0 || rawStatus.indexOf('falha') >= 0) {
    return { label: 'Erro', type: 'warn', log: log };
  }
  if (rawStatus.indexOf('bloque') >= 0) return { label: 'Bloqueada', type: 'warn', log: log };
  if (rawStatus.indexOf('sincron') >= 0) return { label: 'Sincronizando', type: 'featured', log: log };
  if (!log || (!log.ultima_sync && !log.ultima_data)) {
    return { label: 'Nunca sincronizada', type: 'neutral', log: log };
  }
  return { label: 'Conectada', type: 'ok', log: log };
}

function adminConsoleRenderIntegracoes() {
  var grid = document.getElementById('admin-integrations-grid');
  if (!grid) return;
  if (!ADMIN_CONSOLE.integrations.length) {
    grid.innerHTML = adminConsoleEmpty('Nenhuma integracao foi cadastrada.');
    return;
  }
  grid.innerHTML = ADMIN_CONSOLE.integrations.map(function(api) {
    var company = adminConsoleCompanyName(api.empresa_id);
    var status = adminConsoleIntegrationStatus(api);
    var log = status.log || {};
    return '<article class="admin-integration-card"><div class="admin-integration-head"><div><span>'
      + adminConsoleEscape(company) + '</span><h2>' + adminConsoleEscape(api.sistema || 'API') + '</h2></div>'
      + adminConsoleBadge(status.label, status.type) + '</div>'
      + '<div class="admin-integration-info"><span>URL <strong>' + adminConsoleEscape(api.api_url || 'Nao configurada') + '</strong></span>'
      + '<span>Ultima sincronizacao <strong>' + adminConsoleEscape(adminConsoleDate(log.ultima_sync || log.ultima_data, true)) + '</strong></span>'
      + '<span>Registros importados <strong>' + adminConsoleNumber(log.total_registros) + '</strong></span>'
      + ((log.mensagem || log.erro) ? '<span>Resumo <strong>' + adminConsoleEscape(adminConsoleSafeText(log.mensagem || log.erro, 120)) + '</strong></span>' : '')
      + '<span>Client ID <strong>Protegido na Vercel</strong></span><span>Client Secret <strong>************</strong></span></div>'
      + '<div class="admin-company-actions"><button onclick="adminConsoleEditarIntegracao(\'' + adminConsoleEscape(api.empresa_id) + '\')">Editar configuracao</button>'
      + '<button onclick="adminConsoleTestarIntegracao()">Testar conexao</button></div></article>';
  }).join('');
}

function adminConsoleFiltrarSync() {
  var company = String((document.getElementById('admin-sync-company') || {}).value || '');
  var status = String((document.getElementById('admin-sync-status-filter') || {}).value || '').toLowerCase();
  var dateFrom = String((document.getElementById('admin-sync-date-from') || {}).value || '');
  var dateTo = String((document.getElementById('admin-sync-date-to') || {}).value || '');
  var list = ADMIN_CONSOLE.syncLogs.filter(function(item) {
    var itemStatus = String(item.status || '').toLowerCase();
    var itemDate = String(item.ultima_sync || item.ultima_data || '').slice(0, 10);
    var matchesStatus = !status
      || itemStatus.indexOf(status) >= 0
      || (status === 'sucesso' && (itemStatus === 'ok' || itemStatus.indexOf('conclu') >= 0));
    return (!company || String(item.empresa_id || '') === company)
      && matchesStatus
      && (!dateFrom || itemDate >= dateFrom)
      && (!dateTo || itemDate <= dateTo);
  });
  var body = document.getElementById('admin-sync-body');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7">' + adminConsoleEmpty('Nenhum registro de sincronizacao localizado.') + '</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(item, index) {
    var statusText = item.status || 'nao informado';
    var type = String(statusText).toLowerCase().indexOf('erro') >= 0 ? 'warn' : 'ok';
    return '<tr><td><strong>' + adminConsoleEscape(adminConsoleCompanyName(item.empresa_id)) + '</strong></td>'
      + '<td>Vendas e cadastros</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(item.ultima_sync, true)) + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(item.ultima_data, false)) + '</td>'
      + '<td>' + adminConsoleNumber(item.total_registros) + '</td>'
      + '<td>' + adminConsoleBadge(statusText, type) + '</td>'
      + '<td><button class="admin-table-action" onclick="adminConsoleDetalharSync(' + index + ')">Abrir</button></td></tr>';
  }).join('');
  ADMIN_CONSOLE.filteredSyncLogs = list;
}

function adminConsoleDetalharSync(index) {
  var item = (ADMIN_CONSOLE.filteredSyncLogs || [])[Number(index)];
  if (!item) return;
  var html = '<div class="admin-detail-grid">'
    + '<span>Empresa<strong>' + adminConsoleEscape(adminConsoleCompanyName(item.empresa_id)) + '</strong></span>'
    + '<span>Status<strong>' + adminConsoleEscape(item.status || 'Nao informado') + '</strong></span>'
    + '<span>Executada em<strong>' + adminConsoleEscape(adminConsoleDate(item.ultima_sync, true)) + '</strong></span>'
    + '<span>Periodo final<strong>' + adminConsoleEscape(adminConsoleDate(item.ultima_data, false)) + '</strong></span>'
    + '<span>Registros<strong>' + adminConsoleNumber(item.total_registros) + '</strong></span>'
    + '<span>Tipo<strong>Vendas e cadastros</strong></span>'
    + ((item.mensagem || item.erro) ? '<span class="admin-field-full">Mensagem<strong>' + adminConsoleEscape(adminConsoleSafeText(item.mensagem || item.erro, 500)) + '</strong></span>' : '')
    + '</div>'
    + '<div class="admin-form-help">O schema atual de sync_log registra o estado consolidado por empresa. Nenhum token ou segredo e exibido.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Fechar</button><button class="admin-btn-primary" type="button" onclick="adminConsoleFecharModal(); abrirAnaliseVendas()">Abrir central e repetir</button></div>';
  adminConsoleAbrirModal('SINCRONIZACAO', 'Detalhes do registro', html, function() {});
}

function adminConsoleAuditItems() {
  var persistent = ADMIN_CONSOLE.persistentAudit.map(function(item) {
    return {
      type: item.entidade || 'administracao',
      title: adminConsoleHumanize(item.acao),
      detail: item.resumo || '',
      at: item.criado_em,
      actor: item.ator_email || 'super_admin'
    };
  });
  return ADMIN_CONSOLE.activities.concat(persistent, adminConsoleOperationalActivities())
    .sort(function(a, b) { return new Date(b.at || 0) - new Date(a.at || 0); });
}

function adminConsoleRenderAuditoria() {
  var container = document.getElementById('admin-audit-list');
  if (!container) return;
  var query = String((document.getElementById('admin-audit-search') || {}).value || '').trim().toLowerCase();
  var type = String((document.getElementById('admin-audit-type') || {}).value || '');
  var items = adminConsoleAuditItems().filter(function(item) {
    var searchable = (String(item.title || '') + ' ' + String(item.detail || '') + ' ' + String(item.actor || '')).toLowerCase();
    return (!query || searchable.indexOf(query) >= 0) && (!type || item.type === type);
  });
  if (!items.length) {
    container.innerHTML = adminConsoleEmpty('Nenhum evento corresponde aos filtros selecionados.');
    return;
  }
  container.innerHTML = items.map(function(item) {
    return '<article class="admin-audit-item"><span class="admin-audit-type">'
      + adminConsoleEscape(item.type || 'evento') + '</span><div><strong>'
      + adminConsoleEscape(item.title) + '</strong><p>' + adminConsoleEscape(item.detail)
      + '</p><small>Responsavel: ' + adminConsoleEscape(item.actor || 'Sistema')
      + '</small></div><time>' + adminConsoleEscape(adminConsoleDate(item.at, true)) + '</time></article>';
  }).join('');
}

function adminConsoleLimparFiltroAuditoria() {
  var search = document.getElementById('admin-audit-search');
  var type = document.getElementById('admin-audit-type');
  if (search) search.value = '';
  if (type) type.value = '';
  adminConsoleRenderAuditoria();
}

function adminConsoleRenderSeguranca() {
  var container = document.getElementById('admin-security-alerts');
  if (!container) return;
  var inactive = ADMIN_CONSOLE.users.filter(function(user) { return user.ativo === false; });
  var withoutCompany = ADMIN_CONSOLE.users.filter(function(user) {
    return user.papel !== 'super_admin' && !user.empresa_id;
  });
  var superAdmins = ADMIN_CONSOLE.users.filter(function(user) {
    return user.papel === 'super_admin' && user.ativo !== false;
  });
  var items = [
    {
      label: 'Usuarios inativos',
      detail: inactive.length ? inactive.length + ' acesso(s) bloqueado(s)' : 'Nenhum usuario inativo',
      type: inactive.length ? 'warn' : 'ok'
    },
    {
      label: 'Usuarios sem empresa',
      detail: withoutCompany.length ? withoutCompany.length + ' cadastro(s) precisam de revisao' : 'Todos os perfis empresariais estao vinculados',
      type: withoutCompany.length ? 'warn' : 'ok'
    },
    {
      label: 'Super administradores',
      detail: superAdmins.length + ' acesso(s) global(is) ativo(s)',
      type: superAdmins.length ? 'ok' : 'warn'
    }
  ];
  container.innerHTML = items.map(function(item) {
    return '<div class="admin-health-item"><span class="admin-health-icon ' + item.type + '"></span><div><strong>'
      + adminConsoleEscape(item.label) + '</strong><small>' + adminConsoleEscape(item.detail)
      + '</small></div>' + adminConsoleBadge(item.type === 'ok' ? 'Conforme' : 'Revisar', item.type) + '</div>';
  }).join('');
}

function adminConsoleCarregarPreferencias() {
  var compact = false;
  var refresh = '0';
  try {
    compact = localStorage.getItem('resute_admin_compact') === 'true';
    refresh = localStorage.getItem('resute_admin_refresh') || '0';
  } catch (error) {}
  var compactInput = document.getElementById('admin-setting-compact');
  var refreshInput = document.getElementById('admin-setting-refresh');
  var role = document.getElementById('admin-settings-role');
  if (compactInput) compactInput.checked = compact;
  if (refreshInput) refreshInput.value = refresh;
  if (role) role.textContent = SESSION && SESSION.papel ? SESSION.papel : 'super_admin';
  document.body.classList.toggle('admin-console-compact', compact);
  adminConsoleConfigurarAtualizacao(Number(refresh || 0));
}

function adminConsoleSalvarPreferencias() {
  var compactInput = document.getElementById('admin-setting-compact');
  var refreshInput = document.getElementById('admin-setting-refresh');
  var compact = !!(compactInput && compactInput.checked);
  var refresh = String(refreshInput && refreshInput.value || '0');
  try {
    localStorage.setItem('resute_admin_compact', compact ? 'true' : 'false');
    localStorage.setItem('resute_admin_refresh', refresh);
  } catch (error) {}
  document.body.classList.toggle('admin-console-compact', compact);
  adminConsoleConfigurarAtualizacao(Number(refresh || 0));
  adminConsoleAviso('Preferencias locais atualizadas.', 'success');
}

function adminConsoleConfigurarAtualizacao(seconds) {
  window.clearInterval(ADMIN_CONSOLE.refreshTimer);
  ADMIN_CONSOLE.refreshTimer = null;
  if (!seconds) return;
  ADMIN_CONSOLE.refreshTimer = window.setInterval(function() {
    if (SESSION && SESSION.papel === 'super_admin' && !ADMIN_CONSOLE.loading) {
      adminConsoleInicializar(true);
    }
  }, seconds * 1000);
}

function adminConsoleAbrirOperacao(companyId) {
  if (typeof adminSelecionarEmpresa === 'function') {
    if (typeof switchView === 'function') switchView('view-app');
    adminSelecionarEmpresa(companyId);
    var breadcrumb = document.getElementById('breadcrumb-text');
    if (breadcrumb) breadcrumb.textContent = 'Analise de Vendas';
  }
}

function adminConsoleAbrirModal(kicker, title, html, submitHandler) {
  var backdrop = document.getElementById('admin-modal-backdrop');
  var form = document.getElementById('admin-modal-form');
  var titleNode = document.getElementById('admin-modal-title');
  var kickerNode = document.getElementById('admin-modal-kicker');
  if (!backdrop || !form) return;
  if (titleNode) titleNode.textContent = title;
  if (kickerNode) kickerNode.textContent = kicker;
  form.innerHTML = html;
  form.onsubmit = function(event) {
    event.preventDefault();
    submitHandler(new FormData(form), form);
  };
  backdrop.hidden = false;
  document.body.classList.add('admin-modal-open');
  window.setTimeout(function() {
    var first = form.querySelector('input,select');
    if (first) first.focus();
  }, 40);
}

function adminConsoleFecharModal() {
  var backdrop = document.getElementById('admin-modal-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('admin-modal-open');
}

function adminConsoleCompanyOptions(selectedId, includeResute) {
  var first = includeResute ? '<option value="">RESUTE / sem empresa</option>' : '<option value="">Selecione...</option>';
  return first + ADMIN_CONSOLE.companies.map(function(company) {
    var id = company.id || company.empresa_id;
    return '<option value="' + adminConsoleEscape(id) + '"' + (String(id) === String(selectedId || '') ? ' selected' : '') + '>'
      + adminConsoleEscape(company.nome) + '</option>';
  }).join('');
}

function adminConsoleNovaEmpresa() {
  adminConsoleEmpresaModal(null);
}

function adminConsoleEditarEmpresa(companyId) {
  var company = ADMIN_CONSOLE.companies.find(function(item) {
    return String(item.id || item.empresa_id) === String(companyId);
  });
  if (company) adminConsoleEmpresaModal(company);
}

function adminConsoleEmpresaModal(company) {
  var editing = !!company;
  var html = '<div class="admin-form-grid">'
    + '<label class="admin-field"><span>Nome da empresa</span><input name="nome" required maxlength="120" value="' + adminConsoleEscape(company && company.nome) + '"></label>'
    + '<label class="admin-field"><span>Slug</span><input name="slug" required maxlength="80" pattern="[a-z0-9-]+" value="' + adminConsoleEscape(company && company.slug) + '"></label>'
    + '<label class="admin-field"><span>Origem dos dados</span><select name="exibir_origem"><option value="manual"' + (company && company.exibir_origem === 'manual' ? ' selected' : '') + '>Manual</option><option value="api"' + (company && company.exibir_origem === 'api' ? ' selected' : '') + '>API</option></select></label>'
    + '<label class="admin-field admin-field-switch"><input name="ativo" type="checkbox"' + (!company || company.ativo !== false ? ' checked' : '') + '><span>Empresa ativa</span></label>'
    + (editing ? '<label class="admin-field admin-field-switch admin-field-full"><input name="confirmacao" type="checkbox" required><span>Confirmo a alteracao desta empresa sem excluir seus dados</span></label>' : '')
    + '</div><div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Cancelar</button><button class="admin-btn-primary" type="submit">' + (editing ? 'Salvar alteracoes' : 'Cadastrar empresa') + '</button></div>';
  adminConsoleAbrirModal('EMPRESAS', editing ? 'Editar empresa' : 'Adicionar empresa', html, async function(data, form) {
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    var payload = {
      nome: String(data.get('nome') || '').trim(),
      slug: String(data.get('slug') || '').trim().toLowerCase(),
      exibir_origem: String(data.get('exibir_origem') || 'manual'),
      ativo: data.get('ativo') === 'on'
    };
    try {
      if (editing) {
        var id = company.id || company.empresa_id;
        await adminConsoleFetch('/rest/v1/empresas?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload)
        });
      } else {
        await adminConsoleFetch('/rest/v1/empresas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload)
        });
      }
      adminConsoleFecharModal();
      await adminConsoleAtualizar();
      adminConsoleTrackActivity('empresa', editing ? 'Empresa atualizada' : 'Empresa cadastrada', payload.nome);
      adminConsoleAviso(editing ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.', 'success');
    } catch (error) {
      adminConsoleAviso('Falha ao salvar empresa: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
}

function adminConsoleNovoUsuario() {
  adminConsoleUsuarioModal(null);
}

function adminConsoleEditarUsuario(userId) {
  var user = ADMIN_CONSOLE.users.find(function(item) { return String(item.id) === String(userId); });
  if (user) adminConsoleUsuarioModal(user);
}

function adminConsoleUsuarioModal(user) {
  var editing = !!user;
  var html = '<div class="admin-form-grid">'
    + '<label class="admin-field"><span>Nome completo</span><input name="nome" required maxlength="140" value="' + adminConsoleEscape(user && user.nome) + '"></label>'
    + '<label class="admin-field"><span>E-mail</span><input name="email" type="email" required value="' + adminConsoleEscape(user && user.email) + '"></label>'
    + '<label class="admin-field"><span>Nivel de acesso</span><select name="papel"><option value="cliente"' + (user && user.papel === 'cliente' ? ' selected' : '') + '>Cliente</option><option value="admin"' + (user && user.papel === 'admin' ? ' selected' : '') + '>Admin</option><option value="super_admin"' + (user && user.papel === 'super_admin' ? ' selected' : '') + '>Super admin</option></select></label>'
    + '<label class="admin-field"><span>Empresa vinculada</span><select name="empresa_id">' + adminConsoleCompanyOptions(user && user.empresa_id, true) + '</select></label>'
    + '<label class="admin-field"><span>' + (editing ? 'Nova senha (opcional)' : 'Senha temporaria') + '</span><input name="password" type="password" ' + (editing ? '' : 'required') + ' minlength="8" autocomplete="new-password"></label>'
    + '<label class="admin-field admin-field-switch"><input name="ativo" type="checkbox"' + (!user || user.ativo !== false ? ' checked' : '') + '><span>Usuario ativo</span></label>'
    + (editing ? '<label class="admin-field admin-field-switch admin-field-full"><input name="confirmacao" type="checkbox" required><span>Confirmo a revisao do papel, empresa e status deste acesso</span></label>' : '')
    + '</div><div class="admin-form-help">A senha deve ter pelo menos 8 caracteres. Segredos nunca sao exibidos depois de salvos.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Cancelar</button><button class="admin-btn-primary" type="submit">' + (editing ? 'Salvar alteracoes' : 'Criar usuario') + '</button></div>';
  adminConsoleAbrirModal('USUARIOS E ACESSOS', editing ? 'Editar usuario' : 'Adicionar usuario', html, async function(data, form) {
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    var payload = {
      id: user ? user.id : null,
      nome: String(data.get('nome') || '').trim(),
      email: String(data.get('email') || '').trim().toLowerCase(),
      papel: String(data.get('papel') || 'cliente'),
      empresa_id: String(data.get('empresa_id') || '') || null,
      password: String(data.get('password') || ''),
      ativo: data.get('ativo') === 'on'
    };
    try {
      await adminConsoleAction(editing ? 'admin-user-update' : 'admin-user-create', payload);
      adminConsoleFecharModal();
      await adminConsoleAtualizar();
      adminConsoleTrackActivity('usuario', editing ? 'Usuario atualizado' : 'Usuario criado', payload.email + ' - ' + payload.papel);
      adminConsoleAviso(editing ? 'Usuario atualizado com sucesso.' : 'Usuario criado no Auth e na tabela usuarios.', 'success');
    } catch (error) {
      adminConsoleAviso('Falha ao salvar usuario: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
}

function adminConsoleEditarIntegracao(companyId) {
  var api = ADMIN_CONSOLE.integrations.find(function(item) {
    return String(item.empresa_id) === String(companyId);
  });
  if (!api) return;
  var html = '<div class="admin-form-grid">'
    + '<label class="admin-field"><span>Empresa</span><input value="' + adminConsoleEscape(adminConsoleCompanyName(companyId)) + '" disabled></label>'
    + '<label class="admin-field"><span>Sistema</span><input name="sistema" required value="' + adminConsoleEscape(api.sistema || '') + '"></label>'
    + '<label class="admin-field admin-field-full"><span>URL da API</span><input name="api_url" type="url" required value="' + adminConsoleEscape(api.api_url || '') + '"></label>'
    + '<label class="admin-field admin-field-switch"><input name="ativo" type="checkbox"' + (api.ativo !== false ? ' checked' : '') + '><span>Integracao ativa</span></label>'
    + '</div><div class="admin-form-help">Client ID e Client Secret ficam protegidos nas variaveis de ambiente da Vercel. Este formulario nao recupera nem revela esses valores.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Cancelar</button><button class="admin-btn-primary" type="submit">Salvar configuracao</button></div>';
  adminConsoleAbrirModal('INTEGRACOES', 'Editar integracao', html, async function(data, form) {
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    try {
      await adminConsoleFetch('/rest/v1/api_config?empresa_id=eq.' + encodeURIComponent(companyId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          sistema: String(data.get('sistema') || '').trim(),
          api_url: String(data.get('api_url') || '').trim(),
          ativo: data.get('ativo') === 'on'
        })
      });
      adminConsoleFecharModal();
      await adminConsoleAtualizar();
      adminConsoleTrackActivity('integracao', 'Integracao atualizada', adminConsoleCompanyName(companyId) + ' - ' + String(data.get('sistema') || 'API'));
      adminConsoleAviso('Integracao atualizada com sucesso.', 'success');
    } catch (error) {
      adminConsoleAviso('Falha ao atualizar integracao: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
}

async function adminConsoleTestarIntegracao() {
  adminConsoleAviso('Testando comunicacao segura com a Visual Saef...', 'info');
  try {
    var result = await adminConsoleAction('admin-integration-test', {});
    adminConsoleTrackActivity('integracao', 'Teste de API concluido', result.mensagem || 'Visual Saef respondeu corretamente');
    adminConsoleAviso(result.mensagem || 'Conexao validada com sucesso.', 'success');
  } catch (error) {
    adminConsoleTrackActivity('integracao', 'Falha no teste de API', error.message);
    adminConsoleAviso('Teste de conexao falhou: ' + error.message, 'error');
  }
}

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') adminConsoleFecharModal();
});

document.addEventListener('DOMContentLoaded', function() {
  var restored = typeof _readStoredSession === 'function' ? _readStoredSession() : null;
  if (restored && restored.token) {
    SESSION = restored;
    if (typeof _abrirApp === 'function') _abrirApp();
  }
});
