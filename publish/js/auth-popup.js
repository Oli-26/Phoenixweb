import { getClient, isConfigured } from './services/supabase-client.js';

const heading = document.getElementById('auth-heading');
const detail = document.getElementById('auth-detail');

function show(title, message, isError = false) {
    heading.textContent = title;
    detail.textContent = message;
    detail.classList.toggle('auth-error', isError);
}

// The app window may be a cross-origin iframe, so its storage is partitioned away from
// this popup's. Hand the session over explicitly rather than relying on shared storage.
function handOffToOpener(session) {
    if (!window.opener) return false;
    window.opener.postMessage({
        type: 'phoenix-auth',
        access_token: session.access_token,
        refresh_token: session.refresh_token
    }, window.location.origin);
    return true;
}

async function run() {
    if (!isConfigured()) {
        show('Not configured', 'Add your Supabase anon key to js/config.js first.', true);
        return;
    }

    const client = await getClient({ detectSessionInUrl: true });
    const params = new URLSearchParams(window.location.search);

    if (params.has('error')) {
        show('Sign-in cancelled', params.get('error_description') || params.get('error'), true);
        return;
    }

    // supabase-js exchanges the ?code= for a session during client init.
    const { data: { session } } = await client.auth.getSession();

    if (session) {
        const delivered = handOffToOpener(session);
        show('Signed in', delivered ? 'You can close this window.' : 'Signed in — return to the app.');
        if (delivered) setTimeout(() => window.close(), 600);
        return;
    }

    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
    });

    if (error) show('Sign-in failed', error.message, true);
}

run().catch(err => show('Sign-in failed', err.message, true));
