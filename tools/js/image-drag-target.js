/* Image drag target — document-level dragover/drop wiring for the editor's
   image-path inputs. Extracted from image-manager.js so the basic page's
   image-picker can use the same drop behaviour without depending on the
   admin-only image manager.

   Loaded on BOTH post-generator.html and post-generator-admin.html. Hooks
   are safe to attach unconditionally — they just match nothing on pages
   that don't have draggable image rows. */

const IMG_DRAG_DROP_SELECTORS = '#f-thumbnail, #content-builder [data-field="url"], #content-builder [data-slide-url], #contrib-sidebar [data-cf="photo"]';

function imgDragFindDropTarget(el) {
    if (!el || el.nodeType !== 1) return null;
    return el.closest ? el.closest(IMG_DRAG_DROP_SELECTORS) : null;
}

function imgDragSetup() {
    // Source-side: image rows (admin tree OR basic picker) carry data-path.
    document.addEventListener('dragstart', function(e) {
        const row = e.target.closest && e.target.closest('.img-row-image, .img-picker-image');
        if (!row) return;
        const path = row.dataset.path;
        if (!path) return;
        e.dataTransfer.setData('text/plain', path);
        e.dataTransfer.setData('application/x-image-path', path);
        e.dataTransfer.effectAllowed = 'copy';
    });

    // Target-side: dragover + drop on any editor input that should accept paths.
    document.addEventListener('dragover', function(e) {
        const target = imgDragFindDropTarget(e.target);
        if (!target) return;
        if (!e.dataTransfer.types.includes('application/x-image-path')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        target.classList.add('drop-target-hover');
    });

    document.addEventListener('dragleave', function(e) {
        const target = imgDragFindDropTarget(e.target);
        if (target) target.classList.remove('drop-target-hover');
    });

    document.addEventListener('drop', function(e) {
        const target = imgDragFindDropTarget(e.target);
        if (!target) return;
        const path = e.dataTransfer.getData('application/x-image-path');
        if (!path) return;
        e.preventDefault();
        target.classList.remove('drop-target-hover');
        target.value = path;
        target.dispatchEvent(new Event('input',  { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', imgDragSetup);
} else {
    imgDragSetup();
}
