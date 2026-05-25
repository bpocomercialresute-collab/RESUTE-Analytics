// =============================================================================
// CONSTANTS — Dicionários, roles, paletas e expressões regulares
// =============================================================================

/** Papéis disponíveis para mapeamento de colunas */
const ROLES = {
  IGNORAR: { label: 'Ignorar',               color: 'var(--text-tertiary)', unique: false },
  DATA:    { label: 'Data',                  color: 'var(--role-data)',     unique: true  },
  PEDIDO:  { label: 'Número do pedido',      color: 'var(--role-pedido)',   unique: true  },
  SKU:     { label: 'SKU / Código',          color: 'var(--role-sku)',      unique: true  },
  PRODUTO: { label: 'Nome do produto',       color: 'var(--role-produto)',  unique: true  },
  QTD:     { label: 'Quantidade',            color: 'var(--role-qtd)',      unique: true  },
  VALOR:   { label: 'Valor / Faturamento',   color: 'var(--role-valor)',    unique: true  },
  COR:     { label: 'Cor',                   color: 'var(--role-cor)',      unique: true  },
  TAMANHO: { label: 'Tamanho',               color: 'var(--role-tamanho)',  unique: true  },
  ESTAMPA: { label: 'Estampa / Variante',    color: 'var(--role-estampa)',  unique: true  },
  STATUS:  { label: 'Status / Situação',     color: 'var(--role-status)',   unique: true  },
  CUSTOM:  { label: 'Dimensão personalizada',color: 'var(--role-custom)',   unique: false }
};

/** Breadcrumb por view */
const BREADCRUMB = {
  'view-home':  'Início',
  'view-tools': 'Ferramentas',
  'view-app':   'Ferramentas › Análise de Vendas',
  'view-uniao': 'Ferramentas › União de Planilhas'
};

// ── Dicionário de cores (nome → hex) ──────────────────────────────────────────
const colorNameMap = {
  'PRETO':'#000000','BRANCO':'#f8fafc','OFF WHITE':'#f1f5f9','OFF-WHITE':'#f1f5f9',
  'AZUL MARINHO':'#1e3a8a','AZUL CLARO':'#7dd3fc','AZUL BEBE':'#bfdbfe','AZUL':'#3b82f6',
  'ROSA BEBE':'#fbcfe8','ROSA':'#f472b6','VERMELHO':'#ef4444','VERDE BANDEIRA':'#15803d',
  'VERDE LIMA':'#bef264','VERDE MUSGO':'#4d7c0f','VERDE MILITAR':'#4d7c0f',
  'VERDE ESMERALDA':'#047857','VERDE':'#10b981','AMARELO CANARIO':'#fef08a','AMARELO':'#facc15',
  'LILÁS':'#c084fc','LILAS':'#c084fc','ROXO':'#a855f7','BEGE':'#fef08a','NUDE':'#ffedd5',
  'CINZA':'#94a3b8','MESCLA':'#cbd5e1','BORDO':'#7f1d1d','BORDÔ':'#7f1d1d','VINHO':'#831843',
  'CARAMELO':'#d97706','CAQUI':'#b45309','CÁQUI':'#b45309','PINK':'#db2777','CHUMBO':'#334155',
  'AREIA':'#fef3c7','MOSTARDA':'#ca8a04','TERRACOTA':'#c2410c','LAVANDA':'#a78bfa',
  'MAGENTA':'#d946ef','SALMAO':'#fb923c','SALMÃO':'#fb923c','CORAL':'#f87171',
  'MARROM':'#5D4037','CAPUCCINO':'#8D6E63','MOCACCINO':'#8D6E63','CACAO':'#5D4037',
  'CACAU':'#5D4037','AVELA':'#D7CCC8','AVELÃ':'#D7CCC8','MILITAR':'#4d7c0f',
  'NATURAL':'#f5f5f4','BIC':'#1D4ED8','ARDOSIA':'#475569','LUAR':'#e2e8f0',
  'DOCE VITA':'#F48FB1','EXPRESSO':'#3E2723','INTENSO':'#b91c1c','ROSE':'#fda4af',
  'FUCSIA':'#d946ef','FÚCSIA':'#d946ef','FUSCIA':'#d946ef','TELHA':'#b45309',
  'CRU':'#f5f5f4','TIE DYE':'#a855f7','JEANS':'#3b82f6','NEON':'#a3e635',
  'PRATA':'#cbd5e1','DOURADO':'#fbbf24','CEREJA':'#9f1239','TIFFANY':'#2dd4bf',
  'TIFANY':'#2dd4bf','FERRUGEM':'#b45309','PIMENTA':'#b91c1c','UVA':'#7e22ce',
  'LIMAO':'#bef264','BRONZE':'#b45309','ESMERALDA':'#047857','CARMIM':'#9f1239',
  'GELO':'#e2e8f0','TURQUESA':'#06b6d4','RUBI':'#be123c','N/D':'#475569'
};

