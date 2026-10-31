// Preferência visual compartilhada; não interfere na autenticação ou na API.
(() => {
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark';
  let preference;
  let button;
  try { preference = localStorage.getItem('tema'); } catch { /* Preferência do sistema. */ }
  if (!valid(preference)) preference = null;

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    if (button) {
      button.textContent = theme === 'dark' ? '☀️ Modo claro' : '🌙 Modo escuro';
      button.setAttribute('aria-label', theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }

  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', event => {
    if (event.key === 'tema' || event.key === null) {
      preference = valid(event.newValue) ? event.newValue : null;
      apply();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    button = document.createElement('button');
    button.id = 'alternar-tema';
    button.type = 'button';
    button.className = 'btn btn-outline btn-sm';
    button.addEventListener('click', () => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('tema', preference); } catch { /* Mantém a escolha nesta página. */ }
      apply();
    });
    const toolbar = document.querySelector('#topbar, .pub-header-inner nav');
    if (toolbar) {
      toolbar.append(button);
    } else {
      const controls = document.createElement('div');
      controls.className = 'auth-theme-controls';
      controls.append(button);
      document.querySelector('.auth-box, .auth-box-lg').prepend(controls);
    }
    apply();
  });
})();
