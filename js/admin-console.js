// RESUTE BPO admin console. Loaded after auth.js so SESSION and the secure fetch
// wrapper are already available.

var ADMIN_CONSOLE = {
  loaded: false,
  loading: false,
  activeSection: 'overview',
  companies: [],
  modules: [],
  modulesLoaded: false,
  users: [],
  integrations: [],
  syncLogs: [],
  persistentAudit: [],
  metricsByCompany: {},
  salesCount: 0,
  userPage: 1,
  userPageSize: 10,
  activities: [],
  refreshTimer: null,
  lastRefresh: null,
  loadErrors: []
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
  financeiro: {
    title: 'Financeiro',
    subtitle: 'Contratos, planos e acessos do produto financeiro.'
  },
  modules: {
    title: 'Modulos e contratos',
    subtitle: 'Defina quais modulos cada empresa contratou. Desativar bloqueia o acesso sem apagar dados.'
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

function adminConsoleWithTimeout(promise, timeoutMs, message) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      timer = window.setTimeout(function() {
        reject(new Error(message || 'A operacao demorou mais que o esperado.'));
      }, timeoutMs || 30000);
    })
  ]).finally(function() {
    window.clearTimeout(timer);
  });
}

function adminConsoleSetLoading(loading) {
  var view = document.getElementById('view-admin-console');
  var status = document.getElementById('admin-session-status');
  if (view) {
    view.classList.toggle('is-loading', !!loading);
    view.setAttribute('aria-busy', loading ? 'true' : 'false');
  }
  if (status) status.textContent = loading ? 'Atualizando painel' : 'Sessao protegida';
  document.querySelectorAll('#view-admin-console [data-admin-refresh]').forEach(function(button) {
    button.disabled = !!loading;
  });
}

function adminConsoleSetLastRefresh(date) {
  var node = document.getElementById('admin-last-refresh');
  if (!node) return;
  node.textContent = date
    ? 'Atualizado ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : 'Aguardando atualizacao';
}

async function adminConsoleFetch(path, options) {
  var response = await adminConsoleWithTimeout(
    fetch(SUPA_URL + path, options || {}),
    12000,
    'O Supabase nao respondeu dentro do tempo esperado.'
  );
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
  var response = await adminConsoleWithTimeout(
    NATIVE_FETCH('/api/secure-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': _getSessionToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        action: action,
        payload: payload || {}
      })
    }),
    35000,
    'A acao administrativa demorou mais que o esperado.'
  );
  var data = await response.json().catch(function() { return {}; });
  if (!response.ok) throw new Error(data.erro || ('HTTP ' + response.status));
  return data;
}

