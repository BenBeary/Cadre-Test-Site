// ─── Constants ────────────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
    { value: 'bluesky',   label: 'Bluesky',         icon: 'icon-bluesky' },
    { value: 'discord',   label: 'Discord',         icon: 'icon-discord' },
    { value: 'facebook',  label: 'Facebook',        icon: 'icon-facebook' },
    { value: 'instagram', label: 'Instagram',       icon: 'icon-instagram' },
    { value: 'itchdotio', label: 'Itch.io',         icon: 'icon-itchdotio' },
    { value: 'linkedin',  label: 'LinkedIn',        icon: 'icon-linkedin' },
    { value: 'linktree',  label: 'Linktree',        icon: 'icon-linktree' },
    { value: 'x',         label: 'X / Twitter',     icon: 'icon-x' },
    { value: 'youtube',   label: 'YouTube',         icon: 'icon-youtube' },
    { value: 'other',     label: 'Website / Other', icon: 'icon-link' }
];

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
    templateId: null,
    settings: { isEvent: false, hasSlideshowCss: false },
    blocks: [],          // paragraph | image | youtube-inline | slideshow, each may have col: 'A'|'B'
    contributors: [],    // [{name, photo, socials:[{platform,url}]}]
    showContributors: false,
    pendingTemplate: null,
};

let templates = [];
let baseTemplate = null;
let filenameAutoFill = true;

// ─── Utilities ────────────────────────────────────────────────────────────────

function escJson(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDisplayDate(val) {
    if (!val) return '';
    const [y, m, d] = val.split('-').map(Number);
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    return months[m - 1] + ' ' + d + ', ' + y;
}

function formatJsonDate(val) {
    if (!val) return '';
    const [y, m, d] = val.split('-');
    return m + '-' + d + '-' + y;
}

function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 60) || '';
}

function extractYouTubeId(url) {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
}

function copyToClipboard(text, btn) {
    const orig = btn.textContent;
    function done() { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = orig; }, 2000); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() { execCopy(text, done); });
    } else {
        execCopy(text, done);
    }
}

function execCopy(text, cb) {
    const el = document.createElement('textarea');
    el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(el);
    if (cb) cb();
}

function getVal(id) { return (document.getElementById(id) || {}).value || ''; }

function hasBlocks() { return state.blocks.length > 0 || state.contributors.length > 0; }

function getFilename() {
    const raw = getVal('f-filename').trim();
    const slug = slugify(raw);
    return (slug || 'untitled-blog-post') + '.html';
}

// ─── Base Template ────────────────────────────────────────────────────────────

function getBuiltinBaseTemplate() {
    const so = '<' + 'script', sc = '</' + 'script>';
    return '<!DOCTYPE html>\n'
        + '<html lang="en">\n'
        + '<head>\n'
        + '    <meta charset="UTF-8">\n'
        + '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        + '    <title>{{PAGE_TITLE}} - CADRE Alumni</title>\n'
        + '    <link rel="preconnect" href="https://fonts.googleapis.com">\n'
        + '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        + '    <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
        + '    <link rel="stylesheet" href="../css/style.css">\n'
        + '    <link rel="stylesheet" href="../css/blog-style.css">{{SLIDESHOW_CSS}}\n'
        + '    ' + so + '>\n'
        + '        (function () {\n'
        + '            var stored = localStorage.getItem(\'theme\');\n'
        + '            document.documentElement.setAttribute(\'data-theme\', stored || \'dark\');\n'
        + '        })();\n'
        + '    ' + sc + '\n'
        + '</head>\n'
        + '<body data-page="events" data-root="../">\n'
        + '    <div class="bg-squares bg-squares-left" aria-hidden="true"></div>\n'
        + '    <div class="bg-squares bg-squares-right" aria-hidden="true"></div>\n\n'
        + '    <div id="site-header"></div>\n\n'
        + '    <main>\n'
        + '        <section class="blog-section">\n'
        + '            <div class="blog-inner">\n'
        + '                <header class="blog-header">\n'
        + '                    <h1>{{POST_TITLE}}</h1>\n'
        + '                    <div class="blog-meta">\n'
        + '                        <span class="blog-meta-row"><span class="blog-meta-label">Date:</span><span class="blog-meta-value">{{POST_DATE}}</span></span>\n'
        + '                        <span class="blog-meta-row"><span class="blog-meta-label">Written by:</span><span class="blog-meta-value">{{POST_AUTHOR}}</span></span>\n'
        + '                    </div>\n'
        + '                </header>{{POST_CONTENT}}\n\n'
        + '            </div>\n'
        + '        </section>\n'
        + '    </main>\n\n'
        + '    <div id="site-footer"></div>\n\n'
        + '    ' + so + ' src="../js/partials.js">' + sc + '\n'
        + '    ' + so + ' src="../js/bg-squares.js">' + sc + '\n'
        + '    ' + so + ' src="../js/image-modal.js">' + sc + '{{SLIDESHOW_JS}}\n'
        + '    ' + so + ' src="../js/main.js">' + sc + '\n'
        + '</body>\n'
        + '</html>';
}

