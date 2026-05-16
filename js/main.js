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
        nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeNav));
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav();
        });
    }
}

document.addEventListener('partials:ready', initHeaderBindings);

document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.faq-item');
    items.forEach(item => {
        item.addEventListener('toggle', () => {
            if (item.open) {
                items.forEach(other => {
                    if (other !== item) other.open = false;
                });
            }
        });
    });

    document.querySelectorAll('.news-slider').forEach(slider => {
        const row = slider.querySelector('.news-row');
        const prev = slider.querySelector('.news-arrow-prev');
        const next = slider.querySelector('.news-arrow-next');
        if (!row || !prev || !next) return;

        const updateArrows = () => {
            const max = row.scrollWidth - row.clientWidth;
            prev.hidden = row.scrollLeft <= 1;
            next.hidden = row.scrollLeft >= max - 1;
        };

        const step = () => row.clientWidth * 0.8;

        prev.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
        next.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));

        row.addEventListener('scroll', updateArrows, { passive: true });
        window.addEventListener('resize', updateArrows);
        updateArrows();
    });
});
