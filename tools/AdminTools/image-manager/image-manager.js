/* Image Manager — admin tool: tree browser for /images/ + staging surfaces.
   Loaded only on tools/post-generator-admin.html (gated by data-page-role).

   Responsibilities (after the ChangeQueue / AdminToolManager refactor):
     - Fetch + render the /images/ tree via the GitHub Trees API (PNG/JPEG only)
     - Drag image rows onto thumbnail / image-block / slideshow / contributor inputs
     - Right-click context menu: copy path, new folder, add image, delete
     - Drag image files from the OS onto folder rows to stage uploads
     - Push staged actions into ChangeQueue (no local actions array)

   Does NOT own: the commit flow, Undo / Reset / Save buttons, or the panel
   show/hide chrome — those live in Show Changes + AdminToolManager. */

const IMG_MGR_BRANCH = 'main';

// State ---------------------------------------------------------------
let imgMgrServerTree = null;     // immutable snapshot from API
let imgMgrLocalTree = null;      // = applyActions(serverTree, ChangeQueue.list())
let imgMgrExpanded = new Set();
let imgMgrLoaded = false;
let imgMgrLoading = false;
let imgMgrCtxMenuEl = null;
let imgMgrPendingDelete = null;  // {type:'file'|'folder', node, containedFiles?}
let imgMgrUploadStaged = [];     // [{name, size, base64, dataUrl}]
let imgMgrUploadDest = null;     // destination folder path for upload modal

// HTTP / API ----------------------------------------------------------
async function imgMgrFetchTree() {
    const data = await ghGetTree(IMG_MGR_BRANCH, true);
    return imgMgrBuildHierarchy(data.tree || []);
}

// Build / apply tree --------------------------------------------------
function imgMgrBuildHierarchy(flatEntries) {
    const root = { name: 'Blog-Images', path: 'images/Blog-Images', type: 'folder', children: [] };
    const folderMap = new Map();
    folderMap.set('images/Blog-Images', root);

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/Blog-Images/')) return;
        if (e.type !== 'tree') return;
        const node = { name: e.path.split('/').pop(), path: e.path, type: 'folder', children: [] };
        folderMap.set(e.path, node);
    });

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/Blog-Images/')) return;
        if (e.type !== 'tree') return;
        const parentPath = e.path.split('/').slice(0, -1).join('/');
        const parent = folderMap.get(parentPath);
        const node = folderMap.get(e.path);
        if (parent && node) parent.children.push(node);
    });

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/Blog-Images/')) return;
        if (e.type !== 'blob') return;
        const name = e.path.split('/').pop();
        const ext = name.split('.').pop().toLowerCase();
        if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') return;
        const parentPath = e.path.split('/').slice(0, -1).join('/');
        const parent = folderMap.get(parentPath);
        if (parent) parent.children.push({ name: name, path: e.path, type: 'image', sha: e.sha });
    });

    imgMgrSortTree(root);
    return root;
}