function loadBaseTemplate() {
    fetch('../Announcements-Blogs/base-template.html')
        .then(function(r) { return r.text(); })
        .then(function(text) { baseTemplate = stripLiveServerInjection(text); })
        .catch(function() { baseTemplate = getBuiltinBaseTemplate(); });
}

function stripLiveServerInjection(html) {
    return html.replace(/\s*<!-- Code injected by live-server -->[\s\S]*?<\/script>\s*/gi, '\n');
}

// ─── Template Loading ──────────────────────────────────────────────────────────

function getBuiltinTemplates() {
    return [
        { id: 'blank', name: 'Blank', icon: '📄', desc: 'Start fresh with no pre-filled blocks.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: false },
          blocks: [], contributors: [] },

        { id: 'basic', name: 'Basic Blog Post', icon: '✍️', desc: 'Title, author, paragraphs, and images.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: false },
          blocks: [ {type:'paragraph',text:''}, {type:'image',url:'',alt:'',caption:''}, {type:'paragraph',text:''} ],
          contributors: [] },

        { id: 'event', name: 'Event Post', icon: '📅', desc: 'Same as a blog post, for event announcements.',
          settings: { isEvent: true, hasSlideshowCss: false, showContributors: false },
          blocks: [ {type:'paragraph',text:''}, {type:'image',url:'',alt:'',caption:''}, {type:'paragraph',text:''} ],
          contributors: [] },

        { id: 'youtube', name: 'YouTube Video', icon: '▶️', desc: 'YouTube video at the top, then text below.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: false },
          blocks: [ {type:'youtube-inline',url:''}, {type:'paragraph',text:''} ],
          contributors: [] },

        { id: 'contributors', name: 'Blog + Contributors', icon: '👥', desc: 'Blog content with a contributor sidebar.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: true },
          blocks: [ {type:'paragraph',text:''}, {type:'image',url:'',alt:'',caption:''}, {type:'paragraph',text:''} ],
          contributors: [ {name:'',photo:'',socials:[]} ] },

        { id: 'yt-people', name: 'YouTube + Contributors', icon: '🎬', desc: 'YouTube header and a contributor sidebar.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: true },
          blocks: [ {type:'paragraph',text:''}, {type:'youtube-inline',url:''}, {type:'paragraph',text:''} ],
          contributors: [ {name:'',photo:'',socials:[]} ] },

        { id: 'two-col', name: 'Two-Column Layout', icon: '🗂️', desc: 'Alternating rows of text and image.',
          settings: { isEvent: false, hasSlideshowCss: false, showContributors: false },
          blocks: [
              {type:'paragraph',text:'',col:'A'}, {type:'image',url:'',alt:'',caption:'',col:'B'},
              {type:'paragraph',text:'',col:'A'}, {type:'image',url:'',alt:'',caption:'',col:'B'}
          ],
          contributors: [] },

        { id: 'slideshow', name: 'Slideshow Post', icon: '🖼️', desc: 'Blog post with an image slideshow carousel.',
          settings: { isEvent: false, hasSlideshowCss: true, showContributors: false },
          blocks: [ {type:'paragraph',text:''}, {type:'slideshow',slides:[{url:'',alt:''},{url:'',alt:''}]}, {type:'paragraph',text:''} ],
          contributors: [] }
    ];
}

function loadTemplates() {
    fetch('json/template-data.json')
        .then(function(r) { return r.json(); })
        .then(function(data) { templates = data.templates || getBuiltinTemplates(); renderTemplateNav(); applyTemplate('blank'); })
        .catch(function() { templates = getBuiltinTemplates(); renderTemplateNav(); applyTemplate('blank'); });
}

function renderTemplateNav() {
    const nav = document.getElementById('template-nav');
    let html = '';
    templates.forEach(function(tpl) {
        const sel = tpl.id === state.templateId ? ' selected' : '';
        html += '<button class="tpl-btn' + sel + '" data-tpl-id="' + tpl.id + '">'
            + '<span class="tpl-icon">' + tpl.icon + '</span>'
            + '<span class="tpl-info"><span class="tpl-name">' + escHtml(tpl.name) + '</span>'
            + '<span class="tpl-desc">' + escHtml(tpl.desc) + '</span></span></button>';
    });
    nav.innerHTML = html;
}

// ─── Template Selection ────────────────────────────────────────────────────────

document.getElementById('template-nav').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-tpl-id]');
    if (!btn) return;
    const tplId = btn.dataset.tplId;
    if (tplId === state.templateId) return;
    if (hasBlocks()) { state.pendingTemplate = tplId; showModal(); }
    else { applyTemplate(tplId); }
});

