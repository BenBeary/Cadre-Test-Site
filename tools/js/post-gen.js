// Editor UI, event handling, save/load, and init for the post generator.
// State, constants, and the BLOCK_TYPES registry live in post-gen-data.js.
// HTML/JSON output lives in post-gen-output.js.

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

function setDefaultDate() {
    const d = new Date();
    const iso = d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    document.getElementById('f-date').value = iso;
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function stripLiveServerInjection(html) {
    return html.replace(/\s*<!-- Code injected by live-server -->[\s\S]*?<\/script>\s*/gi, '\n');
}

function loadTemplates() {
    fetch('json/template-data.json')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            templates       = data.templates       || BLANK_TEMPLATE_FALLBACK;
            socialPlatforms = data.socialPlatforms || SOCIAL_PLATFORMS_FALLBACK;
            renderTemplateNav();
            applyTemplate('blank');
        })
        .catch(function() {
            templates       = BLANK_TEMPLATE_FALLBACK;
            socialPlatforms = SOCIAL_PLATFORMS_FALLBACK;
            renderTemplateNav();
            applyTemplate('blank');
        });
}

function loadBaseTemplate() {
    fetch('../Announcements-Blogs/base-template.html')
        .then(function(r) { return r.text(); })
        .then(function(text) { baseTemplate = stripLiveServerInjection(text); })
        .catch(function() { baseTemplate = null; /* buildFullHTML alerts the user */ });
}

// ─── Template Nav & Selection ─────────────────────────────────────────────────

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
    clearOutput();
}

function updateDetailsFields() {
    document.getElementById('field-end-date').style.display = state.settings.isEvent ? '' : 'none';
}

// ─── Editor chrome ────────────────────────────────────────────────────────────

function updateContribSidebarVisibility() {
    const sidebar = document.getElementById('contrib-sidebar');
    const btn     = document.getElementById('btn-contrib-toggle');
    const row     = document.getElementById('content-contrib-row');
    sidebar.style.display = state.showContributors ? '' : 'none';
    btn.classList.toggle('active', state.showContributors);
    row.classList.toggle('contrib-open', state.showContributors);
}

function updateSaveButtonState() {
    document.getElementById('btn-save-layout').disabled = !hasBlocks();
}

function clearOutput() {
    document.getElementById('output-section').classList.remove('visible');
    const html = document.getElementById('out-html');
    const json = document.getElementById('out-json');
    if (html) html.value = '';
    if (json) json.value = '';
}

