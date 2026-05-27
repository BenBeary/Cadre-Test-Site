/* Blog List — admin tool (read-only).
   Lists the HTML files in Announcements-Blogs/ on the configured branch.
   No edits / deletes / right-click — just a roster so the admin can see
   what already exists on the server.

   Loaded on tools/post-generator-admin.html after admin-tool-manager.js,
   AuthManager/github-api.js, and post-gen.js (escHtml). */

let blLoaded = false;
let blLoading = false;

async function blFetchBlogs() {
    const items = await ghFetch('GET', '/contents/Announcements-Blogs');
    if (!Array.isArray(items)) return [];
    return items
        .filter(function(it) { return it.type === 'file' && /\.html?$/i.test(it.name); })
        .map(function(it) { return { name: it.name, path: it.path, size: it.size }; })
        .sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function blRender(items) {
    const body = document.getElementById('blog-list-body');
    if (!body) return;
    if (!items || !items.length) {
        body.innerHTML = '<div class="blog-list-placeholder">No HTML files in Announcements-Blogs/.</div>';
        return;
    }
    body.innerHTML = '<ul class="blog-list-files">'
        + items.map(function(it) {
            return '<li class="blog-list-item" title="' + escHtml(it.path) + '">'
                 + '<span class="blog-list-icon">📄</span>'
                 + '<span class="blog-list-name">' + escHtml(it.name) + '</span>'
                 + '</li>';
        }).join('')
        + '</ul>';
}

async function blLoadAndRender() {
    const body = document.getElementById('blog-list-body');
    if (!body || blLoading) return;
    blLoading = true;
    body.innerHTML = '<div class="blog-list-placeholder">Loading…</div>';
    try {
        const items = await blFetchBlogs();
        blLoaded = true;
        blRender(items);
    } catch (err) {
        body.innerHTML = '<div class="blog-list-placeholder blog-list-error">'
                       + escHtml(err.message || String(err))
                       + '<br><br><button class="admin-tool-btn" id="bl-retry">Retry</button>'
                       + '</div>';
        const r = document.getElementById('bl-retry');
        if (r) r.addEventListener('click', function() { blLoaded = false; blLoadAndRender(); });
    } finally {
        blLoading = false;
    }
}

function blInit() {
    if (document.body.dataset.pageRole !== 'admin') return;

    AdminToolManager.register({
        id:      'blog-list',
        label:   '📄 Display Blog Files',
        panelId: 'blog-list-panel',
        order:   30,
        onOpen:  function() { if (!blLoaded) blLoadAndRender(); }
    });

    const close = document.getElementById('blog-list-close');
    if (close) close.addEventListener('click', function() { AdminToolManager.close('blog-list'); });

    const reload = document.getElementById('blog-list-reload');
    if (reload) reload.addEventListener('click', function() {
        if (blLoading) return;
        blLoaded = false;
        blLoadAndRender();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blInit);
} else {
    blInit();
}