function applyTemplate(tplId) {
    const tpl = templates.find(function(t) { return t.id === tplId; });
    if (!tpl) return;
    state.templateId = tplId;
    state.settings = Object.assign({ isEvent: false, hasSlideshowCss: false, showContributors: false }, tpl.settings);
    state.blocks = JSON.parse(JSON.stringify(tpl.blocks || []));
    state.contributors = JSON.parse(JSON.stringify(tpl.contributors || []));
    state.showContributors = !!tpl.settings.showContributors;
    filenameAutoFill = true;
    updateDetailsFields();
    updateContribSidebarVisibility();
    renderTemplateNav();
    renderContentBuilder();
    if (state.showContributors) renderContribSidebar();
    updateSaveButtonState();
}

function updateDetailsFields() {
    document.getElementById('field-end-date').style.display = state.settings.isEvent ? '' : 'none';
}

// ─── Contributors Sidebar (editor) ───────────────────────────────────────────

function updateContribSidebarVisibility() {
    const sidebar = document.getElementById('contrib-sidebar');
    const btn     = document.getElementById('btn-contrib-toggle');
    const row     = document.getElementById('content-contrib-row');
    sidebar.style.display = state.showContributors ? '' : 'none';
    btn.classList.toggle('active', state.showContributors);
    row.classList.toggle('contrib-open', state.showContributors);
}

function updateSaveButtonState() {
    const btn = document.getElementById('btn-save-layout');
    btn.disabled = !hasBlocks();
}

function renderContribSidebar() {
    const sidebar = document.getElementById('contrib-sidebar');
    let html = '<div class="contrib-sidebar-title">Contributors Sidebar</div>';
    state.contributors.forEach(function(c, i) { html += renderContributor(c, i); });
    html += '<div class="add-block-bar" style="margin-top:8px"><button class="btn-add" id="btn-add-contrib" style="width:100%">+ Add Contributor</button></div>';
    sidebar.innerHTML = html;
    updateSaveButtonState();
}

function renderContributor(c, i) {
    const isFirst = i === 0, isLast = i === state.contributors.length - 1;
    const socialsHtml = (c.socials || []).map(function(s, si) {
        const opts = SOCIAL_PLATFORMS.map(function(p) {
            return '<option value="' + p.value + '"' + (s.platform === p.value ? ' selected' : '') + '>' + p.label + '</option>';
        }).join('');
        return '<div class="social-item" data-social-idx="' + si + '">'
            + '<select data-sf="platform">' + opts + '</select>'
            + '<input type="url" data-sf="url" value="' + escHtml(s.url) + '" placeholder="URL…">'
            + '<button class="btn-icon danger" data-remove-social="' + si + '" title="Remove">✕</button>'
            + '</div>';
    }).join('');

    return '<div class="contrib-item" data-contrib-idx="' + i + '">'
        + '<div class="contrib-item-header">Contributor ' + (i + 1)
        + '<div class="controls">'
        + '<button class="btn-icon" data-contrib-up="' + i + '"' + (isFirst ? ' disabled' : '') + '>↑</button>'
        + '<button class="btn-icon" data-contrib-down="' + i + '"' + (isLast ? ' disabled' : '') + '>↓</button>'
        + '<button class="btn-icon danger" data-contrib-remove="' + i + '">✕</button>'
        + '</div></div>'
        + '<div class="contrib-item-body">'
        + '<div class="field"><label>Name</label><input type="text" data-cf="name" value="' + escHtml(c.name) + '" placeholder="Full name"></div>'
        + '<div class="field"><label>Photo Path</label><input type="text" data-cf="photo" value="' + escHtml(c.photo) + '" placeholder="images/people/jane.jpg"></div>'
        + '<div class="field"><label>Social Links</label>'
        + '<div class="social-list">' + socialsHtml + '</div>'
        + '<button class="btn-add" data-add-social="' + i + '" style="margin-top:6px;width:100%;font-size:12px;padding:5px 10px">+ Add Social</button>'
        + '</div>'
        + '</div></div>';
}

function syncContributorsFromDOM() {
    document.querySelectorAll('[data-contrib-idx]').forEach(function(el) {
        const i = Number(el.dataset.contribIdx);
        const c = state.contributors[i];
        if (!c) return;
        const nameInp = el.querySelector('[data-cf="name"]');
        if (nameInp) c.name = nameInp.value;
        const photoInp = el.querySelector('[data-cf="photo"]');
        if (photoInp) c.photo = photoInp.value;
        c.socials = [];
        el.querySelectorAll('[data-social-idx]').forEach(function(sEl) {
            const platform = (sEl.querySelector('[data-sf="platform"]') || {}).value || 'other';
            const url = (sEl.querySelector('[data-sf="url"]') || {}).value || '';
            c.socials.push({ platform: platform, url: url });
        });
    });
}

// ─── Content Builder ──────────────────────────────────────────────────────────