/** Abreviações de cor usadas em SKUs */
const skuAbbrMap = {
  'PRT':'PRETO','PTO':'PRETO','BCO':'BRANCO','BRC':'BRANCO','OFF':'OFF WHITE','OFW':'OFF WHITE',
  'MRN':'AZUL MARINHO','MAR':'AZUL MARINHO','VML':'VERMELHO','VRM':'VERMELHO',
  'AMR':'AMARELO','AML':'AMARELO','RS':'ROSA','ROS':'ROSA','AZL':'AZUL','AZU':'AZUL',
  'VRD':'VERDE','VDE':'VERDE','CIN':'CINZA','CNZ':'CINZA','BGE':'BEGE','MRR':'MARROM',
  'LIL':'LILÁS','ROX':'ROXO','VNH':'VINHO','VIN':'VINHO','PNK':'PINK','NUD':'NUDE','CRM':'CREME'
};

/** Paleta padrão para gráficos sem cor especificada */
const colorPalette = [
  '#c8102e','#0a1430','#1a2a5c','#e43550','#3b82f6','#10b981',
  '#f59e0b','#06b6d4','#8b5cf6','#f97316','#ec4899','#14b8a6',
  '#84cc16','#eab308','#0ea5e9'
];

// ── Expressões regulares pré-compiladas ───────────────────────────────────────
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const masterColors = Object.keys(colorNameMap).filter(k => k !== 'N/D').sort((a, b) => b.length - a.length);
const colorPattern  = masterColors.map(c => escapeRegExp(c)).join('|');
const MASTER_COLOR_REGEX = new RegExp(`(?:^|\\s|-|_|:|\\|)(${colorPattern})(?=$|\\s|-|_|:|\\|)`, 'i');

const SIZE_REGEX_GLOBAL = /(?:\s|-|_|:|\|)(PP|P|M|G|GG|XG|XGG|EXG|EG|G1|G2|G3|G4|G5|G6|U|UN|UNICO|UNICA|ÚNICO|ÚNICA|TM|34|36|38|40|42|44|46|48|50|52|54|56)(?:$|\s|-|_|:|\|)/i;
const TAMANHOS_UNICOS_SET = new Set(['U','UN','UNICO','UNICA','ÚNICA','ÚNICO','TM']);
const NUM_ONLY_REGEX      = /^[0-9]+$/;
const LIXO_TAMANHO_REGEX  = /(?:TAMANHO|TAM|COR)[:\s-]+/gi;
const SKU_CLEANER_REGEX   = /[-_.\s]?(PP|P|M|G|GG|XG|XGG|EXG|EG|G1|G2|G3|G4|G5|G6|U|UN|UNICA|UNICO|ÚNICA|ÚNICO|TM|[0-9]{2})$/i;
const TAIL_CLEAN_REGEX    = /[-_.\s]+$/;