// ─── Contributors Sidebar ─────────────────────────────────────────────────────

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
        const opts = socialPlatforms.map(function(p) {
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

    html += '<div class="add-block-bar">';
    Object.keys(BLOCK_TYPES).forEach(function(type) {
        html += '<button class="btn-add" data-add="' + type + '">+ ' + BLOCK_TYPES[type].label + '</button>';
    });
    html += '</div>';

    el.innerHTML = html;
    updateSaveButtonState();
}

function renderBlock(b, i) {
    const isFirst = i === 0, isLast = i === state.blocks.length - 1;
    const def = BLOCK_TYPES[b.type];
    if (!def) return ''; // unknown block type

    const colAClass = 'btn-icon btn-col-toggle' + (b.col === 'A' ? ' col-active-a' : '');
    const colBClass = 'btn-icon btn-col-toggle' + (b.col === 'B' ? ' col-active-b' : '');
    const colBadge  = b.col ? '<span class="col-badge col-' + b.col.toLowerCase() + '">Col ' + b.col + '</span>' : '';
    const badgeCls  = 'block-type-badge' + (def.badgeClass ? ' ' + def.badgeClass : '');
    const badge     = '<span class="' + badgeCls + '">' + def.label + '</span>';

    return '<div class="block-item" data-block-idx="' + i + '" draggable="true">'
        + '<div class="block-header">' + badge + colBadge
        + '<span class="drag-handle" title="Drag to reorder"></span>'
        + '<div class="block-controls">'
        + '<button class="' + colAClass + '" data-set-col-a="' + i + '" title="Assign to Column A">A</button>'
        + '<button class="' + colBClass + '" data-set-col-b="' + i + '" title="Assign to Column B">B</button>'
        + '<button class="btn-icon" data-move-up="' + i + '" title="Move up"' + (isFirst ? ' disabled' : '') + '>↑</button>'
        + '<button class="btn-icon" data-move-down="' + i + '" title="Move down"' + (isLast ? ' disabled' : '') + '>↓</button>'
        + '<button class="btn-icon danger" data-remove-block="' + i + '" title="Remove">✕</button>'
        + '</div></div>'
        + '<div class="block-body">' + def.renderBody(b) + '</div>'
        + '</div>';
}

function syncBlocksFromDOM() {
    document.querySelectorAll('[data-block-idx]').forEach(function(blockEl) {
        const i = Number(blockEl.dataset.blockIdx);
        const b = state.blocks[i];
        if (!b) return;
        const def = BLOCK_TYPES[b.type];
        if (def) def.syncFromDOM(b, blockEl);
    });
}

// ─── Block list events ────────────────────────────────────────────────────────

function initEvents() {
    const builder = document.getElementById('content-builder');

    builder.addEventListener('click', function(e) {
        // Add block (excluding the slideshow's inner add-slide button)
        const addBtn = e.target.closest('[data-add]');
        if (addBtn && !addBtn.hasAttribute('data-add-slide')) {
            const type = addBtn.dataset.add;
            const def = BLOCK_TYPES[type];
            if (def) {
                syncBlocksFromDOM();
                state.blocks.push(def.defaults());
                renderContentBuilder();
                clearOutput();
            }
            return;
        }

        // Remove block
        const removeBtn = e.target.closest('[data-remove-block]');
        if (removeBtn) {
            syncBlocksFromDOM();
            state.blocks.splice(Number(removeBtn.dataset.removeBlock), 1);
            renderContentBuilder(); clearOutput(); return;
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

        // Column A toggle
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

        // Slideshow: add slide
        const addSlideBtn = e.target.closest('[data-add-slide]');
        if (addSlideBtn) {
            syncBlocksFromDOM();
            const blockIdx = Number(addSlideBtn.closest('[data-block-idx]').dataset.blockIdx);
            state.blocks[blockIdx].slides.push({ url: '', alt: '' });
            renderContentBuilder(); return;
        }

        // Slideshow: remove slide
        const removeSlideBtn = e.target.closest('[data-remove-slide]');
        if (removeSlideBtn) {
            syncBlocksFromDOM();
            const blockIdx = Number(removeSlideBtn.closest('[data-block-idx]').dataset.blockIdx);
            state.blocks[blockIdx].slides.splice(Number(removeSlideBtn.dataset.removeSlide), 1);
            if (state.blocks[blockIdx].slides.length === 0) state.blocks[blockIdx].slides.push({ url: '', alt: '' });
            renderContentBuilder(); return;
        }
    });

    // ── Drag-and-drop reorder ──────────────────────────────────────────────
    let dragSrcIndex = null;
    let mouseDownEl = null;

    function clearDropIndicators() {
        builder.querySelectorAll('.drop-target-before, .drop-target-after')
            .forEach(function(el) { el.classList.remove('drop-target-before', 'drop-target-after'); });
    }

    // dragstart's e.target is the draggable element (the .block-item itself),
    // not the actual mousedown target. Track mousedown separately so we can
    // tell whether the drag started from the drag handle vs an input/button.
    builder.addEventListener('mousedown', function(e) { mouseDownEl = e.target; });

    builder.addEventListener('dragstart', function(e) {
        const blockEl = e.target.closest('[data-block-idx]');
        if (!blockEl) return;
        if (!mouseDownEl || !mouseDownEl.closest('.drag-handle')) {
            e.preventDefault(); return;
        }
        dragSrcIndex = Number(blockEl.dataset.blockIdx);
        blockEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragSrcIndex)); } catch (_) {}
        syncBlocksFromDOM();
    });

    builder.addEventListener('dragend', function(e) {
        const blockEl = e.target.closest('[data-block-idx]');
        if (blockEl) blockEl.classList.remove('dragging');
        clearDropIndicators();
        dragSrcIndex = null;
    });

    builder.addEventListener('dragover', function(e) {
        if (dragSrcIndex === null) return;
        const blockEl = e.target.closest('[data-block-idx]');
        if (!blockEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = blockEl.getBoundingClientRect();
        const dropAfter = (e.clientY - rect.top) > rect.height / 2;
        clearDropIndicators();
        blockEl.classList.add(dropAfter ? 'drop-target-after' : 'drop-target-before');
    });

    builder.addEventListener('dragleave', function(e) {
        if (dragSrcIndex === null) return;
        if (!builder.contains(e.relatedTarget)) clearDropIndicators();
    });

    builder.addEventListener('drop', function(e) {
        if (dragSrcIndex === null) return;
        e.preventDefault();
        const blockEl = e.target.closest('[data-block-idx]');
        clearDropIndicators();
        if (!blockEl) { dragSrcIndex = null; return; }
        let targetIndex = Number(blockEl.dataset.blockIdx);
        const rect = blockEl.getBoundingClientRect();
        const dropAfter = (e.clientY - rect.top) > rect.height / 2;
        if (dropAfter) targetIndex++;
        if (dragSrcIndex < targetIndex) targetIndex--;
        if (targetIndex !== dragSrcIndex) {
            const moved = state.blocks.splice(dragSrcIndex, 1)[0];
            state.blocks.splice(targetIndex, 0, moved);
            renderContentBuilder();
            clearOutput();
        }
        dragSrcIndex = null;
    });
}