function renderContentBuilder() {
    const el = document.getElementById('content-builder');
    if (!state.templateId) {
        el.innerHTML = '<div class="placeholder-prompt">Select a template on the left to start writing.</div>';
        return;
    }

    let html = '<div class="block-list" id="block-list">';
    state.blocks.forEach(function(b, i) { html += renderBlock(b, i); });
    html += '</div>';

    html += '<div class="add-block-bar">'
        + '<button class="btn-add" data-add="paragraph">+ Paragraph</button>'
        + '<button class="btn-add" data-add="image">+ Image</button>'
        + '<button class="btn-add" data-add="youtube-inline">+ YouTube Embed</button>'
        + '<button class="btn-add" data-add="slideshow">+ Slideshow</button>'
        + '</div>';

    el.innerHTML = html;
    updateSaveButtonState();
}

function renderBlock(b, i) {
    const isFirst = i === 0, isLast = i === state.blocks.length - 1;

    // Two-column buttons: A and B, each independently toggleable
    const colAClass = 'btn-icon btn-col-toggle' + (b.col === 'A' ? ' col-active-a' : '');
    const colBClass = 'btn-icon btn-col-toggle' + (b.col === 'B' ? ' col-active-b' : '');
    const colBadge  = b.col ? '<span class="col-badge col-' + b.col.toLowerCase() + '">Col ' + b.col + '</span>' : '';

    let badge = '', bodyHtml = '';

    if (b.type === 'paragraph') {
        badge = '<span class="block-type-badge">Paragraph</span>';
        bodyHtml = '<textarea data-field="text" rows="4" placeholder="Write your paragraph here...">' + escHtml(b.text) + '</textarea>';

    } else if (b.type === 'image') {
        badge = '<span class="block-type-badge type-image">Image</span>';
        bodyHtml = '<div class="field">'
            + '<label>Image Path</label>'
            + '<input type="text" data-field="url" value="' + escHtml(b.url) + '" placeholder="e.g. images/events/my-photo.jpg">'
            + '<div class="field-hint">Path is relative to the site root. Leave blank to use the placeholder image.</div>'
            + '</div>'
            + '<div class="field-grid">'
            + '<div class="field"><label>Alt Text</label><input type="text" data-field="alt" value="' + escHtml(b.alt) + '" placeholder="Brief description"></div>'
            + '<div class="field"><label>Caption (optional)</label><input type="text" data-field="caption" value="' + escHtml(b.caption) + '" placeholder="Caption below image"></div>'
            + '</div>';

    } else if (b.type === 'youtube-inline') {
        badge = '<span class="block-type-badge type-youtube">YouTube Embed</span>';
        bodyHtml = '<div class="field"><label>YouTube URL</label>'
            + '<input type="url" data-field="url" value="' + escHtml(b.url) + '" placeholder="https://www.youtube.com/watch?v=...">'
            + '</div>';

    } else if (b.type === 'slideshow') {
        badge = '<span class="block-type-badge type-slideshow">Slideshow</span>';
        let slidesHtml = '<div class="slide-list" id="slide-list-' + i + '">';
        (b.slides || []).forEach(function(s, si) {
            slidesHtml += '<div class="slide-item" data-slide-idx="' + si + '">'
                + '<div class="slide-num">' + (si + 1) + '</div>'
                + '<input type="text" data-slide-url="' + si + '" value="' + escHtml(s.url) + '" placeholder="Image path…" style="flex:2">'
                + '<input type="text" data-slide-alt="' + si + '" value="' + escHtml(s.alt) + '" placeholder="Alt text" style="flex:1">'
                + '<button class="btn-icon danger" data-remove-slide="' + si + '" title="Remove">✕</button>'
                + '</div>';
        });
        slidesHtml += '</div><div class="add-block-bar"><button class="btn-add" data-add-slide="' + i + '">+ Add Slide</button></div>';
        bodyHtml = slidesHtml;
    }

    return '<div class="block-item" data-block-idx="' + i + '">'
        + '<div class="block-header">' + badge + colBadge
        + '<div class="block-controls">'
        + '<button class="' + colAClass + '" data-set-col-a="' + i + '" title="Assign to Column A">A</button>'
        + '<button class="' + colBClass + '" data-set-col-b="' + i + '" title="Assign to Column B">B</button>'
        + '<button class="btn-icon" data-move-up="' + i + '" title="Move up"' + (isFirst ? ' disabled' : '') + '>↑</button>'
        + '<button class="btn-icon" data-move-down="' + i + '" title="Move down"' + (isLast ? ' disabled' : '') + '>↓</button>'
        + '<button class="btn-icon danger" data-remove-block="' + i + '" title="Remove">✕</button>'
        + '</div></div>'
        + '<div class="block-body">' + bodyHtml + '</div>'
        + '</div>';
}

// ─── DOM → State Sync ─────────────────────────────────────────────────────────