// ── Palavras-chave de header por papel (auto-detecção) ────────────────────────
const HEADER_HINTS = {
  DATA: [
    'DATA','DT','CRIADOEM','CREATEDAT','DATAPEDIDO','DATADOPEDIDO','DATAVENDA',
    'DATAEMISSAO','EMISSAO','PEDIDOEM','ORDERDATE','DATE','DATACRIACAO',
    'DATAREGISTRO','DATACOMPRA','DATAFATURAMENTO','DATACONFIRMACAO',
    'DTPEDIDO','DTVENDA','DTEMISSAO','DTCRIACAO','DATAHORA','TIMESTAMP',
    'DATACADASTRO','DATAINCLUSAO','CREATED','UPDATEDAT','INSERTDATE',
    'DATAAPROVACAO','DATAENTREGA','DATAFECHAMENTO','DATAAUTORIZACAO'
  ],
  PEDIDO: [
    'NUMEROPEDIDO','PEDIDO','NUMPEDIDO','NPEDIDO','NROPEDIDO','NUMERODOPEDIDO',
    'ORDER','ORDERID','ORDERNUMBER','IDPEDIDO','CODPEDIDO','CODIGOPEDIDO',
    'NF','NOTAFISCAL','NUMERONOTA','INVOICE',
    'PEDIDONUMERO','NUMERO','NUMVENDA','VENDAID','IDVENDA','CODVENDA',
    'NFNUMERO','NNF','NROVENDA','NROINVOICE','ORDERCODE','PONUMBER',
    'PO','VENDA','OPNUMERO','OP','NROPO','CODOP'
  ],
  SKU: [
    'SKU','CODIGO','COD','CODPRODUTO','CODIGODOPRODUTO','REFERENCIA','REF',
    'IDPRODUTO','PRODUCTID','PRODUCTCODE','EAN','GTIN','CODBARRA','CODIGOBARRA',
    'REFERENCE','CODERRO','CODINTERNO','CODIGOINTERNO','CODITEM','CODIGOITEM',
    'ITEMID','ITEMCODE','PARTNUMBER','CODEAN','BARCODE','PROD','PRODCOD',
    'CODPROD','CODREF','SKUPRODUTO','CODFABRICA','MODELO'
  ],
  PRODUTO: [
    'PRODUTO','NOME','NOMEPRODUTO','DESCRICAO','DESCRICAODOPRODUTO',
    'DESCRICAOCOMPLEMENTAR','TITULO','ITEM','NOMEDOPRODUTO','PRODUCT',
    'PRODUCTNAME','TITLE','DESCRICAOITEM','PRODNOME','NOMEITEM',
    'DESCPROD','DESCRICAOPRODUTO','DESC','DESCRIPTION','NOMECOMERCIAL',
    'DENOMINACAO','ARTIGO','MERCADORIA','MATERIAL','DESCITEM'
  ],
  QTD: [
    'QUANTIDADE','QTD','QTDE','QT','QUANT','QTDVENDIDA','QTDITEM','QUANTITY',
    'QTY','VOLUME','UNIDADES','QTDPRODUTO','QTDVENDA','QTDEPEDIDO','QTDEVENDIDA',
    'VOLPEDIDO','UNIDADESVENDIDAS','QTDITENS','QUANTVENDIDA','QUANTIDADEVENDIDA',
    'PECAS','NUNIDADES','NRITENS'
  ],
  VALOR: [
    'VALORTOTAL','VLTOTAL','TOTAL','FATURAMENTO','TOTALPEDIDO','VALORBRUTO',
    'VALORLIQUIDO','VALORVENDA','SUBTOTAL','VALOR','VL','PRECO','PRECOTOTAL',
    'VALORFINAL','TOTALGERAL','VALORPAGO','PRICE','TOTALPRICE','AMOUNT',
    'VLVENDA','VENDATOTAL','VALORVENDIDO','TOTALVENDIDO','PRECOVENDA',
    'PRECOUNITARIO','VALORUNITARIO','VLUNIT','VUNIT','TOTALVLR','MONTANTE',
    'RECEITA','FATURADO','TOTALFATURADO','VLRBRUTO','VLRLIQUIDO','REVENUE',
    'NETREVENUE','GROSSREVENUE','SALES','VALORPEDIDO','VLPEDIDO'
  ],
  COR: [
    'COR','CORES','COLOR','COLORS','CORPRODUTO','CORDOPRODUTO','CORITEM',
    'CORPRINCIPAL','PRODUTOCOR','NOMECOR'
  ],
  TAMANHO: [
    'TAMANHO','TAM','SIZE','TAMANHOPRODUTO','MEDIDA','NUMERACAO',
    'TAMANHOITEM','TAMPRODUTO','TAMANHOS','TAMSELECIONADO','SIZES'
  ],
  ESTAMPA: [
    'ESTAMPA','VARIANTE','VARIATION','MODELO','ESTILO','PRINT','ARTE',
    'DESENHO','ESTAMPAS','TEMA','COLECAO','SERIE'
  ],
  STATUS: [
    'STATUS','SITUACAO','FASE','STATUSDOPEDIDO','STATUSPEDIDO','ETAPA',
    'OP','ESTADO','STATUSENTREGA','SITUACAOPEDIDO','STATUSVENDA',
    'SITUACAOVENDA','STAGE','STATE','CONDITION','STATUSATUAL',
    'ANDAMENTO','PROGRESSO','STATUSOPERACIONAL'
  ]
};