function initContribEvents() {
    document.getElementById('btn-contrib-toggle').addEventListener('click', function() {
        syncContributorsFromDOM();
        state.showContributors = !state.showContributors;
        updateContribSidebarVisibility();
        if (state.showContributors) renderContribSidebar();
    });

    document.getElementById('contrib-sidebar').addEventListener('click', function(e) {
        if (e.target.id === 'btn-add-contrib') {
            syncContributorsFromDOM();
            state.contributors.push({ name: '', photo: '', socials: [] });
            renderContribSidebar(); return;
        }
        const upBtn = e.target.closest('[data-contrib-up]');
        if (upBtn) {
            const n = Number(upBtn.dataset.contribUp);
            if (n > 0) { syncContributorsFromDOM(); const t = state.contributors[n-1]; state.contributors[n-1] = state.contributors[n]; state.contributors[n] = t; renderContribSidebar(); }
            return;
        }
        const downBtn = e.target.closest('[data-contrib-down]');
        if (downBtn) {
            const n = Number(downBtn.dataset.contribDown);
            if (n < state.contributors.length - 1) { syncContributorsFromDOM(); const t = state.contributors[n+1]; state.contributors[n+1] = state.contributors[n]; state.contributors[n] = t; renderContribSidebar(); }
            return;
        }
        const removeBtn = e.target.closest('[data-contrib-remove]');
        if (removeBtn) {
            syncContributorsFromDOM();
            state.contributors.splice(Number(removeBtn.dataset.contribRemove), 1);
            renderContribSidebar(); return;
        }
        const addSocialBtn = e.target.closest('[data-add-social]');
        if (addSocialBtn) {
            syncContributorsFromDOM();
            const ci = Number(addSocialBtn.dataset.addSocial);
            if (!state.contributors[ci].socials) state.contributors[ci].socials = [];
            state.contributors[ci].socials.push({ platform: 'instagram', url: '' });
            renderContribSidebar(); return;
        }
        const removeSocialBtn = e.target.closest('[data-remove-social]');
        if (removeSocialBtn) {
            syncContributorsFromDOM();
            const ci = Number(removeSocialBtn.closest('[data-contrib-idx]').dataset.contribIdx);
            state.contributors[ci].socials.splice(Number(removeSocialBtn.dataset.removeSocial), 1);
            renderContribSidebar(); return;
        }
    });
}

// ─── Switch-template confirmation modal ───────────────────────────────────────

