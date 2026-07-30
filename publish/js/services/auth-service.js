import { getClient, isConfigured } from './supabase-client.js';
import { AUTH_POPUP_PATH } from '../config.js';

const listeners = new Set();
let currentUser = null;

export { isConfigured };

export function getUser() {
    return currentUser;
}

export function onAuthChange(fn) {
    listeners.add(fn);
    fn(currentUser);
    return () => listeners.delete(fn);
}

function emit(user) {
    currentUser = user;
    listeners.forEach(fn => fn(user));
}

function popupUrl() {
    const base = window.location.pathname.replace(/[^/]*$/, '');
    return window.location.origin + base + AUTH_POPUP_PATH;
}

export async function signIn() {
    if (!isConfigured()) throw new Error('Supabase anon key not set in js/config.js');

    // Must be called synchronously from a click or the browser blocks the popup.
    const popup = window.open(popupUrl(), 'phoenix-auth', 'width=520,height=680');
    if (!popup) throw new Error('Popup blocked — allow popups for this site.');

    const client = await getClient();

    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            if (popup.closed) { cleanup(); reject(new Error('Sign-in window closed.')); }
        }, 500);

        function cleanup() {
            clearInterval(timer);
            window.removeEventListener('message', onMessage);
        }

        async function onMessage(event) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== 'phoenix-auth') return;

            cleanup();
            const { error, data } = await client.auth.setSession({
                access_token: event.data.access_token,
                refresh_token: event.data.refresh_token
            });
            if (error) return reject(error);

            emit(data.user);
            resolve(data.user);
        }

        window.addEventListener('message', onMessage);
    });
}

export async function signOut() {
    const client = await getClient();
    await client.auth.signOut();
    emit(null);
}

export async function initAuth() {
    if (!isConfigured()) return null;

    const client = await getClient();
    const { data: { session } } = await client.auth.getSession();
    emit(session?.user ?? null);

    client.auth.onAuthStateChange((_event, s) => emit(s?.user ?? null));
    return currentUser;
}