function adminConsoleAviso(message, type) {
  var notice = document.getElementById('admin-console-notice');
  if (!notice) return;
  notice.hidden = false;
  notice.className = 'admin-console-notice ' + (type || 'info');
  notice.textContent = message; // sempre textContent — nunca innerHTML com dados externos
  window.clearTimeout(adminConsoleAviso._timer);
  adminConsoleAviso._timer = window.setTimeout(function() {
    notice.hidden = true;
  }, 10000);
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
  if (!SESSION || SESSION.papel !== 'super_admin') return false;
  if (ADMIN_CONSOLE.loading) return false;
  if (ADMIN_CONSOLE.loaded && !force) {
    adminConsoleAbrir(ADMIN_CONSOLE.activeSection || 'overview');
    return true;
  }

  ADMIN_CONSOLE.loading = true;
  ADMIN_CONSOLE.loadErrors = [];
  adminConsoleSetLoading(true);
  var sessionLabel = document.getElementById('admin-session-label');
  if (sessionLabel) sessionLabel.textContent = (SESSION.email || SESSION.nome || 'RESUTE') + ' - super_admin';

  try {
    var companyRequest = adminConsoleFetch('/rest/v1/empresas?select=*&order=nome.asc');
    var userRequest = adminConsoleFetch('/rest/v1/usuarios?select=*&order=nome.asc');
    var integrationRequest = adminConsoleFetch('/rest/v1/api_config?select=empresa_id,sistema,api_url,ativo&order=empresa_id.asc');
    var syncRequest = adminConsoleFetch('/rest/v1/sync_log?select=*&order=ultima_sync.desc.nullslast');
    var auditRequest = adminConsoleFetch('/rest/v1/admin_audit_log?select=id,criado_em,ator_email,acao,entidade,entidade_id,empresa_id,resumo,metadados&order=criado_em.desc&limit=200')
      .catch(function() { return { data: [] }; });

    var requests = [companyRequest, userRequest, integrationRequest, syncRequest, auditRequest];
    var labels = ['empresas', 'usuarios', 'integracoes', 'sincronizacoes', 'auditoria'];
    var results = await Promise.allSettled(requests);
    var targets = ['companies', 'users', 'integrations', 'syncLogs', 'persistentAudit'];
    results.forEach(function(result, index) {
      if (result.status === 'fulfilled') {
        ADMIN_CONSOLE[targets[index]] = Array.isArray(result.value.data) ? result.value.data : [];
      } else {
        ADMIN_CONSOLE.loadErrors.push(labels[index] + ': ' + (result.reason && result.reason.message ? result.reason.message : result.reason));
      }
    });
    // O painel RESUTE administra clientes e acessos. Os dados comerciais
    // permanecem na central operacional de cada empresa.
    ADMIN_CONSOLE.metricsByCompany = {};
    ADMIN_CONSOLE.salesCount = 0;
    ADMIN_CONSOLE.loaded = true;
    ADMIN_CONSOLE.lastRefresh = new Date();
    adminConsolePreencherFiltros();
    adminConsoleRenderTudo();
    adminConsoleCarregarPreferencias();
    adminConsoleSetLastRefresh(ADMIN_CONSOLE.lastRefresh);
    if (ADMIN_CONSOLE.loadErrors.length) {
      adminConsoleAviso('Painel carregado parcialmente. Revise: ' + ADMIN_CONSOLE.loadErrors.join(' | '), 'error');
      return false;
    }
    return true;
  } catch (error) {
    console.error('[ADMIN CONSOLE]', error);
    adminConsoleAviso('Nao foi possivel carregar o painel: ' + error.message, 'error');
    return false;
  } finally {
    ADMIN_CONSOLE.loading = false;
    adminConsoleSetLoading(false);
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

function adminConsoleSyncDateValue(item) {
  if (!item) return 0;
  var value = item.ultima_sync || item.atualizado_em || item.criado_em || item.ultima_data;
  var time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function adminConsoleLatestSync(companyId) {
  return ADMIN_CONSOLE.syncLogs
    .filter(function(item) {
      return !companyId || String(item.empresa_id || '') === String(companyId);
    })
    .slice()
    .sort(function(a, b) {
      return adminConsoleSyncDateValue(b) - adminConsoleSyncDateValue(a);
    })[0] || null;
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
  if (target === 'modules' || target === 'financeiro') adminConsoleCarregarModulos();
  if (target === 'financeiro' && typeof finAdminCarregarResumo === 'function') finAdminCarregarResumo();
  if (target === 'financeiro' && typeof dreAdminCarregarResumo === 'function') dreAdminCarregarResumo();
  if (window.innerWidth <= 900) {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }
  return false;
}

async function adminConsoleAtualizar(silent) {
  ADMIN_CONSOLE.loaded = false;
  var ok = await adminConsoleInicializar(true);
  if (ok && !silent) adminConsoleAviso('Dados administrativos atualizados.', 'success');
  return ok;
}

function adminConsoleRenderTudo() {
  adminConsoleRenderResumo();
  adminConsoleRenderModulos();
  adminConsoleRenderFinanceiro();
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
  var clientUsers = ADMIN_CONSOLE.users.filter(function(item) {
    return item.ativo !== false && item.papel === 'cliente' && item.empresa_id;
  }).length;
  var adminUsers = ADMIN_CONSOLE.users.filter(function(item) {
    return item.ativo !== false && (item.papel === 'admin' || item.papel === 'super_admin');
  }).length;
  var apiCompanies = ADMIN_CONSOLE.companies.filter(function(item) {
    return item.ativo !== false && String(item.exibir_origem || 'manual').toLowerCase() === 'api';
  }).length;
  var monitoredSyncs = new Set(ADMIN_CONSOLE.syncLogs.map(function(item) {
    return String(item.empresa_id || '');
  }).filter(Boolean)).size;
  var activeIntegrations = ADMIN_CONSOLE.integrations.filter(function(item) { return item.ativo !== false; }).length;
  var disconnected = ADMIN_CONSOLE.companies.filter(function(company) {
    var id = company.id || company.empresa_id;
    return company.exibir_origem === 'api' && !ADMIN_CONSOLE.integrations.some(function(api) {
      return String(api.empresa_id) === String(id) && api.ativo !== false;
    });
  }).length;
  var alertCount = ADMIN_CONSOLE.syncLogs.filter(function(item) {
    return adminConsoleSyncState(item).type === 'warn';
  }).length + (ADMIN_CONSOLE.users.length - activeUsers) + disconnected;
  var values = {
    'admin-kpi-companies': activeCompanies,
    'admin-kpi-users': activeUsers,
    'admin-kpi-client-users': clientUsers,
    'admin-kpi-admins': adminUsers,
    'admin-kpi-api-companies': apiCompanies,
    'admin-kpi-sync': monitoredSyncs,
    'admin-kpi-integrations': activeIntegrations,
    'admin-kpi-alerts': alertCount
  };
  Object.keys(values).forEach(function(id) {
    var node = document.getElementById(id);
    if (node) node.textContent = adminConsoleNumber(values[id]);
  });

  var latest = adminConsoleLatestSync();
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
      label: 'Empresas gerenciadas',
      detail: activeCompanies + ' de ' + ADMIN_CONSOLE.companies.length + ' empresa(s) ativa(s)',
      type: activeCompanies ? 'ok' : 'warn'
    },
    {
      label: 'Ultima sincronizacao dos clientes',
      detail: latest && adminConsoleSyncDateValue(latest)
        ? adminConsoleDate(latest.ultima_sync || latest.atualizado_em || latest.criado_em || latest.ultima_data, true)
          + ' - ' + adminConsoleCompanyName(latest.empresa_id)
        : 'Ainda nao registrada',
      type: latest && adminConsoleSyncState(latest).type === 'ok' ? 'ok' : 'warn'
    },
    {
      label: 'Acessos da plataforma',
      detail: activeUsers + ' ativo(s)' + (inactiveUsers ? ' e ' + inactiveUsers + ' inativo(s)' : ''),
      type: inactiveUsers ? 'warn' : 'ok'
    },
    {
      label: 'Integracoes dos clientes',
      detail: disconnected
        ? disconnected + ' empresa(s) com API aguardando configuracao'
        : activeIntegrations + ' conexao(oes) administrativa(s) ativa(s)',
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
    var state = adminConsoleSyncState(item);
    return {
      type: 'sincronizacao',
      title: 'Sincronizacao ' + state.label.toLowerCase(),
      detail: adminConsoleCompanyName(item.empresa_id) + ' - acompanhamento operacional',
      at: item.ultima_sync || item.atualizado_em || item.criado_em || item.ultima_data,
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
  var result = document.getElementById('admin-company-result');
  if (result) result.textContent = list.length + (list.length === 1 ? ' empresa' : ' empresas');
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
    var integration = ADMIN_CONSOLE.integrations.find(function(api) {
      return String(api.empresa_id) === String(id);
    });
    var companyUsers = ADMIN_CONSOLE.users.filter(function(user) {
      return String(user.empresa_id || '') === String(id) && user.ativo !== false;
    });
    var latestSync = adminConsoleLatestSync(id);
    var syncState = latestSync
      ? adminConsoleSyncState(latestSync)
      : { label: 'Nao registrada', type: 'neutral' };
    var origin = String(company.exibir_origem || 'manual').toLowerCase() === 'api' ? 'API' : 'Manual';
    return '<article class="admin-company-card">'
      + '<div class="admin-company-top"><div class="admin-company-monogram">'
      + adminConsoleEscape(String(company.nome || 'E').slice(0, 2).toUpperCase())
      + '</div><div><h2>' + adminConsoleEscape(company.nome || 'Empresa') + '</h2><span>'
      + adminConsoleEscape(company.slug || 'sem slug') + '</span></div>'
      + adminConsoleBadge(company.ativo === false ? 'Inativa' : 'Ativa', company.ativo === false ? 'neutral' : 'ok')
      + '</div>'
      + '<div class="admin-company-metrics"><span><strong>' + companyUsers.length + '</strong> acesso(s)</span><span><strong>'
      + companyUsers.filter(function(user) { return user.papel === 'cliente'; }).length + '</strong> cliente(s)</span><span><strong>'
      + adminConsoleEscape(origin) + '</strong> origem</span><span><strong>'
      + (integration && integration.ativo !== false ? 'Conectada' : 'Pendente') + '</strong> integracao</span><span><strong>'
      + adminConsoleEscape(syncState.label) + '</strong> sincronizacao</span><span><strong>'
      + adminConsoleEscape(latestSync
        ? adminConsoleDate(latestSync.ultima_sync || latestSync.atualizado_em || latestSync.criado_em || latestSync.ultima_data, false)
        : 'Nao registrada')
      + '</strong> ultima execucao</span></div>'
      + '<div class="admin-company-actions"><button onclick="adminConsoleEditarEmpresa(\'' + adminConsoleEscape(id) + '\')">Editar empresa</button>'
      + (integration
        ? '<button onclick="adminConsoleEditarIntegracao(\'' + adminConsoleEscape(id) + '\')">Configurar API</button>'
        : '<button onclick="adminConsoleNovaIntegracao(\'' + adminConsoleEscape(id) + '\')">Conectar API</button>')
      + '<button onclick="adminConsoleNovoUsuarioPara(\'' + adminConsoleEscape(id) + '\')">Adicionar usuario</button>'
      + '<button onclick="adminConsoleFiltrarPorEmpresa(\'' + adminConsoleEscape(id) + '\')">Ver usuarios</button>'
      + '<button class="admin-company-danger" onclick="adminConsoleArquivarEmpresa(\'' + adminConsoleEscape(id) + '\')">Arquivar</button>'
      + '<button class="admin-company-delete" onclick="adminConsoleExcluirEmpresa(\'' + adminConsoleEscape(id) + '\')">Excluir empresa</button>'
      + '<button class="admin-company-primary" onclick="adminConsoleAbrirOperacao(\'' + adminConsoleEscape(id) + '\')">Abrir operacao</button></div>'
      + '</article>';
  }).join('');
}

function adminConsoleFiltrarUsuarios(resetPage) {
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
  if (resetPage) ADMIN_CONSOLE.userPage = 1;
  var maxPage = Math.max(1, Math.ceil(list.length / ADMIN_CONSOLE.userPageSize));
  if (ADMIN_CONSOLE.userPage > maxPage) ADMIN_CONSOLE.userPage = maxPage;
  var result = document.getElementById('admin-user-result');
  if (result) result.textContent = list.length + (list.length === 1 ? ' usuario' : ' usuarios');
  adminConsoleRenderUsuarios(list);
}

function adminConsoleRenderUsuarios(list) {
  var body = document.getElementById('admin-users-body');
  if (!body) return;
  var start = (ADMIN_CONSOLE.userPage - 1) * ADMIN_CONSOLE.userPageSize;
  var pageItems = list.slice(start, start + ADMIN_CONSOLE.userPageSize);
  var pageInfo = document.getElementById('admin-users-page-info');
  var previous = document.getElementById('admin-users-prev');
  var next = document.getElementById('admin-users-next');
  var maxPage = Math.max(1, Math.ceil(list.length / ADMIN_CONSOLE.userPageSize));
  if (previous) previous.disabled = !list.length || ADMIN_CONSOLE.userPage <= 1;
  if (next) next.disabled = !list.length || ADMIN_CONSOLE.userPage >= maxPage;
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
    var uid = adminConsoleEscape(user.id);
    var canEnter = active && user.papel !== 'super_admin' && user.empresa_id;
    return '<tr><td><div class="admin-user-cell"><span>' + adminConsoleEscape(initial) + '</span><div><strong>'
      + adminConsoleEscape(user.nome || 'Sem nome') + '</strong><small>' + adminConsoleEscape(user.email || '') + '</small></div></div></td>'
      + '<td>' + adminConsoleEscape(adminConsoleCompanyName(user.empresa_id)) + '</td>'
      + '<td>' + adminConsoleBadge(user.papel === 'super_admin' ? 'Gerente geral' : user.papel === 'admin' ? 'Admin' : 'Cliente', user.papel === 'super_admin' ? 'featured' : 'neutral') + '</td>'
      + '<td>' + adminConsoleBadge(active ? 'Ativo' : 'Inativo', active ? 'ok' : 'neutral') + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(user.criado_em, false)) + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(user.ultimo_acesso || user.last_sign_in_at, true)) + '</td>'
      + '<td class="admin-table-actions">'
      + '<button class="admin-table-action" onclick="adminConsoleEditarUsuario(\'' + uid + '\')">Editar</button>'
      + (canEnter ? '<button class="admin-table-action admin-table-action-primary" onclick="adminConsoleEntrarComo(\'' + uid + '\')">Entrar como</button>' : '')
      + '<button class="admin-table-action admin-table-action-danger" onclick="adminConsoleExcluirUsuario(\'' + uid + '\')">Excluir</button>'
      + '</td></tr>';
  }).join('');
}

