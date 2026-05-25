// =============================================================================
// UPLOAD — Leitura de arquivos e processamento inicial
// =============================================================================

/** Lê um arquivo (CSV ou XLSX) e chama callback(data, fileName) */
function lerArquivo(file, callback) {
  if (!file) return;
  showLoader(true, 'Lendo arquivo…');
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      Papa.parse(text, {
        header: true, skipEmptyLines: 'greedy',
        delimiter: text.includes(';') ? ';' : ',',
        transformHeader: h => h ? h.trim().replace(/^"|"$/g, '') : '',
        complete: res => callback(res.data, file.name)
      });
    };
    reader.readAsText(file, 'windows-1252');
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        callback(data, file.name);
      } catch (err) {
        toast('Não foi possível ler o arquivo. Verifique o formato.', 'error');
        callback([], file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

/** Processa o arquivo carregado: atualiza state, roda auto-detecção, atualiza UI */
function processarArquivoCarregado(data, fileName, kind) {
  if (!data.length) {
    toast('Arquivo vazio ou formato não reconhecido', 'error');
    showLoader(false);
    return;
  }

  const headers = Object.keys(data[0]).filter(h => h && h.trim());
  const sample  = data.slice(0, 50);

  state[kind].raw      = data;
  state[kind].headers  = headers;
  state[kind].sample   = sample;
  state[kind].fileName = fileName;
  state.mapping[kind]         = {};
  state.explicitIgnored[kind] = new Set();
  state.gridView[kind]        = 'all';

  // Roda auto-detecção imediatamente
  const autoDetected = autoDetectarEAplicar(kind, false);

  // Atualiza a UI da zona de upload
  const zone = $(kind === 'pedidos' ? 'zonePed'  : 'zoneProd');
  const lbl  = $(kind === 'pedidos' ? 'lblPed'   : 'lblProd');
  const tag  = $(kind === 'pedidos' ? 'tagPed'   : 'tagProd');

  zone.classList.add('loaded');
  lbl.textContent  = `${fileName} · ${data.length.toLocaleString('pt-BR')} linhas · ${headers.length} colunas`;
  lbl.style.color  = 'var(--success)';
  tag.textContent  = 'Carregado';
  tag.className    = 'tag-tiny ok';

  updateUploadButtons();
  showLoader(false);

  const autoMsg = autoDetected > 0
    ? `${kind === 'pedidos' ? 'Pedidos' : 'Produtos'} carregados · ${autoDetected} coluna${autoDetected > 1 ? 's' : ''} identificada${autoDetected > 1 ? 's' : ''} automaticamente`
    : `${kind === 'pedidos' ? 'Pedidos' : 'Produtos'} carregados`;
  toast(autoMsg, 'success', 4500);
}

/** Habilita o botão "Avançar" apenas quando há dados de pedidos */
function updateUploadButtons() {
  $('btnGoMapping').disabled = state.pedidos.raw.length === 0;
}

// Event listeners dos inputs de arquivo
$('filePed').addEventListener('change', e => {
  lerArquivo(e.target.files[0], (data, name) => processarArquivoCarregado(data, name, 'pedidos'));
  e.target.value = '';
});
$('fileProd').addEventListener('change', e => {
  lerArquivo(e.target.files[0], (data, name) => processarArquivoCarregado(data, name, 'produtos'));
  e.target.value = '';
});
