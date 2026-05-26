// ─── AuthManager: GitHub PAT auth foundation ──────────────────────────────────
//
// Provides identity + token storage for the post generator. Loads BEFORE the
// other post-gen scripts so its public surface is available to any future
// feature that needs to call the GitHub API.
//
// Public surface:
//     isAuthenticated()    → boolean
//     getStoredToken()     → string (empty if signed out)
//     getCurrentUser()     → { login, avatar } or null
//     GITHUB_OWNER         → string constant
//     GITHUB_REPO          → string constant
//
// All other functions in this file are internal.
//
// Security model is documented in the plan file. Short version: PAT lives in
// localStorage so it persists across reloads but is readable by any script on
// this origin. Acceptable for a small team of trusted authors; not acceptable
// for an admin panel handling third-party data.

// TODO: Fill in your GitHub username. Once set, the "Generate a token" link
// in the sign-in modal will deep-link to a token form pre-scoped to this repo.
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME';
const GITHUB_REPO  = 'Cadre-Test-Site';

const LS_KEYS = {
    pat:    'pg_pat',
    login:  'pg_user_login',
    avatar: 'pg_user_avatar'
};

// ─── Public API ───────────────────────────────────────────────────────────────

function isAuthenticated() {
    return !!localStorage.getItem(LS_KEYS.pat);
}

function getStoredToken() {
    return localStorage.getItem(LS_KEYS.pat) || '';
}

function getCurrentUser() {
    if (!isAuthenticated()) return null;
    return {
        login:  localStorage.getItem(LS_KEYS.login)  || '',
        avatar: localStorage.getItem(LS_KEYS.avatar) || ''
    };
}

// ─── Internals ────────────────────────────────────────────────────────────────

// Minimal local HTML-escape so this module has no dependency on post-gen.js.
function authEscape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function validateAndStorePAT(pat) {
    const res = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': 'Bearer ' + pat,
            'Accept': 'application/vnd.github+json'
        }
    });
    if (!res.ok) throw new Error('Invalid token (' + res.status + ')');
    const user = await res.json();
    localStorage.setItem(LS_KEYS.pat,    pat);
    localStorage.setItem(LS_KEYS.login,  user.login || '');
    localStorage.setItem(LS_KEYS.avatar, user.avatar_url || '');
    return user;
}

function signOut() {
    Object.values(LS_KEYS).forEach(function(k) { localStorage.removeItem(k); });
    renderAuthUI();
}

function renderAuthUI() {
    const chip = document.getElementById('auth-chip');
    if (!chip) return;
    const user = getCurrentUser();
    if (user) {
        chip.innerHTML = '<div class="auth-user">'
            + '<img src="' + authEscape(user.avatar) + '" alt="" class="auth-avatar">'
            + '<span class="auth-login">' + authEscape(user.login) + '</span>'
            + '<button class="btn-header-action" id="btn-sign-out" title="Sign out">⎋</button>'
            + '</div>';
    } else {
        chip.innerHTML = '<button class="btn-header-action" id="btn-sign-in">🔒 Sign in</button>';
    }
}

// ─── Modal handling ──────────────────────────────────────────────────────────

function buildGenerateTokenUrl() {
    return 'https://github.com/settings/personal-access-tokens/new'
        + '?target_name=' + encodeURIComponent(GITHUB_OWNER)
        + '&repository_names=' + encodeURIComponent(GITHUB_REPO)
        + '&permissions=contents:write,metadata:read'
        + '&description=Cadre%20Post%20Generator';
}

function openAuthModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (!overlay) return;
    document.getElementById('auth-generate-link').href = buildGenerateTokenUrl();
    document.getElementById('auth-pat-input').value = '';
    hideAuthError();
    overlay.style.display = 'flex';
    setTimeout(function() {
        const input = document.getElementById('auth-pat-input');
        if (input) input.focus();
    }, 50);
}

function closeAuthModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function isAuthModalOpen() {
    const overlay = document.getElementById('auth-modal-overlay');
    return overlay && overlay.style.display === 'flex';
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
}

function hideAuthError() {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
}

async function handleSignInSubmit() {
    const input = document.getElementById('auth-pat-input');
    const btn   = document.getElementById('auth-modal-confirm');
    if (!input || !btn) return;
    const pat = input.value.trim();
    if (!pat) { showAuthError('Please paste a token.'); return; }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Signing in…';
    hideAuthError();

    try {
        await validateAndStorePAT(pat);
        closeAuthModal();
        renderAuthUI();
    } catch (err) {
        showAuthError(err && err.message ? err.message : 'Sign-in failed.');
    } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
    }
}

// ─── Wiring ──────────────────────────────────────────────────────────────────

// Chip uses event delegation because its inner button is re-rendered on
// sign-in / sign-out — one listener, survives re-renders.
document.getElementById('auth-chip').addEventListener('click', function(e) {
    if (e.target.closest('#btn-sign-in'))  { openAuthModal(); return; }
    if (e.target.closest('#btn-sign-out')) { signOut(); return; }
});

document.getElementById('auth-modal-cancel').addEventListener('click', closeAuthModal);
document.getElementById('auth-modal-confirm').addEventListener('click', handleSignInSubmit);

document.getElementById('auth-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeAuthModal();
});

// Enter submits the form; Esc dismisses the modal.
document.getElementById('auth-pat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSignInSubmit(); }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isAuthModalOpen()) closeAuthModal();
});

// Initial paint based on whatever's in localStorage.
renderAuthUI();
