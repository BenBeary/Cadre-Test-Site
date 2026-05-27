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
    const root = { name: 'images', path: 'images', type: 'folder', children: [] };
    const folderMap = new Map();
    folderMap.set('images', root);

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/')) return;
        if (e.type !== 'tree') return;
        const node = { name: e.path.split('/').pop(), path: e.path, type: 'folder', children: [] };
        folderMap.set(e.path, node);
    });

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/')) return;
        if (e.type !== 'tree') return;
        const parentPath = e.path.split('/').slice(0, -1).join('/');
        const parent = folderMap.get(parentPath);
        const node = folderMap.get(e.path);
        if (parent && node) parent.children.push(node);
    });

    flatEntries.forEach(function(e) {
        if (!e.path.startsWith('images/')) return;
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
                parent.children.push({ name: a.path.split('/').pop(), path: a.path, type: 'image', sha: '(pending)', _pending: 'new' });
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
            if (parent && parent !== 'images') imgMgrExpanded.add(parent);
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
    const pendingClass = node._pending ? ' img-row-pending' : '';
    const tag = node._pending === 'new' ? '<span class="img-row-tag img-row-tag-new">+new</span>' : '';
    if (node.type === 'image') {
        return '<div class="img-row img-row-image' + pendingClass + '" data-path="' + escHtml(node.path)
             + '" data-sha="' + escHtml(node.sha || '') + '" title="' + escHtml(node.path)
             + '" draggable="true" style="padding-left: ' + padLeft + 'px">'
             + '<span class="img-row-icon">🖼</span>'
             + '<span class="img-row-name">' + escHtml(node.name) + '</span>'
             + tag
             + '</div>';
    }
    const isRoot = node.path === 'images';
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
    if (path === 'images') return;
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

// Drag-to-input (drag image rows onto editor path inputs) -------------
const IMG_MGR_DROP_SELECTORS = '#f-thumbnail, #content-builder [data-field="url"], #content-builder [data-slide-url], #contrib-sidebar [data-cf="photo"]';

function imgMgrFindEditorDropTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    return el.closest ? el.closest(IMG_MGR_DROP_SELECTORS) : null;
}

function imgMgrSetupEditorDropTargets() {
    document.addEventListener('dragstart', function(e) {
        const row = e.target.closest && e.target.closest('.img-row-image');
        if (!row) return;
        const path = row.dataset.path;
        if (!path) return;
        e.dataTransfer.setData('text/plain', path);
        e.dataTransfer.setData('application/x-image-path', path);
        e.dataTransfer.effectAllowed = 'copy';
    });

    document.addEventListener('dragover', function(e) {
        const target = imgMgrFindEditorDropTarget(e.target);
        if (!target) return;
        if (!e.dataTransfer.types.includes('application/x-image-path')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        target.classList.add('drop-target-hover');
    });

    document.addEventListener('dragleave', function(e) {
        const target = imgMgrFindEditorDropTarget(e.target);
        if (target) target.classList.remove('drop-target-hover');
    });

    document.addEventListener('drop', function(e) {
        const target = imgMgrFindEditorDropTarget(e.target);
        if (!target) return;
        const path = e.dataTransfer.getData('application/x-image-path');
        if (!path) return;
        e.preventDefault();
        target.classList.remove('drop-target-hover');
        target.value = path;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// Context menu (uses shared .admin-context-menu styles in admin-tools.css) ----
function imgMgrContextMenuItems(node) {
    if (node.type === 'image') {
        return [
            { label: 'Copy Relative Path', action: function() { navigator.clipboard.writeText(node.path).catch(function() {}); } },
            { label: 'Delete', action: function() { imgMgrConfirmDeleteFile(node); } }
        ];
    }
    const isRoot = node.path === 'images';
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

function imgMgrConfirmUpload() {
    if (!imgMgrUploadDest || !imgMgrUploadStaged.length) return;
    const dest = imgMgrUploadDest;
    const destFolder = imgMgrFindNode(imgMgrServerTree, dest);
    imgMgrUploadStaged.forEach(function(f) {
        if (destFolder && destFolder.children.some(function(c) { return c.name === f.name; })) {
            alert('"' + f.name + '" already exists in ' + dest + '. Skipped.');
            return;
        }
        ChangeQueue.add({ type: 'uploadFile', path: dest + '/' + f.name, base64: f.base64, name: f.name, size: f.size });
    });
    imgMgrHideUploadModal();
}

async function imgMgrHandleFolderDrop(e, folderRow) {
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    folderRow.classList.remove('folder-drop-hover');
    const folderPath = folderRow.dataset.path;
    const valid = Array.from(e.dataTransfer.files).filter(function(f) { return f.type === 'image/png' || f.type === 'image/jpeg'; });
    if (!valid.length) return;
    const folder = imgMgrFindNode(imgMgrServerTree, folderPath);
    for (let i = 0; i < valid.length; i++) {
        const f = valid[i];
        if (folder && folder.children.some(function(c) { return c.name === f.name; })) {
            alert('"' + f.name + '" already exists in ' + folderPath + '. Skipped.');
            continue;
        }
        const dataUrl = await imgMgrReadFileDataUrl(f);
        const base64 = dataUrl.split(',')[1];
        ChangeQueue.add({ type: 'uploadFile', path: folderPath + '/' + f.name, base64: base64, name: f.name, size: f.size });
    }
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

    imgMgrSetupEditorDropTargets();

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
