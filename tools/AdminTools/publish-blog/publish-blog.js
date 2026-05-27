/* Publish Blog — admin-only feature.
   Renames the existing "Generate Post HTML" button to "📤 Publish Blog" on the
   admin page and adds a click handler that opens a popup asking
   Announcement vs Event. On choice, stages two ChangeQueue actions:

       publishHtml      → PUT Announcements-Blogs/<filename>.html
       updateBlogIndex  → PUT json/blog-data.json with the new entry appended
                          to the chosen array

   Multiple publishes before committing stack: each adds a publishHtml and
   replaces the singleton updateBlogIndex with one that contains the running
   set of new entries. */

const BLOG_DATA_PATH = 'json/blog-data.json';

function pbBindClick(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
}

function pbUpdateButtonState() {
    const btn = document.getElementById('btn-generate');
    if (!btn) return;
    const builder = document.getElementById('content-builder');
    const hasBlocks = !!builder && !!builder.querySelector('.block-item');
    btn.disabled = !hasBlocks;
}

function pbInit() {
    if (document.body.dataset.pageRole !== 'admin') return;

    // Rename the button AND replace post-gen.js's listener with ours.
    // Cloning the node strips every listener attached via addEventListener,
    // so the legacy "fill the output textareas + scroll" behaviour is gone
    // on the admin page. The button now only opens the publish modal.
    const oldBtn = document.getElementById('btn-generate');
    if (oldBtn && oldBtn.parentNode) {
        const newBtn = oldBtn.cloneNode(false);
        newBtn.textContent = '📤 Publish Blog';
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.addEventListener('click', pbOpenModal);
    }

    // Disable Publish Blog whenever the content builder has no blocks.
    // post-gen.js mutates #content-builder's children via innerHTML when blocks
    // are added/removed/loaded, so a childList MutationObserver catches every
    // state change cleanly.
    const builder = document.getElementById('content-builder');
    if (builder) {
        const obs = new MutationObserver(pbUpdateButtonState);
        obs.observe(builder, { childList: true, subtree: false });
    }
    pbUpdateButtonState();

    pbBindClick('publish-modal-cancel',   pbCloseModal);
    pbBindClick('publish-modal-announce', function() { pbDoPublish('announcements'); });
    pbBindClick('publish-modal-event',    function() { pbDoPublish('events'); });

    const overlay = document.getElementById('publish-modal-overlay');
    if (overlay) overlay.addEventListener('click', function(e) {
        if (e.target === overlay) pbCloseModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') pbCloseModal();
    });
}