function showModal() { document.getElementById('modal-overlay').style.display = 'flex'; }
function hideModal() { document.getElementById('modal-overlay').style.display = 'none'; }

document.getElementById('modal-cancel').addEventListener('click', function() { state.pendingTemplate = null; hideModal(); });
document.getElementById('modal-confirm').addEventListener('click', function() {
    hideModal(); if (state.pendingTemplate) { applyTemplate(state.pendingTemplate); state.pendingTemplate = null; }
});
document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) { state.pendingTemplate = null; hideModal(); }
});

// ─── Clear post ───────────────────────────────────────────────────────────────

function isPostEmpty() {
    if (state.blocks.length > 0) return false;
    if (state.contributors.length > 0) return false;
    if (state.templateId && state.templateId !== 'blank') return false;
    for (var i = 0; i < FORM_FIELDS.length; i++) {
        if (getVal(FORM_FIELDS[i])) return false;
    }
    return true;
}

function clearPost() {
    FORM_FIELDS.forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    setDefaultDate();
    filenameAutoFill = true;
    applyTemplate('blank'); // resets blocks, contributors, template, output
}

function showClearModal() { document.getElementById('clear-modal-overlay').style.display = 'flex'; }
function hideClearModal() { document.getElementById('clear-modal-overlay').style.display = 'none'; }

function requestClear() {
    if (isPostEmpty()) { clearPost(); return; }
    showClearModal();
}
document.getElementById('btn-clear-post').addEventListener('click', requestClear);
document.getElementById('btn-clear-post-step').addEventListener('click', requestClear);
document.getElementById('clear-modal-cancel').addEventListener('click', hideClearModal);
document.getElementById('clear-modal-confirm').addEventListener('click', function() {
    hideClearModal();
    clearPost();
});
document.getElementById('clear-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) hideClearModal();
});

// ─── Save / Load ──────────────────────────────────────────────────────────────

