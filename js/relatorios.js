// =============================================================================
// RELATÓRIOS — Gerenciamento de abas e menus
// =============================================================================

document.querySelectorAll('.relatorio-menu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const menu = btn.dataset.menu;
    
    // Remove active de todos os botões
    document.querySelectorAll('.relatorio-menu-btn').forEach(b => {
      b.classList.remove('active');
    });
    
    // Remove active de todos os conteúdos
    document.querySelectorAll('.relatorio-content').forEach(c => {
      c.classList.remove('active');
    });
    
    // Marca como ativo
    btn.classList.add('active');
    document.querySelector(`.relatorio-content[data-menu="${menu}"]`).classList.add('active');
  });
});

document.querySelectorAll('.relatorio-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    const container = tab.closest('.relatorio-tabs-container');
    
    // Remove active de todos os tabs neste container
    container.querySelectorAll('.relatorio-tab').forEach(t => {
      t.classList.remove('active');
    });
    
    // Remove active de todos os conteúdos neste container
    container.querySelectorAll('.relatorio-tab-content').forEach(c => {
      c.classList.remove('active');
    });
    
    // Marca como ativo
    tab.classList.add('active');
    container.querySelector(`.relatorio-tab-content[data-tab="${tabName}"]`).classList.add('active');
  });
});