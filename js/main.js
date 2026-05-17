function initHeaderBindings() {
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }

    const nav = document.getElementById('site-nav');
    const toggle = document.querySelector('.nav-toggle');
    const close = document.querySelector('.nav-close');

    if (nav && toggle && close) {
        const openNav = () => {
            nav.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
        };
        const closeNav = () => {
            nav.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        };

        toggle.addEventListener('click', openNav);
        close.addEventListener('click', closeNav);
        nav.addEventListener('click', e => {
            if (e.target.closest('a')) closeNav();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav();
        });
    }
}

document.addEventListener('partials:ready', initHeaderBindings);

document.addEventListener('DOMContentLoaded', () => {
    const faqList = document.querySelector('.faq-list');
    if (!faqList) return;

    faqList.addEventListener('toggle', e => {
        const item = e.target.closest('.faq-item');
        if (!item || !item.open) return;
        faqList.querySelectorAll('.faq-item[open]').forEach(other => {
            if (other !== item) other.open = false;
        });
    }, true);
});