function syncBlocksFromDOM() {
    document.querySelectorAll('[data-block-idx]').forEach(function(blockEl) {
        const i = Number(blockEl.dataset.blockIdx);
        const b = state.blocks[i];
        if (!b) return;
        if (b.type === 'paragraph') {
            const ta = blockEl.querySelector('[data-field="text"]');
            if (ta) b.text = ta.value;
        } else if (b.type === 'image') {
            ['url','alt','caption'].forEach(function(f) { const el = blockEl.querySelector('[data-field="' + f + '"]'); if (el) b[f] = el.value; });
        } else if (b.type === 'youtube-inline') {
            const el = blockEl.querySelector('[data-field="url"]'); if (el) b.url = el.value;
        } else if (b.type === 'slideshow') {
            blockEl.querySelectorAll('[data-slide-url]').forEach(function(el) { b.slides[Number(el.dataset.slideUrl)].url = el.value; });
            blockEl.querySelectorAll('[data-slide-alt]').forEach(function(el) { b.slides[Number(el.dataset.slideAlt)].alt = el.value; });
        }
    });
}

// ─── Event Handling (single attach — fixes multi-copy bug) ───────────────────

function initEvents() {
    const builder = document.getElementById('content-builder');

    builder.addEventListener('click', function(e) {
        // Add block
        const addBtn = e.target.closest('[data-add]');
        if (addBtn && !addBtn.hasAttribute('data-add-slide')) {
            const type = addBtn.dataset.add;
            const defaults = {
                'paragraph':      { type: 'paragraph', text: '' },
                'image':          { type: 'image', url: '', alt: '', caption: '' },
                'youtube-inline': { type: 'youtube-inline', url: '' },
                'slideshow':      { type: 'slideshow', slides: [{ url: '', alt: '' }] }
            };
            const newBlock = defaults[type];
            if (newBlock) { syncBlocksFromDOM(); state.blocks.push(JSON.parse(JSON.stringify(newBlock))); renderContentBuilder(); }
            return;
        }

        // Remove block
        const removeBtn = e.target.closest('[data-remove-block]');
        if (removeBtn) {
            syncBlocksFromDOM();
            state.blocks.splice(Number(removeBtn.dataset.removeBlock), 1);
            renderContentBuilder(); return;
        }

        // Move up
        const upBtn = e.target.closest('[data-move-up]');
        if (upBtn) {
            const n = Number(upBtn.dataset.moveUp);
            if (n > 0) { syncBlocksFromDOM(); const t = state.blocks[n-1]; state.blocks[n-1] = state.blocks[n]; state.blocks[n] = t; renderContentBuilder(); }
            return;
        }

        // Move down
        const downBtn = e.target.closest('[data-move-down]');
        if (downBtn) {
            const n = Number(downBtn.dataset.moveDown);
            if (n < state.blocks.length - 1) { syncBlocksFromDOM(); const t = state.blocks[n+1]; state.blocks[n+1] = state.blocks[n]; state.blocks[n] = t; renderContentBuilder(); }
            return;
        }

        // Column A toggle (click to assign; click again to unassign)
        const colABtn = e.target.closest('[data-set-col-a]');
        if (colABtn) {
            syncBlocksFromDOM();
            const n = Number(colABtn.dataset.setColA);
            state.blocks[n].col = state.blocks[n].col === 'A' ? null : 'A';
            renderContentBuilder(); return;
        }

        // Column B toggle
        const colBBtn = e.target.closest('[data-set-col-b]');
        if (colBBtn) {
            syncBlocksFromDOM();
            const n = Number(colBBtn.dataset.setColB);
            state.blocks[n].col = state.blocks[n].col === 'B' ? null : 'B';
            renderContentBuilder(); return;
        }

        // Add slide inside slideshow block
        const addSlideBtn = e.target.closest('[data-add-slide]');
        if (addSlideBtn) {
            syncBlocksFromDOM();
            state.blocks[Number(addSlideBtn.dataset.addSlide)].slides.push({ url: '', alt: '' });
            renderContentBuilder(); return;
        }

        // Remove slide
        const removeSlideBtn = e.target.closest('[data-remove-slide]');
        if (removeSlideBtn) {
            syncBlocksFromDOM();
            const blockEl = removeSlideBtn.closest('[data-block-idx]');
            const blockIdx = Number(blockEl.dataset.blockIdx);
            state.blocks[blockIdx].slides.splice(Number(removeSlideBtn.dataset.removeSlide), 1);
            if (state.blocks[blockIdx].slides.length === 0) state.blocks[blockIdx].slides.push({ url: '', alt: '' });
            renderContentBuilder(); return;
        }
    });
}