function adminConsoleMudarPaginaUsuarios(direction) {
  var list = ADMIN_CONSOLE.filteredUsers || [];
  var maxPage = Math.max(1, Math.ceil(list.length / ADMIN_CONSOLE.userPageSize));
  ADMIN_CONSOLE.userPage = Math.min(maxPage, Math.max(1, ADMIN_CONSOLE.userPage + Number(direction || 0)));
  adminConsoleRenderUsuarios(list);
}

function adminConsoleSyncState(item) {
  var status = String(item && item.status || '').toLowerCase();
  if (status.indexOf('erro') >= 0 || status.indexOf('falha') >= 0 || status.indexOf('bloque') >= 0) {
    return { label: item.status || 'Erro', type: 'warn', filter: 'erro' };
  }
  if (status === 'ok' || status === 'sincronizado' || status.indexOf('sucesso') >= 0 || status.indexOf('conclu') >= 0) {
    return { label: item.status || 'Sucesso', type: 'ok', filter: 'sucesso' };
  }
  if (status.indexOf('sincron') >= 0 || status.indexOf('process') >= 0) {
    return { label: item.status || 'Sincronizando', type: 'featured', filter: 'sincronizando' };
  }
  return { label: item && item.status ? item.status : 'Nao informado', type: 'neutral', filter: '' };
}

function adminConsoleIntegrationStatus(api) {
  var log = adminConsoleLatestSync(api.empresa_id);
  var rawStatus = String(log && log.status || '').toLowerCase();
  if (api.ativo === false) return { label: 'Pendente', type: 'neutral', log: log };
  if (rawStatus.indexOf('erro') >= 0 || rawStatus.indexOf('falha') >= 0) {
    return { label: 'Erro', type: 'warn', log: log };
  }
  if (rawStatus.indexOf('bloque') >= 0) return { label: 'Bloqueada', type: 'warn', log: log };
  if (rawStatus.indexOf('sincronizando') >= 0 || rawStatus.indexOf('process') >= 0) {
    return { label: 'Sincronizando', type: 'featured', log: log };
  }
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
      + '<span>Ultima sincronizacao <strong>' + adminConsoleEscape(adminConsoleDate(log.ultima_sync || log.atualizado_em || log.criado_em || log.ultima_data, true)) + '</strong></span>'
      + '<span>Estado operacional <strong>' + adminConsoleEscape(status.label) + '</strong></span>'
      + ((log.mensagem || log.erro) ? '<span>Resumo <strong>' + adminConsoleEscape(adminConsoleSafeText(log.mensagem || log.erro, 120)) + '</strong></span>' : '')
      + '<span>Client ID <strong>Protegido na Vercel</strong></span><span>Client Secret <strong>************</strong></span></div>'
      + '<div class="admin-company-actions"><button onclick="adminConsoleEditarIntegracao(\'' + adminConsoleEscape(api.empresa_id) + '\')">Editar configuracao</button>'
      + '<button onclick="adminConsoleTestarIntegracao(\'' + adminConsoleEscape(api.empresa_id) + '\', this)">Testar conexao</button></div></article>';
  }).join('');
}

