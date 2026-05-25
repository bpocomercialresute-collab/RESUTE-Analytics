// =============================================================================
// STATE — Estado global da aplicação
// =============================================================================

/** Estado principal do sistema de análise */
const state = {
  produtos: { raw: [], headers: [], sample: [], fileName: '' },
  pedidos:  { raw: [], headers: [], sample: [], fileName: '' },
  mapping: {
    pedidos:  {},
    produtos: {}
  },
  explicitIgnored: {
    pedidos:  new Set(),
    produtos: new Set()
  },
  gridView: {
    pedidos:  'all',
    produtos: 'all'
  },
  customNames:      {},
  unified:          [],
  filtered:         [],
  activeDimensions: [],
  activeFilters:    {},
  statusEnabled:    false   // Toggle global do recurso Status (desativado por padrão)
};

/** Instâncias ativas de gráficos Chart.js (para destruir antes de recriar) */
let graficos = {};