function initContribEvents() {
    // Contributors sidebar toggle
    document.getElementById('btn-contrib-toggle').addEventListener('click', function() {
        syncContributorsFromDOM();
        state.showContributors = !state.showContributors;
        updateContribSidebarVisibility();
        if (state.showContributors) renderContribSidebar();
    });

    // All contributor sidebar interactions
    document.getElementById('contrib-sidebar').addEventListener('click', function(e) {
        // Add contributor
        if (e.target.id === 'btn-add-contrib') {
            syncContributorsFromDOM();
            state.contributors.push({ name: '', photo: '', socials: [] });
            renderContribSidebar(); return;
        }
        // Move up
        const upBtn = e.target.closest('[data-contrib-up]');
        if (upBtn) {
            const n = Number(upBtn.dataset.contribUp);
            if (n > 0) { syncContributorsFromDOM(); const t = state.contributors[n-1]; state.contributors[n-1] = state.contributors[n]; state.contributors[n] = t; renderContribSidebar(); }
            return;
        }
        // Move down
        const downBtn = e.target.closest('[data-contrib-down]');
        if (downBtn) {
            const n = Number(downBtn.dataset.contribDown);
            if (n < state.contributors.length - 1) { syncContributorsFromDOM(); const t = state.contributors[n+1]; state.contributors[n+1] = state.contributors[n]; state.contributors[n] = t; renderContribSidebar(); }
            return;
        }
        // Remove contributor
        const removeBtn = e.target.closest('[data-contrib-remove]');
        if (removeBtn) {
            syncContributorsFromDOM();
            state.contributors.splice(Number(removeBtn.dataset.contribRemove), 1);
            renderContribSidebar(); return;
        }
        // Add social link
        const addSocialBtn = e.target.closest('[data-add-social]');
        if (addSocialBtn) {
            syncContributorsFromDOM();
            const ci = Number(addSocialBtn.dataset.addSocial);
            if (!state.contributors[ci].socials) state.contributors[ci].socials = [];
            state.contributors[ci].socials.push({ platform: 'instagram', url: '' });
            renderContribSidebar(); return;
        }
        // Remove social link
        const removeSocialBtn = e.target.closest('[data-remove-social]');
        if (removeSocialBtn) {
            syncContributorsFromDOM();
            const contribEl = removeSocialBtn.closest('[data-contrib-idx]');
            const ci = Number(contribEl.dataset.contribIdx);
            state.contributors[ci].socials.splice(Number(removeSocialBtn.dataset.removeSocial), 1);
            renderContribSidebar(); return;
        }
    });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function showModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function hideModal() { document.getElementById('modal-overlay').style.display = 'none'; }

document.getElementById('modal-cancel').addEventListener('click', function() { state.pendingTemplate = null; hideModal(); });
document.getElementById('modal-confirm').addEventListener('click', function() {
    hideModal(); if (state.pendingTemplate) { applyTemplate(state.pendingTemplate); state.pendingTemplate = null; }
});
document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) { state.pendingTemplate = null; hideModal(); }
});

// ─── Save / Load ──────────────────────────────────────────────────────────────

function getSaveData() {
    syncBlocksFromDOM();
    syncContributorsFromDOM();
    return {
        templateId: state.templateId,
        settings: state.settings,
        blocks: state.blocks,
        contributors: state.contributors,
        showContributors: state.showContributors,
        fields: {
            title: getVal('f-title'), author: getVal('f-author'), date: getVal('f-date'),
            endDate: getVal('f-end-date'), thumbnail: getVal('f-thumbnail'),
            filename: getVal('f-filename')
        }
    };
}

function applySaveData(data) {
    if (!data || !data.templateId) { alert('This save file does not have a valid template.'); return; }
    state.templateId = data.templateId;
    state.settings = Object.assign({ isEvent: false, hasSlideshowCss: false, showContributors: false }, data.settings || {});
    state.blocks = data.blocks || [];
    state.contributors = data.contributors || [];
    state.showContributors = !!data.showContributors;
    filenameAutoFill = false;
    updateDetailsFields();
    updateContribSidebarVisibility();
    renderTemplateNav();
    renderContentBuilder();
    if (state.showContributors) renderContribSidebar();
    updateSaveButtonState();
    if (data.fields) {
        var f = data.fields;
        var s = function(id, v) { var el = document.getElementById(id); if (el && v) el.value = v; };
        s('f-title', f.title); s('f-author', f.author); s('f-date', f.date);
        s('f-end-date', f.endDate); s('f-thumbnail', f.thumbnail);
        s('f-filename', f.filename);
    }
}

document.getElementById('btn-save-layout').addEventListener('click', function() {
    const data = getSaveData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fname = getVal('f-filename').trim();
    a.href = url; a.download = (slugify(fname) || 'untitled-blog-post') + '-draft.json'; a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('btn-load-layout').addEventListener('click', function() { document.getElementById('import-file').click(); });

document.getElementById('import-file').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { try { applySaveData(JSON.parse(e.target.result)); } catch(err) { alert('Could not read save file.'); } };
    reader.readAsText(file); this.value = '';
});

// ─── Drag-drop overlay ────────────────────────────────────────────────────────

var dragCounter = 0;
window.addEventListener('dragenter', function(e) {
    if (e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
        dragCounter++;
        document.getElementById('drop-overlay').classList.add('active');
    }
});
window.addEventListener('dragleave', function() {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; document.getElementById('drop-overlay').classList.remove('active'); }
});
window.addEventListener('dragover', function(e) { e.preventDefault(); });
window.addEventListener('drop', function(e) {
    e.preventDefault();
    dragCounter = 0;
    document.getElementById('drop-overlay').classList.remove('active');
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.json')) return;
    const reader = new FileReader();
    reader.onload = function(ev) { try { applySaveData(JSON.parse(ev.target.result)); } catch(err) { alert('Could not read save file.'); } };
    reader.readAsText(file);
});

