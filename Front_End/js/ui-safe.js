// Dados externos entram como texto; ações recebem funções, nunca código em strings.
globalThis.UI = Object.freeze({
    el(tag, className = '', text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    },
    add(parent, ...children) {
        parent.append(...children.flat().filter(child => child !== null && child !== undefined && child !== false));
        return parent;
    },
    btn(label, className, handler, options = {}) {
        const button = UI.el('button', className, label);
        button.type = 'button';
        if (options.title) button.title = String(options.title);
        button.disabled = Boolean(options.disabled);
        button.addEventListener('click', handler);
        return button;
    },
    msg(container, text, {tableCols, className = 'text-center py-4 text-gray-500'} = {}) {
        const message = UI.el(tableCols ? 'td' : 'p', className, text);
        if (tableCols) {
            message.colSpan = tableCols;
            container.replaceChildren(UI.add(UI.el('tr'), message));
        } else {
            container.replaceChildren(message);
        }
        return message;
    },
    detail(label, value) {
        return UI.add(UI.el('div'), UI.el('dt', 'text-gray-500', label), UI.el('dd', 'font-semibold', value));
    }
});
