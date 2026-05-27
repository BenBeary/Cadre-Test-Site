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
    let currentJson, addedAnnouncements = 0, addedEvents = 0;
    const pending = ChangeQueue.list().find(function(a) { return a.type === 'updateBlogIndex'; });
    try {
        if (pending) {
            currentJson = JSON.parse(pending.content);
            addedAnnouncements = pending.addedAnnouncements || 0;
            addedEvents        = pending.addedEvents || 0;
        } else {
            const resp = await ghFetch('GET', '/contents/' + BLOG_DATA_PATH);
            currentJson = JSON.parse(pbDecodeBase64Utf8(resp.content));
        }
    } catch (err) {
        alert('Failed to load ' + BLOG_DATA_PATH + ' from GitHub:\n' + (err.message || err));
        return;
    }

    if (!Array.isArray(currentJson[target])) currentJson[target] = [];
    currentJson[target].push(entry);
    if (target === 'announcements') addedAnnouncements++;
    else if (target === 'events')   addedEvents++;

    const newJsonContent = JSON.stringify(currentJson, null, 4);
    const totalAdded = addedAnnouncements + addedEvents;

    // Queue the HTML publish (always a new entry)
    ChangeQueue.add({
        type:    'publishHtml',
        path:    htmlPath,
        content: html
    });

    // Replace-or-add the JSON-index update so multiple publishes stack into one PUT
    ChangeQueue.replaceOrAdd(
        function(a) { return a.type === 'updateBlogIndex'; },
        {
            type:               'updateBlogIndex',
            path:               BLOG_DATA_PATH,
            content:            newJsonContent,
            addedAnnouncements: addedAnnouncements,
            addedEvents:        addedEvents,
            addedFor:           target,
            addedCount:         totalAdded
        }
    );

    // Open Show Changes so the user can see what just got staged
    if (typeof AdminToolManager !== 'undefined') AdminToolManager.open('show-changes');
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