function adminConsoleFiltrarSync() {
  var company = String((document.getElementById('admin-sync-company') || {}).value || '');
  var status = String((document.getElementById('admin-sync-status-filter') || {}).value || '').toLowerCase();
  var dateFrom = String((document.getElementById('admin-sync-date-from') || {}).value || '');
  var dateTo = String((document.getElementById('admin-sync-date-to') || {}).value || '');
  var list = ADMIN_CONSOLE.syncLogs.filter(function(item) {
    var syncState = adminConsoleSyncState(item);
    var itemDate = String(item.ultima_sync || item.ultima_data || '').slice(0, 10);
    var matchesStatus = !status || syncState.filter === status;
    return (!company || String(item.empresa_id || '') === company)
      && matchesStatus
      && (!dateFrom || itemDate >= dateFrom)
      && (!dateTo || itemDate <= dateTo);
  });
  var result = document.getElementById('admin-sync-result');
  if (result) result.textContent = list.length + (list.length === 1 ? ' registro' : ' registros');
  var body = document.getElementById('admin-sync-body');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7">' + adminConsoleEmpty('Nenhum registro de sincronizacao localizado.') + '</td></tr>';
    return;
  }
  body.innerHTML = list.map(function(item, index) {
    var syncState = adminConsoleSyncState(item);
    var eid = adminConsoleEscape(String(item.empresa_id || ''));
    return '<tr><td><strong>' + adminConsoleEscape(adminConsoleCompanyName(item.empresa_id)) + '</strong></td>'
      + '<td>Vendas e cadastros</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(item.ultima_sync, true)) + '</td>'
      + '<td>' + adminConsoleEscape(adminConsoleDate(item.ultima_data, false)) + '</td>'
      + '<td>' + adminConsoleNumber(item.total_registros) + '</td>'
      + '<td>' + adminConsoleBadge(syncState.label, syncState.type) + '</td>'
      + '<td class="admin-table-actions">'
      + '<button class="admin-table-action" onclick="adminConsoleDetalharSync(' + index + ')">Detalhes</button>'
      + '</td></tr>';
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
    + '<div class="admin-form-help">O sync_log registra o estado consolidado por empresa. Nenhum token ou segredo e exibido.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Fechar</button><button class="admin-btn-primary" type="button" onclick="adminConsoleFecharModal(); adminConsoleAbrirSyncEmpresa(\'' + adminConsoleEscape(String(item.empresa_id || '')) + '\')">Abrir painel de sync</button></div>';
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

// ── MODULOS E CONTRATOS ──────────────────────────────────────────────────────
// Liga/desliga o Comercial e o Financeiro por empresa. A escrita sempre passa
// pela acao 'admin-module-toggle' no secure-proxy (service role no servidor);
// o navegador nunca escreve direto em empresa_modulos.

var ADMIN_MODULOS = [
  { slug: 'comercial',  nome: 'Comercial',  descricao: 'Relatorios de vendas, produtos e representantes.' },
  { slug: 'financeiro', nome: 'Financeiro', descricao: 'Relatorios financeiros (modulo em construcao).' }
];

async function adminConsoleCarregarModulos(force) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;
  if (ADMIN_CONSOLE.modulesLoaded && !force) {
    adminConsoleRenderModulos();
    return;
  }
  try {
    var resultado = await adminConsoleFetch('/rest/v1/empresa_modulos?select=empresa_id,modulo,ativo,expira_em');
    ADMIN_CONSOLE.modules = Array.isArray(resultado.data) ? resultado.data : [];
    ADMIN_CONSOLE.modulesLoaded = true;
  } catch (e) {
    ADMIN_CONSOLE.modules = [];
    ADMIN_CONSOLE.modulesLoaded = false;
    adminConsoleAviso('Nao foi possivel carregar os contratos de modulo: ' + e.message
      + ' Rode docs/supabase-modulos.sql no Supabase.', 'warn');
  }
  adminConsoleRenderModulos();
  adminConsoleRenderFinanceiro();
}

/** Contrato vigente de um modulo para uma empresa (ou null). */
function adminConsoleContratoModulo(companyId, slug) {
  return (ADMIN_CONSOLE.modules || []).find(function(item) {
    return String(item.empresa_id) === String(companyId) && String(item.modulo) === slug;
  }) || null;
}

/** Regra unica: ativo = true E (expira_em null OU expira_em > agora). */
function adminConsoleModuloVigente(contrato) {
  if (!contrato || contrato.ativo !== true) return false;
  if (!contrato.expira_em) return true;
  return new Date(contrato.expira_em).getTime() > Date.now();
}

function adminConsoleRenderModulos() {
  var grid = document.getElementById('admin-modules-grid');
  if (!grid) return;

  var termo = String((document.getElementById('admin-module-search') || {}).value || '').trim().toLowerCase();
  var filtro = String((document.getElementById('admin-module-filter') || {}).value || '');

  var empresas = (ADMIN_CONSOLE.companies || []).filter(function(empresa) {
    var nome = String(empresa.nome || '').toLowerCase();
    if (termo && nome.indexOf(termo) === -1) return false;

    var id = empresa.id || empresa.empresa_id;
    var vigentes = ADMIN_MODULOS.filter(function(mod) {
      return adminConsoleModuloVigente(adminConsoleContratoModulo(id, mod.slug));
    }).map(function(mod) { return mod.slug; });

    if (filtro === 'nenhum') return vigentes.length === 0;
    if (filtro) return vigentes.indexOf(filtro) !== -1;
    return true;
  });

  var contador = document.getElementById('admin-module-result');
  if (contador) contador.textContent = empresas.length + ' empresa(s)';

  if (!empresas.length) {
    grid.innerHTML = adminConsoleEmpty('Nenhuma empresa corresponde ao filtro.');
    return;
  }

  grid.innerHTML = empresas.map(function(empresa) {
    var id = String(empresa.id || empresa.empresa_id || '');
    var linhas = ADMIN_MODULOS.map(function(mod) {
      var contrato = adminConsoleContratoModulo(id, mod.slug);
      var vigente = adminConsoleModuloVigente(contrato);
      var expira = contrato && contrato.expira_em
        ? String(contrato.expira_em).slice(0, 10)
        : '';
      var statusBadge = vigente
        ? adminConsoleBadge('Contratado', 'success')
        : (contrato && contrato.ativo === true
            ? adminConsoleBadge('Expirado', 'warn')
            : adminConsoleBadge('Nao contratado', 'neutral'));

      return '<div class="admin-module-row">'
        + '<div class="admin-module-info"><strong>' + adminConsoleEscape(mod.nome) + '</strong>'
        + '<small>' + adminConsoleEscape(mod.descricao) + '</small></div>'
        + statusBadge
        + '<label class="admin-module-expira">Expira em'
        + '<input type="date" value="' + adminConsoleEscape(expira) + '"'
        + ' data-module-expira="' + adminConsoleEscape(id) + '|' + mod.slug + '"></label>'
        + '<button type="button" class="' + (vigente ? 'admin-btn-secondary' : 'admin-btn-primary') + '"'
        + ' onclick="adminConsoleAlternarModulo(\'' + adminConsoleEscape(id) + '\', \'' + mod.slug + '\', ' + (!vigente) + ')">'
        + (vigente ? 'Desativar' : 'Ativar') + '</button>'
        + '</div>';
    }).join('');

    return '<article class="admin-panel-card admin-module-card">'
      + '<div class="admin-card-heading"><div><span>EMPRESA</span>'
      + '<h2>' + adminConsoleEscape(empresa.nome || 'Empresa') + '</h2></div>'
      + (empresa.ativo === false ? adminConsoleBadge('Empresa inativa', 'danger') : '')
      + '</div>' + linhas + '</article>';
  }).join('');
}

/**
 * Ativa ou desativa um modulo. Desativar nunca apaga dado — o backend so
 * marca ativo = false.
 */
async function adminConsoleAlternarModulo(companyId, modulo, ativar) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;

  var campoExpira = document.querySelector('[data-module-expira="' + companyId + '|' + modulo + '"]');
  var expiraEm = campoExpira && campoExpira.value ? campoExpira.value : null;

  var empresaNome = adminConsoleCompanyName(companyId);
  var acao = ativar ? 'ativar' : 'desativar';
  if (!window.confirm('Confirma ' + acao + ' o modulo ' + modulo + ' para ' + empresaNome + '?')) return;

  try {
    await adminConsoleAction('admin-module-toggle', {
      empresa_id: companyId,
      modulo: modulo,
      ativo: !!ativar,
      expira_em: ativar ? expiraEm : null
    });
    adminConsoleTrackActivity(
      'administracao',
      'Modulo ' + (ativar ? 'ativado' : 'desativado'),
      modulo + ' - ' + empresaNome
    );
    adminConsoleAviso('Modulo ' + modulo + ' ' + (ativar ? 'ativado' : 'desativado') + ' para ' + empresaNome + '.', 'success');
    await adminConsoleCarregarModulos(true);
  } catch (e) {
    adminConsoleAviso('Falha ao atualizar o modulo: ' + e.message, 'error');
  }
}

// ── ABA FINANCEIRO ───────────────────────────────────────────────────────────
// Visao por produto: quem contratou o financeiro, em que plano, e quem tem
// acesso. O plano e o jeito rapido de decidir o que a empresa enxerga;
// a secao "Modulos e contratos" continua servindo para o ajuste fino.

var ADMIN_PLANOS = [
  { id: 'comercial',  nome: 'Somente Comercial',      modulos: ['comercial'] },
  { id: 'financeiro', nome: 'Somente Financeiro',     modulos: ['financeiro'] },
  { id: 'completo',   nome: 'Comercial + Financeiro', modulos: ['comercial', 'financeiro'] },
  { id: 'nenhum',     nome: 'Sem acesso',             modulos: [] }
];

/** Plano vigente de uma empresa, derivado dos modulos ativos. */
function adminConsolePlanoDaEmpresa(companyId) {
  var temComercial  = adminConsoleModuloVigente(adminConsoleContratoModulo(companyId, 'comercial'));
  var temFinanceiro = adminConsoleModuloVigente(adminConsoleContratoModulo(companyId, 'financeiro'));
  if (temComercial && temFinanceiro) return 'completo';
  if (temFinanceiro) return 'financeiro';
  if (temComercial) return 'comercial';
  return 'nenhum';
}

function adminConsolePlanoNome(planoId) {
  var plano = ADMIN_PLANOS.find(function(item) { return item.id === planoId; });
  return plano ? plano.nome : 'Sem acesso';
}

/** Usuarios vinculados a uma empresa. */
function adminConsoleUsuariosDaEmpresa(companyId) {
  return (ADMIN_CONSOLE.users || []).filter(function(user) {
    return String(user.empresa_id || '') === String(companyId);
  });
}