function getSaveData() {
    syncBlocksFromDOM();
    syncContributorsFromDOM();
    const fields = {};
    FORM_FIELDS.forEach(function(id) {
        // Strip the f- prefix → "f-end-date" becomes "endDate"
        const key = id.replace(/^f-/, '').replace(/-(.)/g, function(_, c) { return c.toUpperCase(); });
        fields[key] = getVal(id);
    });
    fields.date = getVal('f-date'); // not in FORM_FIELDS list (auto-set, not user-cleared)
    return {
        templateId: state.templateId,
        settings: state.settings,
        blocks: state.blocks,
        contributors: state.contributors,
        showContributors: state.showContributors,
        fields: fields
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
    clearOutput();
    if (data.fields) {
        const setIfPresent = function(id, v) { const el = document.getElementById(id); if (el && v) el.value = v; };
        const f = data.fields;
        setIfPresent('f-title', f.title);
        setIfPresent('f-author', f.author);
        setIfPresent('f-date', f.date);
        setIfPresent('f-end-date', f.endDate);
        setIfPresent('f-thumbnail', f.thumbnail);
        setIfPresent('f-filename', f.filename);
    }
}

function downloadFallback(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

async function saveDraftAs() {
    const data = getSaveData();
    const json = JSON.stringify(data, null, 2);
    const fname = getVal('f-filename').trim();
    const suggestedName = (slugify(fname) || 'untitled-blog-post') + '-draft.json';

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: suggestedName,
                types: [{ description: 'Blog Post Draft (JSON)', accept: { 'application/json': ['.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // user cancelled
            console.error('Save As failed, falling back to download:', err);
        }
    }
    downloadFallback(json, suggestedName, 'application/json');
}

document.getElementById('btn-save-layout').addEventListener('click', saveDraftAs);
document.getElementById('btn-load-layout').addEventListener('click', function() { document.getElementById('import-file').click(); });

document.getElementById('import-file').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { try { applySaveData(JSON.parse(e.target.result)); } catch(err) { alert('Could not read save file.'); } };
    reader.readAsText(file); this.value = '';
});

// ─── File drag-drop overlay ───────────────────────────────────────────────────

(function initFileDropOverlay() {
    let dragCounter = 0;
    const overlay = document.getElementById('drop-overlay');

    window.addEventListener('dragenter', function(e) {
        if (e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1) {
            dragCounter++;
            overlay.classList.add('active');
        }
    });
    window.addEventListener('dragleave', function() {
        dragCounter--;
        if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
    });
    window.addEventListener('dragover', function(e) { e.preventDefault(); });
    window.addEventListener('drop', function(e) {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('active');
        const file = e.dataTransfer && e.dataTransfer.files[0];
        if (!file || !file.name.endsWith('.json')) return;
        const reader = new FileReader();
        reader.onload = function(ev) { try { applySaveData(JSON.parse(ev.target.result)); } catch(err) { alert('Could not read save file.'); } };
        reader.readAsText(file);
    });
})();

// ─── Generate button ──────────────────────────────────────────────────────────

document.getElementById('btn-generate').addEventListener('click', function() {
    if (!state.templateId) { alert('Please choose a template first.'); return; }
    syncBlocksFromDOM();
    syncContributorsFromDOM();
    document.getElementById('out-html').value = buildFullHTML();
    document.getElementById('out-json').value = buildJSONEntry();
    const sec = document.getElementById('output-section');
    sec.classList.add('visible');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─── Preview ──────────────────────────────────────────────────────────────────

// Generated posts use `../`-prefixed asset paths because they live in
// /Announcements-Blogs/. Inject a <base> pointing at that folder so the
// preview iframe (and any "open in new tab" blob) resolves CSS/JS/images
// exactly like the deployed post.
function buildPreviewHtml() {
    if (!state.templateId) { alert('Please choose a template first.'); return null; }
    syncBlocksFromDOM();
    syncContributorsFromDOM();
    const html = buildFullHTML();
    if (!html) return null;
    const baseHref = new URL('../Announcements-Blogs/', window.location.href).href;
    const baseTag  = '<base href="' + baseHref + '">';
    return html.replace(/<head([^>]*)>/i, '<head$1>\n    ' + baseTag);
}

function openPreview() {
    const html = buildPreviewHtml();
    if (html === null) return;
    document.getElementById('preview-iframe').srcdoc = html;
    document.getElementById('preview-overlay').style.display = 'flex';
    document.body.classList.add('preview-open');
}

function closePreview() {
    document.getElementById('preview-overlay').style.display = 'none';
    document.body.classList.remove('preview-open');
    document.getElementById('preview-iframe').srcdoc = '';
}

function isPreviewOpen() {
    return document.getElementById('preview-overlay').style.display === 'flex';
}

document.getElementById('btn-preview').addEventListener('click', openPreview);
document.getElementById('btn-preview-close').addEventListener('click', closePreview);

document.getElementById('btn-preview-refresh').addEventListener('click', function() {
    const html = buildPreviewHtml();
    if (html === null) return;
    document.getElementById('preview-iframe').srcdoc = html;
});

document.getElementById('btn-preview-newtab').addEventListener('click', function() {
    const html = buildPreviewHtml();
    if (html === null) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
});

document.getElementById('preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) closePreview();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isPreviewOpen()) closePreview();
});

// ─── Output buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-copy-html').addEventListener('click', function() { copyToClipboard(document.getElementById('out-html').value, this); });
document.getElementById('btn-copy-json').addEventListener('click', function() { copyToClipboard(document.getElementById('out-json').value, this); });
document.getElementById('btn-download-html').addEventListener('click', function() {
    downloadFallback(document.getElementById('out-html').value, getFilename(), 'text/html;charset=utf-8');
});

// ─── Filename auto-fill from title ────────────────────────────────────────────

document.getElementById('f-title').addEventListener('input', function() {
    if (!filenameAutoFill) return;
    document.getElementById('f-filename').value = slugify(this.value);
});

document.getElementById('f-filename').addEventListener('input', function() {
    filenameAutoFill = false;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

initEvents();
initContribEvents();
loadTemplates();
loadBaseTemplate();
setDefaultDate();