// ─── HTML Generation ──────────────────────────────────────────────────────────

const PLACEHOLDER_IMG = 'images/misc/CAO-placeholder.png';

function blockToBodyHtml(b, indent) {
    const px = indent || '                    ';
    if (b.type === 'paragraph') {
        return px + '<p>' + escHtml(b.text) + '</p>';
    } else if (b.type === 'image') {
        const src = b.url || PLACEHOLDER_IMG;
        const cap = b.caption ? '\n' + px + '    <figcaption>' + escHtml(b.caption) + '</figcaption>' : '';
        return px + '<figure class="blog-figure">\n' + px + '    <img src="../' + escHtml(src) + '" alt="' + escHtml(b.alt) + '">' + cap + '\n' + px + '</figure>';
    } else if (b.type === 'youtube-inline') {
        const vid = extractYouTubeId(b.url);
        const embedUrl = vid ? 'https://www.youtube.com/embed/' + vid : escHtml(b.url);
        return px + '<div class="blog-video">\n'
            + px + '    <div class="blog-video-frame">\n'
            + px + '        <iframe src="' + embedUrl + '" title="Video" frameborder="0"'
            + ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"'
            + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\n'
            + px + '    </div>\n' + px + '</div>';
    } else if (b.type === 'slideshow') {
        const slidesHtml = (b.slides || []).map(function(s, si) {
            const src = s.url || PLACEHOLDER_IMG;
            return '                                <img class="slideshow-slide' + (si === 0 ? ' is-active' : '') + '" src="../'
                + escHtml(src) + '" alt="' + escHtml(s.alt || 'Slide ' + (si + 1)) + '">';
        }).join('\n');
        return px + '<div class="blog-slideshow">\n'
            + px + '    <div class="slideshow" data-autoplay-interval="5000">\n'
            + px + '        <button class="slideshow-arrow slideshow-arrow-prev" aria-label="Previous slide">\n'
            + px + '            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><polyline points="15 4 7 12 15 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
            + px + '        </button>\n'
            + px + '        <div class="slideshow-viewport">\n' + slidesHtml + '\n' + px + '        </div>\n'
            + px + '        <button class="slideshow-arrow slideshow-arrow-next" aria-label="Next slide">\n'
            + px + '            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><polyline points="9 4 17 12 9 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>\n'
            + px + '        </button>\n'
            + px + '        <div class="slideshow-dots" role="tablist" aria-label="Select slide"></div>\n'
            + px + '    </div>\n' + px + '</div>';
    }
    return '';
}

function buildContributorSidebar() {
    const cards = state.contributors.map(function(c) {
        const socialsHtml = (c.socials || []).filter(function(s) { return s.url; }).map(function(s) {
            const platform = SOCIAL_PLATFORMS.find(function(p) { return p.value === s.platform; });
            const iconId  = platform ? platform.icon : null;
            const label   = platform ? platform.label : (s.platform || 'Link');
            const iconSvg = iconId
                ? '<svg aria-hidden="true"><use href="../images/misc/social-icons.svg#' + iconId + '"/></svg>'
                : '🔗';
            return '                                <a href="' + escHtml(s.url) + '" class="social-icon contributor-social" aria-label="' + escHtml(label) + '">' + iconSvg + '</a>';
        }).join('\n');
        const photoSrc = c.photo || PLACEHOLDER_IMG;
        const socialsBlock = socialsHtml ? '\n                            <div class="contributor-socials">\n' + socialsHtml + '\n                            </div>' : '';
        return '                        <div class="contributor-card">\n'
            + '                            <div class="contributor-photo"><img src="../' + escHtml(photoSrc) + '" alt=""></div>\n'
            + '                            <h3 class="contributor-name">' + escHtml(c.name) + '</h3>' + socialsBlock + '\n'
            + '                        </div>';
    }).join('\n\n');
    return '                <aside class="blog-sidebar">\n'
        + '                    <h2 class="blog-sidebar-title">Contributers:</h2>\n'
        + '                    <div class="contributor-list">\n' + cards + '\n                    </div>\n'
        + '                </aside>';
}

function buildTwoColSection(colA, colB) {
    const count = Math.max(colA.length, colB.length);
    const rows = [];
    for (var i = 0; i < count; i++) {
        const left  = colA[i] ? blockToBodyHtml(colA[i],  '                            ') : '';
        const right = colB[i] ? blockToBodyHtml(colB[i], '                            ') : '';
        rows.push('                    <div class="blog-row">\n'
            + '                        <div class="blog-row-text">\n' + left + '\n                        </div>\n'
            + '                        <div class="blog-row-media">\n' + right + '\n                        </div>\n'
            + '                    </div>');
    }
    return '                <div class="blog-two-col">\n' + rows.join('\n\n') + '\n                </div>';
}

