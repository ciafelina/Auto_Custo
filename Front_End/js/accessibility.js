document.addEventListener('DOMContentLoaded', () => {
  const menu = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mob-overlay');
  const mobile = window.matchMedia('(max-width: 1024px)');
  if (menu && sidebar && overlay) {
    const main = document.getElementById('main');
    const menuItems = () => Array.from(sidebar.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]'))
      .filter(el => el.getClientRects().length);
    const setMenu = (open, restore = false) => {
      const wasOpen = sidebar.classList.contains('open');
      sidebar.classList.toggle('open', open);
      overlay.classList.toggle('show', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      sidebar.inert = mobile.matches && !open;
      if (main) main.inert = mobile.matches && open;
      if (open && !wasOpen) menuItems()[0]?.focus();
      if (restore) menu.focus();
    };
    menu.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
    overlay.addEventListener('click', () => setMenu(false, true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && sidebar.classList.contains('open')) setMenu(false, true);
      if (event.key === 'Tab' && mobile.matches && sidebar.classList.contains('open')) {
        const items = menuItems();
        if (!items.length) { event.preventDefault(); return; }
        const outside = !sidebar.contains(document.activeElement);
        if (event.shiftKey && (outside || document.activeElement === items[0])) {
          event.preventDefault(); items[items.length - 1].focus();
        } else if (!event.shiftKey && (outside || document.activeElement === items[items.length - 1])) {
          event.preventDefault(); items[0].focus();
        }
      }
    });
    mobile.addEventListener('change', () => setMenu(false));
    setMenu(false);
  }
  document.querySelectorAll('.table-wrap').forEach(wrap => {
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Tabela com rolagem horizontal');
  });
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    let previousFocus;
    const focusable = () => Array.from(modal.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(el => el.getClientRects().length);
    new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) {
        previousFocus = document.activeElement;
        const first = focusable()[0];
        if (first) first.focus();
      } else if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
        previousFocus = null;
      }
    }).observe(modal, { attributes:true, attributeFilter:['class'] });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        const close = modal.querySelector('.modal-close');
        if (close) close.click();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    });
  });
});