function adminConsoleRenderFinanceiro() {
  var grid = document.getElementById('admin-financeiro-grid');
  if (!grid) return;

  var empresas = (ADMIN_CONSOLE.companies || []).map(function(empresa) {
    var id = String(empresa.id || empresa.empresa_id || '');
    return { dados: empresa, id: id, plano: adminConsolePlanoDaEmpresa(id) };
  });

  // KPIs do topo — sempre sobre o total, não sobre o filtro
  var comFinanceiro = empresas.filter(function(e) { return e.plano === 'financeiro' || e.plano === 'completo'; });
  var somenteFin = empresas.filter(function(e) { return e.plano === 'financeiro'; });
  var acessos = comFinanceiro.reduce(function(total, e) {
    return total + adminConsoleUsuariosDaEmpresa(e.id).length;
  }, 0);
  var limite = Date.now() + (30 * 24 * 60 * 60 * 1000);
  var vencendo = (ADMIN_CONSOLE.modules || []).filter(function(item) {
    if (item.modulo !== 'financeiro' || item.ativo !== true || !item.expira_em) return false;
    var quando = new Date(item.expira_em).getTime();
    return quando > Date.now() && quando <= limite;
  }).length;

  var kpis = {
    'admin-fin-kpi-empresas': comFinanceiro.length,
    'admin-fin-kpi-somente': somenteFin.length,
    'admin-fin-kpi-usuarios': acessos,
    'admin-fin-kpi-vencendo': vencendo
  };
  Object.keys(kpis).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(kpis[id]);
  });

  // Filtros
  var termo = String((document.getElementById('admin-fin-search') || {}).value || '').trim().toLowerCase();
  var planoFiltro = String((document.getElementById('admin-fin-plano') || {}).value || '');
  var lista = empresas.filter(function(item) {
    if (termo && String(item.dados.nome || '').toLowerCase().indexOf(termo) === -1) return false;
    if (planoFiltro && item.plano !== planoFiltro) return false;
    return true;
  });

  var contador = document.getElementById('admin-fin-result');
  if (contador) contador.textContent = lista.length + ' empresa(s)';

  if (!lista.length) {
    grid.innerHTML = adminConsoleEmpty('Nenhuma empresa corresponde ao filtro.');
    return;
  }

  grid.innerHTML = lista.map(function(item) {
    var id = item.id;
    var usuarios = adminConsoleUsuariosDaEmpresa(id);
    var temFinanceiro = item.plano === 'financeiro' || item.plano === 'completo';

    var opcoes = ADMIN_PLANOS.map(function(plano) {
      return '<option value="' + plano.id + '"' + (plano.id === item.plano ? ' selected' : '') + '>'
        + adminConsoleEscape(plano.nome) + '</option>';
    }).join('');

    var contrato = adminConsoleContratoModulo(id, 'financeiro');
    var expira = contrato && contrato.expira_em ? String(contrato.expira_em).slice(0, 10) : '';

    var listaUsuarios = usuarios.length
      ? '<ul class="admin-fin-users">' + usuarios.map(function(user) {
          return '<li><span><strong>' + adminConsoleEscape(user.nome || user.email || 'Acesso')
            + '</strong><small>' + adminConsoleEscape(user.email || '') + '</small></span>'
            + adminConsoleBadge(user.ativo === false ? 'Inativo' : (user.papel || 'cliente'),
                                user.ativo === false ? 'danger' : 'neutral')
            + '<button type="button" class="admin-btn-secondary" onclick="adminConsoleEditarUsuario(\''
            + adminConsoleEscape(String(user.id)) + '\')">Editar</button></li>';
        }).join('') + '</ul>'
      : '<p class="admin-fin-sem-acesso">Nenhum acesso criado para esta empresa.</p>';

    return '<article class="admin-panel-card admin-module-card">'
      + '<div class="admin-card-heading"><div><span>EMPRESA</span>'
      + '<h2>' + adminConsoleEscape(item.dados.nome || 'Empresa') + '</h2></div>'
      + adminConsoleBadge(adminConsolePlanoNome(item.plano), temFinanceiro ? 'success' : 'neutral')
      + '</div>'

      + '<div class="admin-module-row">'
      +   '<div class="admin-module-info"><strong>Plano contratado</strong>'
      +   '<small>Define o que o cliente enxerga ao entrar no sistema.</small></div>'
      +   '<select data-fin-plano="' + adminConsoleEscape(id) + '">' + opcoes + '</select>'
      +   '<label class="admin-module-expira">Expira em'
      +   '<input type="date" value="' + adminConsoleEscape(expira) + '" data-fin-expira="' + adminConsoleEscape(id) + '"></label>'
      +   '<button type="button" class="admin-btn-primary" onclick="adminConsoleAplicarPlano(\'' + adminConsoleEscape(id) + '\')">Aplicar</button>'
      + '</div>'

      + '<div class="admin-module-row">'
      +   '<div class="admin-module-info"><strong>Dados financeiros</strong>'
      +   '<small>' + adminConsoleEscape(
              typeof finAdminResumoTexto === 'function' ? finAdminResumoTexto(id) : ''
            ) + '</small></div>'
      +   '<button type="button" class="admin-btn-secondary" onclick="finAdminAbrirImportacao(\'' + adminConsoleEscape(id) + '\')">Importar lançamentos</button>'
      +   '<button type="button" class="admin-btn-secondary admin-btn-danger" onclick="finAdminLimpar(\'' + adminConsoleEscape(id) + '\')">Limpar</button>'
      + '</div>'

      // DRE: a digitação (plano de contas, lançamentos, F_V/D_I) acontece dentro
      // do próprio painel do cliente, nas abas Plano de Contas/Lançamentos. Aqui
      // o admin só abre o painel da empresa e vê o resumo somente-leitura.
      + '<div class="admin-module-row">'
      +   '<div class="admin-module-info"><strong>Dados do DRE</strong>'
      +   '<small>' + adminConsoleEscape(
              typeof dreAdminResumoTexto === 'function' ? dreAdminResumoTexto(id) : ''
            ) + '</small></div>'
      +   '<button type="button" class="admin-btn-secondary" onclick="dreAbrirDoAdmin(\'' + adminConsoleEscape(id) + '\')">Abrir DRE</button>'
      + '</div>'

      + '<div class="admin-module-row admin-fin-acessos">'
      +   '<div class="admin-module-info"><strong>Acessos (' + usuarios.length + ')</strong>'
      +   '<small>Login de cliente. O super_admin gerencia tudo por aqui.</small></div>'
      +   '<button type="button" class="admin-btn-secondary" onclick="adminConsoleNovoUsuarioPara(\'' + adminConsoleEscape(id) + '\')">Adicionar acesso</button>'
      +   (temFinanceiro
            ? '<button type="button" class="admin-btn-secondary" onclick="adminConsoleAbrirFinanceiroEmpresa(\'' + adminConsoleEscape(id) + '\')">Ver painel do cliente</button>'
            : '')
      + '</div>'
      + listaUsuarios
      + '</article>';
  }).join('');
}

/** Aplica o plano escolhido no card. Nunca apaga dado — só desliga módulo. */
async function adminConsoleAplicarPlano(companyId) {
  if (!SESSION || SESSION.papel !== 'super_admin') return;

  var seletor = document.querySelector('[data-fin-plano="' + companyId + '"]');
  var campoExpira = document.querySelector('[data-fin-expira="' + companyId + '"]');
  if (!seletor) return;

  var plano = seletor.value;
  var empresaNome = adminConsoleCompanyName(companyId);
  if (!window.confirm('Aplicar o plano "' + adminConsolePlanoNome(plano) + '" para ' + empresaNome + '?')) return;

  try {
    await adminConsoleAction('admin-plan-set', {
      empresa_id: companyId,
      plano: plano,
      expira_em: campoExpira && campoExpira.value ? campoExpira.value : null
    });
    adminConsoleTrackActivity('administracao', 'Plano alterado', adminConsolePlanoNome(plano) + ' - ' + empresaNome);
    adminConsoleAviso('Plano de ' + empresaNome + ' atualizado para "' + adminConsolePlanoNome(plano) + '".', 'success');
    await adminConsoleCarregarModulos(true);
  } catch (e) {
    adminConsoleAviso('Falha ao aplicar o plano: ' + e.message, 'error');
  }
}