function buildContentStr(colA, colB, body, hasSidebar, hasTwoCol) {
    const blogBodyHtml = body.map(function(b) { return blockToBodyHtml(b); }).join('\n\n');
    let content = '';

    if (hasSidebar) {
        let bodyContent = blogBodyHtml;
        if (hasTwoCol) bodyContent += '\n\n' + buildTwoColSection(colA, colB).replace(/^                /gm, '                    ');
        content += '\n\n                <div class="blog-layout">\n'
            + '                    <div class="blog-body">\n' + bodyContent + '\n                    </div>\n\n'
            + buildContributorSidebar() + '\n                </div>';
    } else if (hasTwoCol && body.length === 0) {
        content += '\n\n' + buildTwoColSection(colA, colB);
    } else {
        content += '\n\n                <div class="blog-body">\n' + blogBodyHtml + '\n                </div>';
        if (hasTwoCol) content += '\n\n' + buildTwoColSection(colA, colB);
    }
    return content;
}

function buildFullHTML() {
    const tpl = baseTemplate || getBuiltinBaseTemplate();
    const title      = getVal('f-title');
    const author     = getVal('f-author');
    const date       = getVal('f-date');

    const colA = state.blocks.filter(function(b) { return b.col === 'A'; });
    const colB = state.blocks.filter(function(b) { return b.col === 'B'; });
    const body = state.blocks.filter(function(b) { return !b.col; });

    const hasSidebar = state.showContributors && state.contributors.length > 0;
    const hasTwoCol  = colA.length > 0 || colB.length > 0;
    const allBlocks  = state.blocks.concat(colA).concat(colB);
    const needsSlideshow = state.settings.hasSlideshowCss || allBlocks.some(function(b) { return b.type === 'slideshow'; });

    const so = '<' + 'script', sc = '</' + 'script>';
    const slideshowCss = needsSlideshow ? '\n    <link rel="stylesheet" href="../css/slideshow.css">' : '';
    const slideshowJs  = needsSlideshow ? '\n    ' + so + ' src="../js/Slideshow.js">' + sc : '';

    const content = buildContentStr(colA, colB, body, hasSidebar, hasTwoCol);

    return tpl
        .replace('{{PAGE_TITLE}}', escHtml(title))
        .replace('{{POST_TITLE}}', escHtml(title))
        .replace('{{POST_DATE}}',  escHtml(formatDisplayDate(date)))
        .replace('{{POST_AUTHOR}}', escHtml(author))
        .replace('{{POST_CONTENT}}', content)
        .replace('{{SLIDESHOW_CSS}}', slideshowCss)
        .replace('{{SLIDESHOW_JS}}', slideshowJs);
}

function buildJSONEntry() {
    const title     = getVal('f-title');
    const date      = getVal('f-date');
    const endDate   = getVal('f-end-date');
    const thumbnail = getVal('f-thumbnail');
    const filename  = getFilename();
    const isEvent   = state.settings.isEvent;
    const category  = isEvent ? '"events"' : '"announcements"';
    let entry = '        {\n'
        + '            "href": "Announcements-Blogs/' + escJson(filename) + '",\n'
        + '            "title": "' + escJson(title) + '",\n'
        + '            "date": "' + formatJsonDate(date) + '"';
    if (isEvent && endDate) entry += ',\n            "end_date": "' + formatJsonDate(endDate) + '"';
    entry += ',\n            "thumbnail": "' + escJson(thumbnail) + '"\n        },';
    return entry;
}

// ─── Generate button ──────────────────────────────────────────────────────────

document.getElementById('btn-generate').addEventListener('click', function() {
    if (!state.templateId) { alert('Please choose a template first.'); return; }
    syncBlocksFromDOM();
    syncContributorsFromDOM();
    const filename = getFilename();
    const htmlOut  = buildFullHTML();
    const jsonOut  = buildJSONEntry();
    document.getElementById('out-html').value = htmlOut;
    document.getElementById('out-json').value = jsonOut;
    const sec = document.getElementById('output-section');
    sec.classList.add('visible');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─── Output buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-copy-html').addEventListener('click', function() { copyToClipboard(document.getElementById('out-html').value, this); });
document.getElementById('btn-copy-json').addEventListener('click', function() { copyToClipboard(document.getElementById('out-json').value, this); });
document.getElementById('btn-download-html').addEventListener('click', function() {
    const content  = document.getElementById('out-html').value;
    const filename = getFilename();
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
});

// ─── Filename auto-fill from title ────────────────────────────────────────────

document.getElementById('f-title').addEventListener('input', function() {
    if (!filenameAutoFill) return;
    const filenameEl = document.getElementById('f-filename');
    filenameEl.value = slugify(this.value);
});

document.getElementById('f-filename').addEventListener('input', function() {
    filenameAutoFill = false;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initEvents();
initContribEvents();
loadTemplates();
loadBaseTemplate();

(function setDefaultDate() {
    const d = new Date();
    const iso = d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    document.getElementById('f-date').value = iso;
})();
