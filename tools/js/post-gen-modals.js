/* Shared modal HTML for the post generator. Injected synchronously into
   <div id="post-gen-shared-modals-slot"></div> so the modal IDs exist by
   the time post-gen.js's initElementCache() runs.

   Both post-generator.html and post-generator-admin.html load this script
   BEFORE post-gen.js. Modals that are admin-only (publish, image-manager,
   etc.) still live in post-generator-admin.html — only the modals shared
   verbatim between both pages are inlined here. */

const POST_GEN_SHARED_MODALS_HTML = `
<!-- Full-screen drag-drop overlay -->
<div class="drop-overlay" id="drop-overlay">
    <div class="drop-overlay-inner">
        <div class="drop-overlay-icon">📂</div>
        <div>Drop your save file here</div>
    </div>
</div>

<!-- Preview overlay -->
<div class="preview-overlay" id="preview-overlay" style="display:none">
    <div class="preview-frame-wrap">
        <div class="preview-toolbar">
            <span class="preview-title">Live Preview</span>
            <button class="btn-preview-action" id="btn-preview-refresh" title="Re-render with the latest editor changes">↻ Refresh</button>
            <button class="btn-preview-action" id="btn-preview-newtab" title="Open in a new browser tab">↗ New Tab</button>
            <button class="btn-preview-close" id="btn-preview-close" title="Close (Esc)">✕</button>
        </div>
        <iframe id="preview-iframe" title="Post preview"></iframe>
    </div>
</div>

<!-- Switch template confirmation modal -->
<div class="modal-overlay" id="modal-overlay" style="display:none">
    <div class="modal-box">
        <div class="modal-title">Switch Templates?</div>
        <div class="modal-body">You have content blocks in the editor. Switching templates will replace them with the new template's starting blocks — your current work will be lost.</div>
        <div class="modal-actions">
            <button class="btn-modal-cancel" id="modal-cancel">Keep Editing</button>
            <button class="btn-modal-confirm" id="modal-confirm">Switch Template</button>
        </div>
    </div>
</div>

<!-- Sign-in modal -->
<div class="modal-overlay" id="auth-modal-overlay" style="display:none">
    <div class="modal-box">
        <div class="modal-title">Sign in with GitHub</div>
        <div class="modal-body">
            <p>Paste a fine-grained Personal Access Token scoped to this repo. The token is stored only in this browser's localStorage and is used to authenticate admin features.</p>
            <p><a id="auth-generate-link" href="#" target="_blank" rel="noopener">Generate a token →</a></p>
            <input type="password" id="auth-pat-input" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
            <div class="auth-error" id="auth-error" style="display:none"></div>
        </div>
        <div class="modal-actions">
            <button class="btn-modal-cancel" id="auth-modal-cancel">Cancel</button>
            <button class="btn-modal-confirm" id="auth-modal-confirm">Sign in</button>
        </div>
    </div>
</div>

<!-- Clear post confirmation modal -->
<div class="modal-overlay" id="clear-modal-overlay" style="display:none">
    <div class="modal-box">
        <div class="modal-title">Clear Post?</div>
        <div class="modal-body">This wipes the title, author, date, thumbnail, content blocks, contributors, and the generated output. This cannot be undone.</div>
        <div class="modal-actions">
            <button class="btn-modal-cancel" id="clear-modal-cancel">Keep Editing</button>
            <button class="btn-modal-confirm" id="clear-modal-confirm">Clear Post</button>
        </div>
    </div>
</div>
`;

(function injectPostGenSharedModals() {
    const slot = document.getElementById('post-gen-shared-modals-slot');
    if (slot) slot.outerHTML = POST_GEN_SHARED_MODALS_HTML;
})();
