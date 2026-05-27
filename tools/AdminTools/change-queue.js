/* ChangeQueue — shared pending-actions buffer for the admin tools.

   Any admin tool that wants to stage a write pushes here; the Show Changes
   panel + the sidebar Commit button subscribe and update on every modification.

   On commit, ChangeQueue.toBatchChanges() yields the changes[] array that
   ghBatchCommit() consumes. Action shapes:

       { type: 'createFolder', path }
       { type: 'uploadFile',   path, base64, name?, size? }
       { type: 'deleteFile',   path, sha }
       { type: 'deleteFolder', path, containedFiles: [{path, sha}, …] }

   To add a new action type later: extend the switches in labelFor /
   summarize / toBatchChanges below. (If a third+ tool needs more types,
   refactor to a type registry then — for now in-place dispatch keeps it
   obvious.)

   Loaded on tools/post-generator-admin.html after admin-tool-manager.js,
   before any concrete admin tool script. */

const ChangeQueue = (function () {
    const items = [];
    const subs = [];

    function emit() {
        subs.forEach(function(fn) {
            try { fn(); } catch (e) { console.error('ChangeQueue subscriber', e); }
        });
    }

    function labelFor(a) {
        if (a.type === 'createFolder') return 'Create folder: ' + a.path;
        if (a.type === 'uploadFile')   return 'Upload: ' + a.path;
        if (a.type === 'deleteFile')   return 'Delete: ' + a.path;
        if (a.type === 'deleteFolder') return 'Delete folder: ' + a.path + '/ (' + a.containedFiles.length + ' files)';
        return a.type + ': ' + (a.path || '?');
    }

    function summarize() {
        let creates = 0, uploads = 0, deletes = 0;
        items.forEach(function(a) {
            if      (a.type === 'createFolder') creates++;
            else if (a.type === 'uploadFile')   uploads++;
            else if (a.type === 'deleteFile')   deletes++;
            else if (a.type === 'deleteFolder') deletes += a.containedFiles.length;
        });
        const parts = [];
        if (uploads) parts.push('+' + uploads + ' upload'   + (uploads === 1 ? '' : 's'));
        if (creates) parts.push('+' + creates + ' folder'   + (creates === 1 ? '' : 's'));
        if (deletes) parts.push('−' + deletes + ' deletion' + (deletes === 1 ? '' : 's'));
        return parts.join(', ') || 'no changes';
    }

    function toBatchChanges() {
        const out = [];
        items.forEach(function(a) {
            if (a.type === 'createFolder') {
                out.push({ op: 'put', path: a.path + '/.gitkeep', content: '' });
            } else if (a.type === 'uploadFile') {
                out.push({ op: 'putB64', path: a.path, base64: a.base64 });
            } else if (a.type === 'deleteFile') {
                out.push({ op: 'delete', path: a.path });
            } else if (a.type === 'deleteFolder') {
                a.containedFiles.forEach(function(f) {
                    out.push({ op: 'delete', path: f.path });
                });
            }
        });
        return out;
    }

    return {
        add:       function(a) { items.push(a); emit(); },
        removeAt:  function(i) { if (i >= 0 && i < items.length) { items.splice(i, 1); emit(); } },
        pop:       function() { if (items.length) { items.pop(); emit(); } },
        clear:     function() { if (items.length) { items.length = 0; emit(); } },
        list:      function() { return items.slice(); },
        get length() { return items.length; },
        subscribe: function(fn) {
            subs.push(fn);
            return function unsub() {
                const i = subs.indexOf(fn);
                if (i >= 0) subs.splice(i, 1);
            };
        },
        labelFor:        labelFor,
        summarize:       summarize,
        toBatchChanges:  toBatchChanges
    };
})();