function pbOpenModal() {
    // post-gen.js's handler used to do these — we replaced its listener so we
    // own the validation + DOM-sync now.
    if (typeof state === 'undefined' || !state.templateId) {
        alert('Please choose a template first.');
        return;
    }
    if (typeof syncBlocksFromDOM === 'function')      syncBlocksFromDOM();
    if (typeof syncContributorsFromDOM === 'function') syncContributorsFromDOM();

    if (typeof getFilename !== 'function') return;
    const filename = getFilename();
    if (!filename) {
        alert('Please enter a filename before publishing.');
        return;
    }
    // Reserved filenames in Announcements-Blogs/ that must never be overwritten.
    const reserved = ['index.html', 'base-template.html'];
    if (reserved.indexOf(filename.toLowerCase()) !== -1) {
        alert('"' + filename + '" is reserved by the site (index / base template). Please choose a different filename.');
        return;
    }
    const fnEl = document.getElementById('publish-modal-filename');
    if (fnEl) fnEl.textContent = filename;

    const overlay = document.getElementById('publish-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function pbCloseModal() {
    const overlay = document.getElementById('publish-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

async function pbDoPublish(target /* 'announcements' | 'events' */) {
    pbCloseModal();

    if (typeof buildFullHTML !== 'function' || typeof buildJSONEntry !== 'function') {
        alert('Build functions unavailable — refresh the page.');
        return;
    }

    // Build HTML
    const html = buildFullHTML();
    if (!html) return;  // build alerted already

    // Build & parse the JSON entry (post-gen-output emits a string with trailing comma)
    const entryStr = buildJSONEntry().trim();
    const clean = entryStr.endsWith(',') ? entryStr.slice(0, -1) : entryStr;
    let entry;
    try { entry = JSON.parse(clean); }
    catch (err) { alert('Failed to parse generated JSON entry: ' + err.message); return; }

    const filename = getFilename();
    const htmlPath = 'Announcements-Blogs/' + filename;

    // Fetch (or reuse pending) blog-data.json content
    let currentJson;
    const pending = ChangeQueue.list().find(function(a) { return a.type === 'updateBlogIndex'; });
    try {
        if (pending) {
            currentJson = JSON.parse(pending.content);
        } else {
            const resp = await ghFetch('GET', '/contents/' + BLOG_DATA_PATH);
            currentJson = JSON.parse(pbDecodeBase64Utf8(resp.content));
        }
    } catch (err) {
        alert('Failed to load ' + BLOG_DATA_PATH + ' from GitHub:\n' + (err.message || err));
        return;
    }

    // Collision check — does an entry already exist at this href (either on
    // the server or staged from an earlier publish this session)?
    const existing = pbFindEntryByHref(currentJson, htmlPath);
    let originalEntry  = null;
    let originalTarget = null;

    if (existing) {
        const ok = await pbConfirmOverwrite(existing, target, htmlPath);
        if (!ok) return;

        // Chain through any prior pending publishHtml for the same path so
        // the TRUE server-original entry is preserved across multiple overwrites.
        const priorPub = ChangeQueue.list().find(function(a) {
            return a.type === 'publishHtml' && a.path === htmlPath;
        });
        if (priorPub) {
            originalEntry  = priorPub.originalEntry;
            originalTarget = priorPub.originalTarget;
        } else {
            originalEntry  = existing.entry;
            originalTarget = existing.array;
        }

        // Remove the existing entry from its current array (could be either array)
        currentJson[existing.array].splice(existing.index, 1);
    }

    // Add the new entry to the chosen target array
    if (!Array.isArray(currentJson[target])) currentJson[target] = [];
    currentJson[target].push(entry);

    const newJsonContent = JSON.stringify(currentJson, null, 4);

    // Queue/replace the publishHtml action (replaceOrAdd dedups when the user
    // re-publishes the same filename without committing in between)
    ChangeQueue.replaceOrAdd(
        function(a) { return a.type === 'publishHtml' && a.path === htmlPath; },
        {
            type:           'publishHtml',
            path:           htmlPath,
            content:        html,
            target:         target,
            entry:          entry,
            originalEntry:  originalEntry,
            originalTarget: originalTarget
        }
    );

    // Recompute the bundled JSON update — counts reflect TRUE additions only
    // (overwrites don't count, since net entries didn't change for them).
    const stats = pbCountPublishStats();
    ChangeQueue.replaceOrAdd(
        function(a) { return a.type === 'updateBlogIndex'; },
        {
            type:               'updateBlogIndex',
            path:               BLOG_DATA_PATH,
            content:            newJsonContent,
            addedAnnouncements: stats.announcements,
            addedEvents:        stats.events,
            addedFor:           target,
            addedCount:         stats.announcements + stats.events
        }
    );

    // Open Show Changes so the user can see what just got staged
    if (typeof AdminToolManager !== 'undefined') AdminToolManager.open('show-changes');
}

function pbFindEntryByHref(json, href) {
    const arrays = ['announcements', 'events'];
    for (let a = 0; a < arrays.length; a++) {
        const arr = json[arrays[a]];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].href === href) {
                return { array: arrays[a], index: i, entry: arr[i] };
            }
        }
    }
    return null;
}

function pbCountPublishStats() {
    let a = 0, e = 0;
    ChangeQueue.list().forEach(function(act) {
        if (act.type !== 'publishHtml') return;
        if (act.originalEntry) return;  // overwrites don't change the net count
        if (act.target === 'announcements') a++;
        else if (act.target === 'events')   e++;
    });
    return { announcements: a, events: e };
}

function pbConfirmOverwrite(existing, newTarget, htmlPath) {
    return new Promise(function(resolve) {
        const overlay = document.getElementById('publish-overwrite-modal-overlay');
        if (!overlay) { resolve(false); return; }

        document.getElementById('publish-overwrite-path').textContent          = htmlPath;
        document.getElementById('publish-overwrite-existing-title').textContent = existing.entry.title || '(no title)';
        document.getElementById('publish-overwrite-existing-date').textContent  = existing.entry.date  || '(no date)';
        document.getElementById('publish-overwrite-existing-array').textContent = existing.array;
        document.getElementById('publish-overwrite-new-array').textContent      = newTarget;

        const confirmBtn = document.getElementById('publish-overwrite-confirm');
        const cancelBtn  = document.getElementById('publish-overwrite-cancel');

        function cleanup() {
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
        }
        function onConfirm()  { cleanup(); overlay.style.display = 'none'; resolve(true); }
        function onCancel()   { cleanup(); overlay.style.display = 'none'; resolve(false); }
        function onBackdrop(e){ if (e.target === overlay) onCancel(); }
        function onKey(e)     { if (e.key === 'Escape') onCancel(); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
        overlay.style.display = 'flex';
    });
}

// Decode GitHub's base64 (with line breaks) as UTF-8 text.
function pbDecodeBase64Utf8(b64WithBreaks) {
    const binary = atob(b64WithBreaks.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pbInit);
} else {
    pbInit();
}