/** Abre o painel financeiro da empresa em modo de visualizacao supervisionada. */
async function adminConsoleAbrirFinanceiroEmpresa(companyId) {
  if (!companyId || typeof abrirPainelClienteAdmin !== 'function') return;

  // Garante que a lista de preview exista mesmo sem passar pelo seletor de empresas
  if (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined'
      && (!ADMIN_PREVIEW_COMPANIES || !ADMIN_PREVIEW_COMPANIES.length)) {
    ADMIN_PREVIEW_COMPANIES = (ADMIN_CONSOLE.companies || []).map(function(company) {
      return {
        empresa_id: company.id || company.empresa_id,
        nome: company.nome || 'Empresa',
        slug: company.slug || null,
        logo_url: company.logo_url || null,
        ativo: company.ativo !== false,
        tem_api: false
      };
    });
  }

  abrirPainelClienteAdmin(companyId);
  if (typeof abrirModulo === 'function' && typeof MODULOS !== 'undefined') {
    abrirModulo(MODULOS.FINANCEIRO, { empresaIdPreview: companyId });
  }
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

async function adminConsoleAbrirOperacao(companyId) {
  if (!companyId) return;
  // Sync EMPRESAS_ADMIN from admin console cache so adminSelecionarEmpresa can
  // find the company even when view-app was never opened in this session.
  if (ADMIN_CONSOLE.companies.length && typeof EMPRESAS_ADMIN !== 'undefined') {
    EMPRESAS_ADMIN = ADMIN_CONSOLE.companies.map(function(c) {
      var api = ADMIN_CONSOLE.integrations.find(function(a) {
        return String(a.empresa_id) === String(c.id || c.empresa_id) && a.ativo !== false;
      });
      var origem = String(c.exibir_origem || 'manual').toLowerCase();
      return {
        empresa_id: c.id || c.empresa_id,
        nome: c.nome || '',
        slug: c.slug || '',
        ativo: c.ativo !== false,
        tem_api: !!api && origem === 'api',
        sistema: api ? api.sistema : null,
        exibir_origem: origem
      };
    });
    if (typeof _adminRenderAbas === 'function') _adminRenderAbas();
  } else if (typeof _adminCarregarEmpresasMeta === 'function') {
    await _adminCarregarEmpresasMeta();
    if (typeof _adminRenderAbas === 'function') _adminRenderAbas();
  }
  if (typeof switchView === 'function') switchView('view-app');
  if (typeof adminSelecionarEmpresa === 'function') adminSelecionarEmpresa(companyId);
  var breadcrumb = document.getElementById('breadcrumb-text');
  if (breadcrumb) breadcrumb.textContent = 'Analise de Vendas';
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

function adminConsoleBackdropClick(event) {
  if (event && event.target && event.target.id === 'admin-modal-backdrop') {
    adminConsoleFecharModal();
  }
}

function adminConsoleFecharModal() {
  var backdrop = document.getElementById('admin-modal-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('admin-modal-open');
}

function adminConsoleSlugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function adminConsoleSincronizarSlug(input) {
  var form = input && input.form;
  var slug = form && form.elements ? form.elements.slug : null;
  if (slug && !slug.dataset.manual) slug.value = adminConsoleSlugify(input.value);
}

function adminConsoleMarcarSlugManual(input) {
  if (input) input.dataset.manual = input.value ? 'true' : '';
}

function adminConsoleAtualizarEscopoUsuario(form) {
  if (!form || !form.elements) return;
  var role = form.elements.papel;
  var company = form.elements.empresa_id;
  if (!role || !company) return;
  var globalAccess = role.value === 'super_admin';
  company.disabled = globalAccess;
  company.required = !globalAccess;
  if (globalAccess) company.value = '';
  var field = company.closest('.admin-field');
  if (field) field.classList.toggle('is-disabled', globalAccess);
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

async function adminConsoleExcluirEmpresa(companyId) {
  var company = ADMIN_CONSOLE.companies.find(function(item) {
    return String(item.id || item.empresa_id) === String(companyId);
  });
  if (!company) return;
  var confirmed = window.confirm(
    'EXCLUIR PERMANENTEMENTE "' + (company.nome || companyId) + '"?\n\n'
    + 'Isso apaga a empresa, todos os usuarios, integracao, sincronizacoes e dados operacionais do banco de dados.\n\n'
    + 'Esta acao NAO pode ser desfeita.'
  );
  if (!confirmed) return;
  var confirmNome = window.prompt(
    'Digite o nome da empresa para confirmar a exclusao:\n\n"' + (company.nome || companyId) + '"'
  );
  if (!confirmNome || confirmNome.trim() !== (company.nome || '').trim()) {
    adminConsoleAviso('Nome nao confere. Exclusao cancelada.', 'error');
    return;
  }
  try {
    await adminConsoleAction('admin-company-delete', { id: companyId });
    adminConsoleTrackActivity('empresa', 'Empresa excluida', company.nome || companyId);
    await adminConsoleAtualizar(true);
    adminConsoleAviso('Empresa e todos os dados vinculados foram excluidos.', 'success');
  } catch (error) {
    adminConsoleAviso('Falha ao excluir empresa: ' + error.message, 'error');
  }
}

async function adminConsoleArquivarEmpresa(companyId) {
  var company = ADMIN_CONSOLE.companies.find(function(item) {
    return String(item.id || item.empresa_id) === String(companyId);
  });
  if (!company) return;
  var confirmed = window.confirm(
    'Arquivar ' + (company.nome || 'esta empresa')
      + '? A empresa, a integracao e os acessos vinculados serao desativados.'
  );
  if (!confirmed) return;
  try {
    await adminConsoleAction('admin-company-archive', { company_ids: [companyId] });
    adminConsoleTrackActivity('empresa', 'Empresa arquivada', company.nome || companyId);
    await adminConsoleAtualizar(true);
    adminConsoleAviso('Empresa arquivada e acessos vinculados bloqueados.', 'success');
  } catch (error) {
    adminConsoleAviso('Falha ao arquivar empresa: ' + error.message, 'error');
  }
}

function adminConsoleEmpresaModal(company) {
  var editing = !!company;
  var html = '<div class="admin-form-grid">'
    + '<label class="admin-field"><span>Nome da empresa</span><input name="nome" required maxlength="120" oninput="adminConsoleSincronizarSlug(this)" value="' + adminConsoleEscape(company && company.nome) + '"></label>'
    + '<label class="admin-field"><span>Slug</span><input name="slug" required maxlength="80" pattern="[a-z0-9-]+"' + (editing ? ' data-manual="true"' : '') + ' oninput="adminConsoleMarcarSlugManual(this)" value="' + adminConsoleEscape(company && company.slug) + '"></label>'
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
      await adminConsoleAtualizar(true);
      adminConsoleTrackActivity('empresa', editing ? 'Empresa atualizada' : 'Empresa cadastrada', payload.nome);
      adminConsoleAviso(editing ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.', 'success');
    } catch (error) {
      adminConsoleAviso('Falha ao salvar empresa: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
}

function adminConsoleNovoUsuario() {
  adminConsoleUsuarioModal(null, '');
}

function adminConsoleNovoUsuarioPara(empresaId) {
  adminConsoleUsuarioModal(null, empresaId || '');
}

function adminConsoleFiltrarPorEmpresa(empresaId) {
  var sel = document.getElementById('admin-user-company');
  if (sel) { sel.value = empresaId || ''; adminConsoleFiltrarUsuarios(true); }
  adminConsoleAbrir('users');
}

function adminConsoleEditarUsuario(userId) {
  var user = ADMIN_CONSOLE.users.find(function(item) { return String(item.id) === String(userId); });
  if (user) adminConsoleUsuarioModal(user, '');
}

async function adminConsoleExcluirUsuario(userId) {
  var user = ADMIN_CONSOLE.users.find(function(item) { return String(item.id) === String(userId); });
  if (!user) { adminConsoleAviso('Usuario nao encontrado.', 'error'); return; }
  var confirmed = window.confirm(
    'Excluir permanentemente ' + (user.nome || user.email || 'este usuario')
    + '?\n\nEsta acao nao pode ser desfeita. O acesso sera removido do banco de dados.'
  );
  if (!confirmed) return;
  try {
    await adminConsoleAction('admin-user-delete', { id: userId });
    adminConsoleTrackActivity('usuario', 'Usuario excluido', (user.nome || user.email) + ' - ' + user.papel);
    await adminConsoleAtualizar(true);
    adminConsoleAviso('Usuario excluido com sucesso.', 'success');
  } catch (error) {
    adminConsoleAviso('Falha ao excluir usuario: ' + error.message, 'error');
  }
}

function adminConsoleEntrarComo(userId) {
  var user = ADMIN_CONSOLE.users.find(function(item) { return String(item.id) === String(userId); });
  if (!user) { adminConsoleAviso('Usuario nao encontrado.', 'error'); return; }
  if (user.ativo === false) { adminConsoleAviso('Este usuario esta inativo.', 'error'); return; }
  if (!user.empresa_id) { adminConsoleAviso('Este usuario nao esta vinculado a uma empresa.', 'error'); return; }
  if (user.papel === 'admin') {
    // Usa a operacao existente que sincroniza EMPRESAS_ADMIN e abre view-app
    adminConsoleAbrirOperacao(user.empresa_id);
  } else if (user.papel === 'cliente') {
    // Popula ADMIN_PREVIEW_COMPANIES com dados do admin console para o preview
    if (typeof ADMIN_PREVIEW_COMPANIES !== 'undefined' && ADMIN_CONSOLE.companies.length) {
      ADMIN_PREVIEW_COMPANIES = ADMIN_CONSOLE.companies.map(function(c) {
        return {
          empresa_id: c.id || c.empresa_id,
          nome: c.nome || '',
          slug: c.slug || '',
          ativo: c.ativo !== false,
          tem_api: String(c.exibir_origem || '').toLowerCase() === 'api',
          logo_url: c.logo_url || null
        };
      });
    }
    if (typeof _abrirDashCliente === 'function') _abrirDashCliente(user.empresa_id);
  } else {
    adminConsoleAviso('Nao e possivel entrar como ' + (user.papel || 'este papel') + '.', 'error');
  }
}

function adminConsoleUsuarioModal(user, preEmpresaId) {
  var editing = !!user;
  var empresaValue = editing ? (user.empresa_id || '') : (preEmpresaId || '');
  var html = '<div class="admin-form-grid">'
    + '<label class="admin-field"><span>Nome completo</span><input name="nome" required maxlength="140" value="' + adminConsoleEscape(user && user.nome) + '"></label>'
    + '<label class="admin-field"><span>E-mail</span><input name="email" type="email" required value="' + adminConsoleEscape(user && user.email) + '"></label>'
    + '<label class="admin-field"><span>Nivel de acesso</span><select name="papel" onchange="adminConsoleAtualizarEscopoUsuario(this.form)">'
    + '<option value="cliente"' + (!user || user.papel === 'cliente' ? ' selected' : '') + '>Cliente</option>'
    + '<option value="admin"' + (user && user.papel === 'admin' ? ' selected' : '') + '>Admin da empresa</option>'
    + (!preEmpresaId || (user && user.papel === 'super_admin')
        ? '<option value="super_admin"' + (user && user.papel === 'super_admin' ? ' selected' : '') + '>Gerente geral — acesso a todas as empresas</option>'
        : '')
    + '</select><small class="admin-field-note">' + (preEmpresaId ? 'Gerente geral nao pode ser vinculado a uma empresa especifica.' : 'Gerente geral nao precisa de empresa — acessa tudo.') + '</small></label>'
    + '<label class="admin-field"><span>Empresa vinculada</span><select name="empresa_id">' + adminConsoleCompanyOptions(empresaValue, true) + '</select><small class="admin-field-note">Obrigatoria para cliente e admin.</small></label>'
    + '<label class="admin-field"><span>' + (editing ? 'Nova senha (opcional)' : 'Senha temporaria') + '</span><input name="password" type="password" ' + (editing ? '' : 'required') + ' minlength="8" autocomplete="new-password"></label>'
    + '<label class="admin-field admin-field-switch"><input name="ativo" type="checkbox"' + (!user || user.ativo !== false ? ' checked' : '') + '><span>Usuario ativo</span></label>'
    + (editing ? '<label class="admin-field admin-field-switch admin-field-full"><input name="confirmacao" type="checkbox" required><span>Confirmo a revisao do papel, empresa e status deste acesso</span></label>' : '')
    + '</div><div class="admin-form-help">A senha deve ter pelo menos 8 caracteres. Segredos nunca sao exibidos depois de salvos.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Cancelar</button><button class="admin-btn-primary" type="submit">' + (editing ? 'Salvar alteracoes' : 'Criar usuario') + '</button></div>';
  adminConsoleAbrirModal('USUARIOS E ACESSOS', editing ? 'Editar usuario' : 'Adicionar usuario', html, async function(data, form) {
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    var papel = String(data.get('papel') || 'cliente');
    var payload = {
      id: user ? user.id : null,
      nome: String(data.get('nome') || '').trim(),
      email: String(data.get('email') || '').trim().toLowerCase(),
      papel: papel,
      empresa_id: papel === 'super_admin' ? null : (String(data.get('empresa_id') || '') || null),
      password: String(data.get('password') || ''),
      ativo: data.get('ativo') === 'on'
    };
    try {
      if (payload.papel !== 'super_admin' && !payload.empresa_id) {
        throw new Error('Selecione a empresa vinculada para este nivel de acesso.');
      }
      var result = await adminConsoleAction(editing ? 'admin-user-update' : 'admin-user-create', payload);
      adminConsoleFecharModal();
      await adminConsoleAtualizar(true);
      adminConsoleTrackActivity('usuario', editing ? 'Usuario atualizado' : 'Usuario criado', payload.email + ' - ' + payload.papel);
      if (!editing && result && result.usuario && payload.papel !== 'super_admin') {
        var novoId = adminConsoleEscape(result.usuario.id);
        var novoNome = adminConsoleEscape(result.usuario.nome || payload.email);
        adminConsoleAviso(
          'Usuario <strong>' + novoNome + '</strong> criado. '
          + '<button onclick="adminConsoleEntrarComo(\'' + novoId + '\')" class="admin-notice-action">Entrar como ' + novoNome + ' →</button>',
          'success',
          true
        );
      } else {
        adminConsoleAviso(editing ? 'Usuario atualizado com sucesso.' : 'Usuario criado com sucesso.', 'success');
      }
    } catch (error) {
      adminConsoleAviso('Falha ao salvar usuario: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
  var modalForm = document.getElementById('admin-modal-form');
  adminConsoleAtualizarEscopoUsuario(modalForm);
}

function adminConsoleNovaIntegracao(companyId) {
  adminConsoleIntegracaoModal(null, companyId || '');
}

function adminConsoleEditarIntegracao(companyId) {
  var api = ADMIN_CONSOLE.integrations.find(function(item) {
    return String(item.empresa_id) === String(companyId);
  });
  if (api) adminConsoleIntegracaoModal(api, companyId);
}

function adminConsoleIntegracaoModal(api, companyId) {
  var editing = !!api;
  var selectedCompany = companyId || (api && api.empresa_id) || '';
  var companyField = editing
    ? '<label class="admin-field"><span>Empresa</span><input value="' + adminConsoleEscape(adminConsoleCompanyName(selectedCompany)) + '" disabled><input name="empresa_id" type="hidden" value="' + adminConsoleEscape(selectedCompany) + '"></label>'
    : '<label class="admin-field"><span>Empresa</span><select name="empresa_id" required>' + adminConsoleCompanyOptions(selectedCompany, false) + '</select></label>';
  var html = '<div class="admin-form-grid">'
    + companyField
    + (function() {
        var cur = api && api.sistema || 'visual_saef';
        var opts = [
          ['visual_saef', 'Visual Saef'],
          ['bling',       'Bling'],
          ['winthor',     'Winthor'],
          ['omie',        'Omie'],
          ['totvs',       'TOTVS']
        ].map(function(o) {
          return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('');
        return '<label class="admin-field"><span>Sistema</span><select name="sistema" required>' + opts + '</select></label>';
      }())
    + '<label class="admin-field admin-field-full"><span>URL da API</span><input name="api_url" type="url" required placeholder="https://api.seuservidor.com" value="' + adminConsoleEscape(api && api.api_url || '') + '"></label>'
    + '<label class="admin-field admin-field-switch"><input name="ativo" type="checkbox"' + (!api || api.ativo !== false ? ' checked' : '') + '><span>Integracao ativa</span></label>'
    + '</div><div class="admin-form-help">Client ID e Client Secret ficam protegidos nas variaveis de ambiente da Vercel. Este formulario nao recupera nem revela esses valores.</div>'
    + '<div class="admin-modal-actions"><button type="button" onclick="adminConsoleFecharModal()">Cancelar</button><button class="admin-btn-primary" type="submit">' + (editing ? 'Salvar configuracao' : 'Criar integracao') + '</button></div>';
  adminConsoleAbrirModal('INTEGRACOES', editing ? 'Editar integracao' : 'Nova integracao', html, async function(data, form) {
    var button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    var targetCompany = String(data.get('empresa_id') || '').trim();
    var payload = {
      empresa_id: targetCompany,
      sistema: String(data.get('sistema') || '').trim(),
      api_url: String(data.get('api_url') || '').trim().replace(/\/+$/, ''),
      ativo: data.get('ativo') === 'on'
    };
    try {
      if (!editing && ADMIN_CONSOLE.integrations.some(function(item) {
        return String(item.empresa_id) === targetCompany;
      })) {
        throw new Error('Esta empresa ja possui uma integracao cadastrada.');
      }
      await adminConsoleFetch(editing
        ? '/rest/v1/api_config?empresa_id=eq.' + encodeURIComponent(targetCompany)
        : '/rest/v1/api_config', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(payload)
      });
      adminConsoleFecharModal();
      await adminConsoleAtualizar(true);
      adminConsoleTrackActivity('integracao', editing ? 'Integracao atualizada' : 'Integracao criada', adminConsoleCompanyName(targetCompany) + ' - ' + payload.sistema);
      adminConsoleAviso(editing ? 'Integracao atualizada com sucesso.' : 'Integracao criada com sucesso.', 'success');
    } catch (error) {
      adminConsoleAviso('Falha ao atualizar integracao: ' + error.message, 'error');
      if (button) button.disabled = false;
    }
  });
}

async function adminConsoleTestarIntegracao(companyId, button) {
  var originalText = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Testando...';
  }
  var companyName = companyId ? adminConsoleCompanyName(companyId) : 'empresa';
  adminConsoleAviso('Testando comunicacao segura com ' + companyName + '...', 'info');
  try {
    var result = await adminConsoleAction('admin-integration-test', { empresa_id: companyId || null });
    adminConsoleTrackActivity('integracao', 'Teste de API concluido', result.mensagem || 'API respondeu corretamente');
    adminConsoleAviso(result.mensagem || 'Conexao validada com sucesso.', 'success');
  } catch (error) {
    adminConsoleTrackActivity('integracao', 'Falha no teste de API', error.message);
    adminConsoleAviso('Teste de conexao falhou: ' + error.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') adminConsoleFecharModal();
});

// ── SYNC DIRETO DO ADMIN CONSOLE ─────────────────────────────────────────────

function _adminConsoleSyncPopularEmpresas() {
  var host = document.getElementById('adm-sync-empresa-btns');
  if (!host) return;
  var companies = (ADMIN_CONSOLE.companies || []).filter(function(c) { return c.ativo !== false; });
  if (!companies.length) {
    host.innerHTML = '<div class="adm-sync-no-companies">Nenhuma empresa cadastrada.</div>';
    return;
  }
  host.innerHTML = companies.map(function(c) {
    var id = String(c.id || c.empresa_id || '');
    var hasApi = String(c.exibir_origem || '').toLowerCase() === 'api';
    return '<button class="adm-sync-empresa-btn' + (hasApi ? ' tem-api' : '') + '" '
      + 'onclick="_adminConsoleSyncSelecionarEmpresa(\'' + adminConsoleEscape(id) + '\')" '
      + 'data-empresa-id="' + adminConsoleEscape(id) + '">'
      + '<span class="adm-sync-btn-nome">' + adminConsoleEscape(c.nome || id) + '</span>'
      + (hasApi
          ? '<span class="adm-sync-api-badge">API</span>'
          : '<span class="adm-sync-sem-api-badge">Sem API</span>')
      + '</button>';
  }).join('');
}

function _adminConsoleSyncSelecionarEmpresa(empresaId) {
  var eid = String(empresaId || '');
  var empresa = (ADMIN_CONSOLE.companies || []).find(function(c) {
    return String(c.id || c.empresa_id) === eid;
  });
  if (!empresa) return;

  // Destaca botão ativo
  var btns = document.querySelectorAll('#adm-sync-empresa-btns .adm-sync-empresa-btn');
  btns.forEach(function(b) {
    b.classList.toggle('ativo', b.getAttribute('data-empresa-id') === eid);
  });

  var hasApi = String(empresa.exibir_origem || '').toLowerCase() === 'api';
  var integration = (ADMIN_CONSOLE.integrations || []).find(function(a) {
    return String(a.empresa_id) === eid && a.ativo !== false;
  });

  // Atualiza EMPRESA_ATIVA para que adminSincronizar funcione corretamente
  if (typeof EMPRESA_ATIVA !== 'undefined') {
    EMPRESA_ATIVA = {
      empresa_id: eid,
      nome: empresa.nome || 'Empresa',
      slug: empresa.slug || null,
      tem_api: hasApi,
      sistema: integration ? integration.sistema : null,
      api_url: integration ? (integration.api_url || '') : '',
      exibir_origem: empresa.exibir_origem || 'manual'
    };
  }

  var panel = document.getElementById('adm-sync-empresa-panel');
  var noApi = document.getElementById('adm-sync-no-api');
  var nomeDisplay = document.getElementById('adm-sync-empresa-nome-display');
  if (nomeDisplay) nomeDisplay.textContent = empresa.nome || eid;

  if (hasApi) {
    if (panel) panel.style.display = '';
    if (noApi) noApi.style.display = 'none';
    // Módulos em estado pendente imediato
    if (typeof _adminRenderApiModules === 'function') {
      _adminRenderApiModules({
        vendas:          { pending: true, count: 0, message: 'Histórico de vendas por período selecionado.' },
        clientes:        { pending: true, count: 0, message: 'Cadastros para enriquecer cidade, setor e ciclo.' },
        produtos:        { pending: true, count: 0, message: 'Cadastros para enriquecer grupo, marca e mix.' },
        representantes:  { pending: true, count: 0, message: 'Equipe comercial para cobertura regional.' }
      });
    }
    if (typeof _adminPreencherPeriodoSync === 'function') _adminPreencherPeriodoSync(eid);
    if (typeof _adminAutoSyncCarregarConfig === 'function') _adminAutoSyncCarregarConfig(eid);
    // Contagens reais do banco em background
    setTimeout(function() {
      if (typeof _adminCarregarCadastrosApiSalvos === 'function') _adminCarregarCadastrosApiSalvos();
    }, 400);
  } else {
    if (panel) panel.style.display = 'none';
    if (noApi) noApi.style.display = '';
  }
}

function adminConsoleAbrirSyncEmpresa(empresaId) {
  adminConsoleAbrir('sync');
  _adminConsoleSyncPopularEmpresas();

  // Auto-seleciona empresa: parâmetro > primeira API > primeira qualquer
  var eid = String(empresaId || '');
  if (!eid) {
    var firstApi = (ADMIN_CONSOLE.companies || []).find(function(c) {
      return c.ativo !== false && String(c.exibir_origem || '').toLowerCase() === 'api';
    });
    eid = firstApi ? String(firstApi.id || firstApi.empresa_id) : '';
  }
  if (!eid) {
    var firstAny = (ADMIN_CONSOLE.companies || []).find(function(c) { return c.ativo !== false; });
    eid = firstAny ? String(firstAny.id || firstAny.empresa_id) : '';
  }
  if (eid) setTimeout(function() { _adminConsoleSyncSelecionarEmpresa(eid); }, 50);
}

async function adminConsoleDispararSyncEmpresa(empresaId) {
  var eid = empresaId
    || (function(){ var s = document.getElementById('admin-sync-company'); return s && s.value; }())
    || '';
  if (!eid) { adminConsoleAviso('Selecione uma empresa para sincronizar.', 'error'); return; }

  var empresa = (ADMIN_CONSOLE.companies || []).find(function(c){
    return String(c.id || c.empresa_id) === String(eid);
  });
  if (!empresa) { adminConsoleAviso('Empresa nao encontrada no cache. Atualize a pagina.', 'error'); return; }

  var origem = String(empresa.exibir_origem || 'manual').toLowerCase();
  if (origem !== 'api') { adminConsoleAviso('Esta empresa nao tem API configurada (origem: ' + origem + ').', 'error'); return; }

  if (typeof EMPRESA_ATIVA === 'undefined') { adminConsoleAviso('Abra o painel de sincronizacao primeiro.', 'error'); return; }

  var integration = (ADMIN_CONSOLE.integrations || []).find(function(a){
    return String(a.empresa_id) === String(eid) && a.ativo !== false;
  });

  EMPRESA_ATIVA = {
    empresa_id: eid,
    nome: empresa.nome || 'Empresa',
    slug: empresa.slug || null,
    tem_api: true,
    sistema: integration ? integration.sistema : null,
    api_url: integration ? (integration.api_url || '') : '',
    exibir_origem: 'api'
  };

  if (typeof adminSincronizar !== 'function') {
    adminConsoleAviso('Funcao de sync nao disponivel. Abra o painel de sincronizacao primeiro.', 'error');
    return;
  }

  adminConsoleAviso('Sincronizando ' + (empresa.nome || 'empresa') + '...', 'info');
  try {
    await adminSincronizar();
    setTimeout(function(){ adminConsoleAtualizar(true); }, 2000);
  } catch(e) {
    adminConsoleAviso('Erro no sync: ' + e.message, 'error');
  }
}
