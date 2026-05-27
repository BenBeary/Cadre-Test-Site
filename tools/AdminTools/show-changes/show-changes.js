/* Show Changes — admin tool that displays ChangeQueue contents.

   Owns the commit flow: both the sidebar Commit button (#btn-commit) and the
   in-panel Commit button (#show-changes-commit) call scCommitFromUser(),
   which opens the confirmation modal and on confirm fires ghBatchCommit.

   Loaded on tools/post-generator-admin.html after admin-tool-manager.js,
   change-queue.js, and post-gen.js (escHtml). */

let scCtxMenuEl = null;
let scCommitting = false;

// Render --------------------------------------------------------------
function scRender() {
    const body = document.getElementById('show-changes-body');
    if (!body) {
        scUpdateToolbar();
        scUpdateSidebarCommit();
        return;
    }
    const list = ChangeQueue.list();
    if (list.length === 0) {
        body.innerHTML = '<div class="show-changes-placeholder">No pending changes.</div>';
    } else {
        body.innerHTML = '<ul class="show-changes-list">'
            + list.map(function(a, i) {
                return '<li class="show-changes-item" data-i="' + i + '">'
                     + scTypeTag(a.type)
                     + '<span class="show-changes-item-label">' + escHtml(ChangeQueue.labelFor(a)) + '</span>'
                     + '</li>';
            }).join('')
            + '</ul>';
    }
    scUpdateToolbar();
    scUpdateSidebarCommit();
}

function scTypeTag(type) {
    if (type === 'createFolder') return '<span class="show-changes-tag show-changes-tag-add">+folder</span>';
    if (type === 'uploadFile')   return '<span class="show-changes-tag show-changes-tag-add">+upload</span>';
    if (type === 'deleteFile' || type === 'deleteFolder')
        return '<span class="show-changes-tag show-changes-tag-del">−delete</span>';
    return '<span class="show-changes-tag">' + escHtml(type) + '</span>';
}

function scUpdateToolbar() {
    const n = ChangeQueue.length;
    const disabled = n === 0 || scCommitting;
    const undo   = document.getElementById('show-changes-undo');
    const reset  = document.getElementById('show-changes-reset');
    const commit = document.getElementById('show-changes-commit');
    if (undo)   undo.disabled  = disabled;
    if (reset)  reset.disabled = disabled;
    if (commit) {
        commit.disabled = disabled;
        commit.innerHTML = n > 0 ? '💾 Commit (' + n + ')' : '💾 Commit';
    }
}

function scUpdateSidebarCommit() {
    const btn = document.getElementById('btn-commit');
    if (!btn) return;
    const n = ChangeQueue.length;
    btn.disabled = n === 0 || scCommitting;
    btn.innerHTML = n > 0 ? '💾 Commit (' + n + ')' : '💾 Commit';
}

// Actions -------------------------------------------------------------
function scUndo()  { if (!scCommitting) ChangeQueue.pop(); }
function scReset() { if (!scCommitting) ChangeQueue.clear(); }

function scCommitFromUser() {
    if (!ChangeQueue.length || scCommitting) return;
    AdminToolManager.open('show-changes');
    scOpenCommitModal();
}

// Commit confirmation modal ------------------------------------------
function scOpenCommitModal() {
    const overlay = document.getElementById('commit-modal-overlay');
    if (!overlay) return;
    const list = ChangeQueue.list();
    const count1 = document.getElementById('commit-modal-count');
    const count2 = document.getElementById('commit-modal-count2');
    if (count1) count1.textContent = list.length;
    if (count2) count2.textContent = list.length;
    const listEl = document.getElementById('commit-modal-list');
    if (listEl) listEl.innerHTML = list.map(function(a) {
        return '<li>' + escHtml(ChangeQueue.labelFor(a)) + '</li>';
    }).join('');
    const nameInput = document.getElementById('commit-modal-name');
    if (nameInput) {
        nameInput.value = '';
        nameInput.placeholder = ChangeQueue.summarize();
    }
    overlay.style.display = 'flex';
    setTimeout(function() { if (nameInput) nameInput.focus(); }, 30);
}
function scCloseCommitModal() {
    const o = document.getElementById('commit-modal-overlay');
    if (o) o.style.display = 'none';
}