function imgMgrSortTree(node) {
    if (node.type !== 'folder') return;
    node.children.sort(function(a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    node.children.forEach(imgMgrSortTree);
}

function imgMgrCloneTree(node) {
    if (node.type === 'image') return Object.assign({}, node);
    return Object.assign({}, node, { children: node.children.map(imgMgrCloneTree) });
}

function imgMgrFindNode(tree, path) {
    if (!tree) return null;
    if (tree.path === path) return tree;
    if (tree.type !== 'folder') return null;
    for (let i = 0; i < tree.children.length; i++) {
        const f = imgMgrFindNode(tree.children[i], path);
        if (f) return f;
    }
    return null;
}

function imgMgrFindParent(tree, childPath) {
    const parentPath = childPath.split('/').slice(0, -1).join('/');
    return imgMgrFindNode(tree, parentPath);
}

function imgMgrApplyActions(serverTree, actions) {
    const tree = imgMgrCloneTree(serverTree);
    actions.forEach(function(a) {
        if (a.type === 'createFolder') {
            const parent = imgMgrFindParent(tree, a.path);
            if (parent) {
                parent.children.push({ name: a.path.split('/').pop(), path: a.path, type: 'folder', children: [], _pending: 'new' });
            }
        } else if (a.type === 'uploadFile') {
            const parent = imgMgrFindParent(tree, a.path);
            if (parent) {
                const name = a.path.split('/').pop();
                // Overwrite case: drop any existing same-path child so the tree
                // shows one pending entry instead of two with identical names.
                parent.children = parent.children.filter(function(c) { return c.path !== a.path; });
                // Tag as 'overwrite' if the file existed on the server snapshot;
                // tag as 'new' otherwise. Checking serverTree (not the cloned
                // working tree) keeps the detection order-independent.
                const existedOnServer = !!imgMgrFindNode(serverTree, a.path);
                parent.children.push({
                    name: name, path: a.path, type: 'image', sha: '(pending)',
                    _pending: existedOnServer ? 'overwrite' : 'new'
                });
            }
        } else if (a.type === 'deleteFile' || a.type === 'deleteFolder') {
            const parent = imgMgrFindParent(tree, a.path);
            if (parent) {
                parent.children = parent.children.filter(function(c) { return c.path !== a.path; });
            }
        }
    });
    imgMgrSortTree(tree);
    return tree;
}

function imgMgrRebuildLocal() {
    if (!imgMgrServerTree) { imgMgrLocalTree = null; return; }
    const actions = ChangeQueue.list();
    imgMgrLocalTree = imgMgrApplyActions(imgMgrServerTree, actions);
    actions.forEach(function(a) {
        if (a.type === 'createFolder' || a.type === 'uploadFile') {
            const parent = a.path.split('/').slice(0, -1).join('/');
            if (parent && parent !== 'images/Blog-Images') imgMgrExpanded.add(parent);
        }
    });
    imgMgrRenderTree();
}

// Render --------------------------------------------------------------
function imgMgrRenderTree() {
    const body = document.getElementById('image-manager-body');
    if (!body) return;
    if (!imgMgrLocalTree) {
        body.innerHTML = '<div class="image-manager-placeholder">No tree loaded.</div>';
        return;
    }
    body.innerHTML = '<div class="img-tree">' + imgMgrRenderNode(imgMgrLocalTree, 0) + '</div>';
}

function imgMgrRenderNode(node, depth) {
    const padLeft = 8 + depth * 16;
    let pendingClass = '';
    let tag = '';
    if (node._pending === 'overwrite') {
        pendingClass = ' img-row-pending img-row-pending-overwrite';
        tag = '<span class="img-row-tag img-row-tag-overwrite">+overwrite</span>';
    } else if (node._pending === 'new') {
        pendingClass = ' img-row-pending';
        tag = '<span class="img-row-tag img-row-tag-new">+new</span>';
    }
    if (node.type === 'image') {
        return '<div class="img-row img-row-image' + pendingClass + '" data-path="' + escHtml(node.path)
             + '" data-sha="' + escHtml(node.sha || '') + '" title="' + escHtml(node.path)
             + '" draggable="true" style="padding-left: ' + padLeft + 'px">'
             + '<span class="img-row-icon">🖼</span>'
             + '<span class="img-row-name">' + escHtml(node.name) + '</span>'
             + tag
             + '</div>';
    }
    const isRoot = node.path === 'images/Blog-Images';
    const expanded = isRoot || imgMgrExpanded.has(node.path);
    const icon = expanded ? '📂' : '📁';
    let html = '<div class="img-row img-row-folder' + (expanded ? ' expanded' : '') + pendingClass
             + '" data-path="' + escHtml(node.path)
             + '" style="padding-left: ' + padLeft + 'px">'
             + '<span class="img-row-icon">' + icon + '</span>'
             + '<span class="img-row-name">' + escHtml(node.name) + '</span>'
             + tag
             + '</div>';
    if (expanded) {
        if (node.children.length === 0) {
            html += '<div class="img-row-empty" style="padding-left: ' + (padLeft + 22) + 'px">(empty)</div>';
        } else {
            node.children.forEach(function(child) { html += imgMgrRenderNode(child, depth + 1); });
        }
    }
    return html;
}

function imgMgrToggleFolder(path) {
    if (path === 'images/Blog-Images') return;
    if (imgMgrExpanded.has(path)) imgMgrExpanded.delete(path);
    else imgMgrExpanded.add(path);
    imgMgrRenderTree();
}

// Load ----------------------------------------------------------------
async function imgMgrLoadAndRender() {
    const body = document.getElementById('image-manager-body');
    if (!body || imgMgrLoading) return;
    imgMgrLoading = true;
    body.innerHTML = '<div class="image-manager-placeholder">Loading images…</div>';
    try {
        imgMgrServerTree = await imgMgrFetchTree();
        imgMgrLoaded = true;
        imgMgrRebuildLocal();
    } catch (err) {
        body.innerHTML = '<div class="image-manager-placeholder image-manager-error">'
                       + escHtml(err.message || String(err))
                       + '<br><br><button class="admin-tool-btn" id="img-mgr-retry">Retry</button>'
                       + '</div>';
        const retry = document.getElementById('img-mgr-retry');
        if (retry) retry.addEventListener('click', function() { imgMgrLoaded = false; imgMgrLoadAndRender(); });
    } finally {
        imgMgrLoading = false;
    }
}

// Drag-to-input wiring lives in tools/js/image-drag-target.js — it's shared
// with the basic page's image-picker, so it's loaded once at the page level
// rather than re-bound per admin tool. The handlers match both
// .img-row-image (admin) and .img-picker-image (basic) source rows.

// Context menu (uses shared .admin-context-menu styles in admin-tools.css) ----
function imgMgrContextMenuItems(node) {
    if (node.type === 'image') {
        const items = [
            { label: 'Copy Relative Path', action: function() { navigator.clipboard.writeText(node.path).catch(function() {}); } }
        ];
        if (node._pending) {
            // The row is a staged upload (+new or +overwrite) — there's nothing
            // on the server to delete. "Undo" pulls the upload action out of the
            // queue; for overwrites that brings the original entry back, for
            // new uploads the row disappears entirely.
            items.push({ label: 'Undo', action: function() { imgMgrUndoPendingUpload(node); } });
        } else {
            items.push({ label: 'Delete', action: function() { imgMgrConfirmDeleteFile(node); } });
        }
        return items;
    }
    const isRoot = node.path === 'images/Blog-Images';
    const items = [
        { label: 'New Folder', action: function() { imgMgrPromptNewFolder(node); } },
        { label: 'Add Image…', action: function() { imgMgrOpenUploadModal(node.path); } }
    ];
    if (!isRoot) items.push({ label: 'Delete Folder', action: function() { imgMgrConfirmDeleteFolder(node); } });
    return items;
}

function imgMgrShowContextMenu(e, node) {
    e.preventDefault();
    imgMgrHideContextMenu();
    const items = imgMgrContextMenuItems(node);
    if (!items.length) return;
    const menu = document.createElement('div');
    menu.className = 'admin-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top  = e.clientY + 'px';
    items.forEach(function(item) {
        const el = document.createElement('div');
        el.className = 'admin-context-menu-item';
        el.textContent = item.label;
        el.addEventListener('click', function() { imgMgrHideContextMenu(); item.action(); });
        menu.appendChild(el);
    });
    document.body.appendChild(menu);
    imgMgrCtxMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = (window.innerWidth  - rect.width  - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top  = (window.innerHeight - rect.height - 4) + 'px';
}

function imgMgrHideContextMenu() {
    if (imgMgrCtxMenuEl) { imgMgrCtxMenuEl.remove(); imgMgrCtxMenuEl = null; }
}

// Write actions: prompts + delete confirmations -----------------------
function imgMgrPromptNewFolder(parentNode) {
    const name = prompt('Folder name:');
    if (!name) return;
    const slug = name.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) { alert('Invalid folder name.'); return; }
    const newPath = parentNode.path + '/' + slug;
    const parent = imgMgrFindNode(imgMgrLocalTree, parentNode.path);
    if (parent && parent.children.some(function(c) { return c.path === newPath; })) {
        alert('"' + slug + '" already exists in ' + parentNode.path + '.');
        return;
    }
    ChangeQueue.add({ type: 'createFolder', path: newPath });
}

function imgMgrConfirmDeleteFile(node) {
    imgMgrPendingDelete = { type: 'file', node: node };
    imgMgrShowDeleteModal('Delete ' + node.name + '?',
        'Queues deletion of <code>' + escHtml(node.path) + '</code>. Commits to GitHub when you Commit.');
}

function imgMgrUndoPendingUpload(node) {
    const list = ChangeQueue.list();
    const idx = list.findIndex(function(a) {
        return a.type === 'uploadFile' && a.path === node.path;
    });
    if (idx >= 0) ChangeQueue.removeAt(idx);
}

function imgMgrConfirmDeleteFolder(node) {
    const serverFolder = imgMgrFindNode(imgMgrServerTree, node.path);
    const containedFiles = [];
    if (serverFolder) {
        (function gather(n) {
            if (n.type === 'image') containedFiles.push({ path: n.path, sha: n.sha });
            else if (n.children) n.children.forEach(gather);
        })(serverFolder);
    }
    imgMgrPendingDelete = { type: 'folder', node: node, containedFiles: containedFiles };
    const word = containedFiles.length === 1 ? 'file' : 'files';
    imgMgrShowDeleteModal('Delete folder ' + node.name + '?',
        'Queues deletion of <code>' + escHtml(node.path) + '/</code> and its <strong>' + containedFiles.length + ' ' + word + '</strong>. Commits to GitHub when you Commit.');
}

// Modal helpers (delete + upload — save/conflict moved to show-changes) -------
function imgMgrShowDeleteModal(title, bodyHtml) {
    const overlay = document.getElementById('img-delete-modal-overlay');
    if (!overlay) return;
    const t = document.getElementById('img-delete-title');
    const b = document.getElementById('img-delete-body');
    if (t) t.textContent = title;
    if (b) b.innerHTML = bodyHtml;
    overlay.style.display = 'flex';
}
function imgMgrHideDeleteModal() {
    const o = document.getElementById('img-delete-modal-overlay');
    if (o) o.style.display = 'none';
    imgMgrPendingDelete = null;
}
function imgMgrConfirmDelete() {
    if (!imgMgrPendingDelete) return;
    const p = imgMgrPendingDelete;
    if (p.type === 'file') {
        ChangeQueue.add({ type: 'deleteFile', path: p.node.path, sha: p.node.sha });
    } else if (p.type === 'folder') {
        ChangeQueue.add({ type: 'deleteFolder', path: p.node.path, containedFiles: p.containedFiles });
    }
    imgMgrHideDeleteModal();
}

// Upload modal & OS-drag-onto-folder ----------------------------------
function imgMgrOpenUploadModal(folderPath) {
    imgMgrUploadDest = folderPath;
    imgMgrUploadStaged = [];
    const dest = document.getElementById('img-upload-dest');
    if (dest) dest.textContent = folderPath;
    const err = document.getElementById('img-upload-error');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    const input = document.getElementById('img-upload-file-input');
    if (input) input.value = '';
    imgMgrRenderUploadPreview();
    const overlay = document.getElementById('img-upload-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}
function imgMgrHideUploadModal() {
    const o = document.getElementById('img-upload-modal-overlay');
    if (o) o.style.display = 'none';
    imgMgrUploadStaged = [];
    imgMgrUploadDest = null;
}

function imgMgrReadFileDataUrl(file) {
    return new Promise(function(resolve, reject) {
        const r = new FileReader();
        r.onload = function() { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

async function imgMgrAddFilesToUploadStage(fileList) {
    const all = Array.from(fileList);
    const valid = all.filter(function(f) { return f.type === 'image/png' || f.type === 'image/jpeg'; });
    const err = document.getElementById('img-upload-error');
    if (valid.length !== all.length) {
        if (err) { err.textContent = 'Only PNG and JPEG files are accepted. Others were ignored.'; err.style.display = 'block'; }
    } else if (err) { err.style.display = 'none'; err.textContent = ''; }

    for (let i = 0; i < valid.length; i++) {
        const f = valid[i];
        if (imgMgrUploadStaged.some(function(s) { return s.name === f.name; })) continue;
        const dataUrl = await imgMgrReadFileDataUrl(f);
        const base64 = dataUrl.split(',')[1];
        imgMgrUploadStaged.push({ name: f.name, size: f.size, base64: base64, dataUrl: dataUrl });
    }
    imgMgrRenderUploadPreview();
}

function imgMgrRenderUploadPreview() {
    const list = document.getElementById('img-upload-preview');
    if (!list) return;
    list.innerHTML = imgMgrUploadStaged.map(function(f, i) {
        return '<li class="img-upload-preview-item">'
             + '<span class="img-upload-preview-name">' + escHtml(f.name) + '</span>'
             + '<span class="img-upload-preview-size">' + Math.round(f.size / 1024) + ' KB</span>'
             + '<button class="img-upload-preview-remove" data-i="' + i + '" title="Remove">×</button>'
             + '</li>';
    }).join('');
    const btn = document.getElementById('img-upload-confirm');
    if (btn) btn.disabled = imgMgrUploadStaged.length === 0;
}

async function imgMgrConfirmUpload() {
    if (!imgMgrUploadDest || !imgMgrUploadStaged.length) return;
    const dest = imgMgrUploadDest;
    const staged = imgMgrUploadStaged.slice();
    imgMgrHideUploadModal();
    await imgMgrStageImageUploads(staged, dest);
}

async function imgMgrHandleFolderDrop(e, folderRow) {
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    folderRow.classList.remove('folder-drop-hover');
    const folderPath = folderRow.dataset.path;
    const valid = Array.from(e.dataTransfer.files).filter(function(f) { return f.type === 'image/png' || f.type === 'image/jpeg'; });
    if (!valid.length) return;

    // Pre-read each File to base64 so the staging helper can treat both
    // entry points (Add-Image modal + OS drag) the same way.
    const staged = [];
    for (let i = 0; i < valid.length; i++) {
        const f = valid[i];
        const dataUrl = await imgMgrReadFileDataUrl(f);
        staged.push({ name: f.name, size: f.size, base64: dataUrl.split(',')[1] });
    }
    await imgMgrStageImageUploads(staged, folderPath);
}

// Shared collision-handling helper for both upload entry points.
// `staged` is an array of {name, size, base64}; folderPath is the destination.
// Conflicts are detected against the LOCAL tree (so already-pending uploads count too).
async function imgMgrStageImageUploads(staged, folderPath) {
    const folder = imgMgrFindNode(imgMgrLocalTree || imgMgrServerTree, folderPath);

    // Count total conflicts upfront so we know whether to show the bulk-apply buttons.
    let totalConflicts = 0;
    if (folder) {
        staged.forEach(function(f) {
            if (folder.children.some(function(c) { return c.name === f.name; })) totalConflicts++;
        });
    }

    let bulkChoice = null;        // 'overwrite' | 'skip' once user picks a for-all
    let conflictIndex = 0;

    for (let i = 0; i < staged.length; i++) {
        const f = staged[i];
        const path = folderPath + '/' + f.name;
        const conflict = !!folder && folder.children.some(function(c) { return c.name === f.name; });

        let decision = 'overwrite';   // default action when there's no conflict
        if (conflict) {
            conflictIndex++;
            if (bulkChoice) {
                decision = bulkChoice;
            } else {
                const result = await imgMgrConfirmOverwrite(f.name, folderPath, {
                    currentIndex: conflictIndex,
                    totalConflicts: totalConflicts
                });
                if (result === 'overwriteAll') { bulkChoice = 'overwrite'; decision = 'overwrite'; }
                else if (result === 'skipAll') { bulkChoice = 'skip';      decision = 'skip'; }
                else                           { decision = result; /* 'overwrite' or 'skip' */ }
            }
        }
        if (decision === 'skip') continue;

        // replaceOrAdd dedupes if the same path was already staged earlier.
        ChangeQueue.replaceOrAdd(
            function(a) { return a.type === 'uploadFile' && a.path === path; },
            { type: 'uploadFile', path: path, base64: f.base64, name: f.name, size: f.size }
        );
    }
}

function imgMgrConfirmOverwrite(filename, folderPath, batchInfo) {
    return new Promise(function(resolve) {
        const overlay = document.getElementById('img-overwrite-modal-overlay');
        if (!overlay) { resolve('skip'); return; }

        document.getElementById('img-overwrite-name').textContent   = filename;
        document.getElementById('img-overwrite-folder').textContent = folderPath;

        const showAll = batchInfo && batchInfo.totalConflicts > 1;
        const skipAllBtn      = document.getElementById('img-overwrite-skipall');
        const overwriteAllBtn = document.getElementById('img-overwrite-overwriteall');
        skipAllBtn.style.display      = showAll ? '' : 'none';
        overwriteAllBtn.style.display = showAll ? '' : 'none';

        const progressEl = document.getElementById('img-overwrite-progress');
        if (progressEl) {
            progressEl.textContent = showAll
                ? 'Conflict ' + batchInfo.currentIndex + ' of ' + batchInfo.totalConflicts
                : '';
        }

        const overwriteBtn = document.getElementById('img-overwrite-overwrite');
        const skipBtn      = document.getElementById('img-overwrite-skip');

        function cleanup() {
            overwriteBtn.removeEventListener('click', onOverwrite);
            skipBtn.removeEventListener('click', onSkip);
            overwriteAllBtn.removeEventListener('click', onOverwriteAll);
            skipAllBtn.removeEventListener('click', onSkipAll);
            overlay.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
        }
        function onOverwrite()    { cleanup(); overlay.style.display = 'none'; resolve('overwrite'); }
        function onSkip()         { cleanup(); overlay.style.display = 'none'; resolve('skip'); }
        function onOverwriteAll() { cleanup(); overlay.style.display = 'none'; resolve('overwriteAll'); }
        function onSkipAll()      { cleanup(); overlay.style.display = 'none'; resolve('skipAll'); }
        function onBackdrop(e)    { if (e.target === overlay) onSkip(); }
        function onKey(e)         { if (e.key === 'Escape') onSkip(); }

        overwriteBtn.addEventListener('click', onOverwrite);
        skipBtn.addEventListener('click', onSkip);
        overwriteAllBtn.addEventListener('click', onOverwriteAll);
        skipAllBtn.addEventListener('click', onSkipAll);
        overlay.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);

        overlay.style.display = 'flex';
    });
}

// Bootstrap -----------------------------------------------------------
function imgMgrBindClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}
function imgMgrBindOverlayClose(overlayId, fn) {
    const o = document.getElementById(overlayId);
    if (o) o.addEventListener('click', function(e) { if (e.target === o) fn(); });
}

function imgMgrInit() {
    if (document.body.dataset.pageRole !== 'admin') return;

    // Register with the manager — it owns the tool button + open/close coordination.
    AdminToolManager.register({
        id:      'image-manager',
        label:   '📁 Display Images Folder',
        panelId: 'image-manager-panel',
        order:   20,
        onOpen:  function() {
            if (!imgMgrLoaded) imgMgrLoadAndRender();
            else imgMgrRebuildLocal();
        }
    });

    // Re-render whenever any tool (or this one) modifies ChangeQueue.
    ChangeQueue.subscribe(imgMgrRebuildLocal);

    imgMgrBindClick('image-manager-close', function() { AdminToolManager.close('image-manager'); });
    imgMgrBindClick('image-manager-reload', function() {
        if (imgMgrLoading) return;
        imgMgrLoaded = false;
        imgMgrLoadAndRender();
    });

    const body = document.getElementById('image-manager-body');
    if (body) {
        body.addEventListener('click', function(e) {
            const folderRow = e.target.closest('.img-row-folder');
            if (folderRow) imgMgrToggleFolder(folderRow.dataset.path);
        });
        body.addEventListener('contextmenu', function(e) {
            const row = e.target.closest('.img-row');
            if (!row || !row.dataset.path) return;
            const node = imgMgrFindNode(imgMgrLocalTree, row.dataset.path);
            if (node) imgMgrShowContextMenu(e, node);
        });
        body.addEventListener('dragover', function(e) {
            const row = e.target.closest('.img-row-folder');
            if (!row) return;
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            row.classList.add('folder-drop-hover');
        });
        body.addEventListener('dragleave', function(e) {
            const row = e.target.closest('.img-row-folder');
            if (row) row.classList.remove('folder-drop-hover');
        });
        body.addEventListener('drop', function(e) {
            const row = e.target.closest('.img-row-folder');
            if (row && e.dataTransfer.files && e.dataTransfer.files.length) imgMgrHandleFolderDrop(e, row);
        });
    }

    // Drag-to-input handlers are bound page-wide by image-drag-target.js.

    document.addEventListener('click', function(e) {
        if (imgMgrCtxMenuEl && !imgMgrCtxMenuEl.contains(e.target)) imgMgrHideContextMenu();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        imgMgrHideContextMenu();
        imgMgrHideDeleteModal();
        imgMgrHideUploadModal();
    });

    imgMgrBindOverlayClose('img-delete-modal-overlay', imgMgrHideDeleteModal);
    imgMgrBindOverlayClose('img-upload-modal-overlay', imgMgrHideUploadModal);

    imgMgrBindClick('img-delete-cancel',  imgMgrHideDeleteModal);
    imgMgrBindClick('img-delete-confirm', imgMgrConfirmDelete);
    imgMgrBindClick('img-upload-cancel',  imgMgrHideUploadModal);
    imgMgrBindClick('img-upload-confirm', imgMgrConfirmUpload);

    const dropzone = document.getElementById('img-upload-dropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', function(e) {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            dropzone.classList.add('img-upload-dropzone-hover');
        });
        dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('img-upload-dropzone-hover'); });
        dropzone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropzone.classList.remove('img-upload-dropzone-hover');
            if (e.dataTransfer.files) imgMgrAddFilesToUploadStage(e.dataTransfer.files);
        });
    }
    const fileInput = document.getElementById('img-upload-file-input');
    if (fileInput) fileInput.addEventListener('change', function(e) {
        if (e.target.files) imgMgrAddFilesToUploadStage(e.target.files);
    });

    const preview = document.getElementById('img-upload-preview');
    if (preview) preview.addEventListener('click', function(e) {
        const btn = e.target.closest('.img-upload-preview-remove');
        if (!btn) return;
        const i = parseInt(btn.dataset.i, 10);
        if (!isNaN(i)) {
            imgMgrUploadStaged.splice(i, 1);
            imgMgrRenderUploadPreview();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', imgMgrInit);
} else {
    imgMgrInit();
}