// Commit execution ---------------------------------------------------
async function scPerformCommit() {
    if (!ChangeQueue.length || scCommitting) return;
    scCloseCommitModal();
    scCommitting = true;
    scUpdateToolbar();
    scUpdateSidebarCommit();
    const total = ChangeQueue.length;
    const nameInput = document.getElementById('commit-modal-name');
    const customName = nameInput ? nameInput.value.trim() : '';
    const message = 'Browser: ' + (customName || ChangeQueue.summarize());
    try {
        const result = await ghBatchCommit({
            message: message,
            changes: ChangeQueue.toBatchChanges(),
            branch:  'main'
        });
        ChangeQueue.clear();
        scCommitting = false;
        if (result.retried) console.info('Show Changes: commit retried once after a race.');
        // Refresh Image Manager tree if it's loaded
        if (typeof imgMgrLoaded !== 'undefined' && imgMgrLoaded && typeof imgMgrLoadAndRender === 'function') {
            imgMgrLoaded = false;
            imgMgrLoadAndRender();
        }
        scUpdateToolbar();
        scUpdateSidebarCommit();
    } catch (err) {
        scCommitting = false;
        scUpdateToolbar();
        scUpdateSidebarCommit();
        scShowConflictModal(err, total);
    }
}

// Conflict modal (DOM IDs kept as img-conflict-* for HTML-stability) -
function scShowConflictModal(err, total) {
    const overlay = document.getElementById('img-conflict-modal-overlay');
    if (!overlay) return;
    document.getElementById('img-conflict-action').textContent = 'Batch commit';
    document.getElementById('img-conflict-path').textContent = '(' + total + ' staged changes)';
    document.getElementById('img-conflict-message').textContent = err.message || String(err);
    const progress = document.getElementById('img-conflict-progress');
    if (progress) {
        progress.innerHTML = '<strong>No changes were committed</strong> — the whole batch was rolled back atomically. Reset to drop the queue and re-fetch, or keep the queue and try Commit again once the conflicting file has settled.';
    }
    overlay.style.display = 'flex';
}
function scHideConflictModal() {
    const o = document.getElementById('img-conflict-modal-overlay');
    if (o) o.style.display = 'none';
}

// Right-click "Remove from queue" -----------------------------------
function scShowContextMenu(e, index) {
    e.preventDefault();
    scHideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'admin-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top  = e.clientY + 'px';
    const item = document.createElement('div');
    item.className = 'admin-context-menu-item';
    item.textContent = 'Remove from queue';
    item.addEventListener('click', function() {
        scHideContextMenu();
        ChangeQueue.removeAt(index);
    });
    menu.appendChild(item);
    document.body.appendChild(menu);
    scCtxMenuEl = menu;
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = (window.innerWidth  - rect.width  - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top  = (window.innerHeight - rect.height - 4) + 'px';
}
function scHideContextMenu() {
    if (scCtxMenuEl) { scCtxMenuEl.remove(); scCtxMenuEl = null; }
}

// Bootstrap ---------------------------------------------------------
function scBindClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}

function scInit() {
    if (document.body.dataset.pageRole !== 'admin') return;

    AdminToolManager.register({
        id:      'show-changes',
        label:   '👁 Show Changes',
        panelId: 'show-changes-panel',
        order:   10,
        onOpen:  scRender
    });

    ChangeQueue.subscribe(scRender);

    scBindClick('show-changes-close',  function() { AdminToolManager.close('show-changes'); });
    scBindClick('show-changes-undo',   scUndo);
    scBindClick('show-changes-reset',  scReset);
    scBindClick('show-changes-commit', scCommitFromUser);
    scBindClick('btn-commit',          scCommitFromUser);

    const body = document.getElementById('show-changes-body');
    if (body) body.addEventListener('contextmenu', function(e) {
        const item = e.target.closest('.show-changes-item');
        if (!item) return;
        const i = parseInt(item.dataset.i, 10);
        if (!isNaN(i)) scShowContextMenu(e, i);
    });

    scBindClick('commit-modal-cancel',  scCloseCommitModal);
    scBindClick('commit-modal-confirm', scPerformCommit);
    const commitOverlay = document.getElementById('commit-modal-overlay');
    if (commitOverlay) commitOverlay.addEventListener('click', function(e) {
        if (e.target === commitOverlay) scCloseCommitModal();
    });

    scBindClick('img-conflict-keep',  scHideConflictModal);
    scBindClick('img-conflict-reset', function() { scHideConflictModal(); scReset(); });
    const conflictOverlay = document.getElementById('img-conflict-modal-overlay');
    if (conflictOverlay) conflictOverlay.addEventListener('click', function(e) {
        if (e.target === conflictOverlay) scHideConflictModal();
    });

    document.addEventListener('click', function(e) {
        if (scCtxMenuEl && !scCtxMenuEl.contains(e.target)) scHideContextMenu();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        scHideContextMenu();
        scCloseCommitModal();
        scHideConflictModal();
    });

    scUpdateSidebarCommit();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scInit);
} else {
    scInit();
}
