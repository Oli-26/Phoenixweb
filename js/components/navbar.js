import { signIn, signOut, onAuthChange, isConfigured, getUser } from '../services/auth-service.js';
import { isAdmin, loadMyDesigns } from '../services/design-service.js';

// The navbar is re-rendered on every route change, so both the auth
// subscription and the admin lookup have to survive that without stacking up.
let unsubscribeAuth = null;
let adminCached = false;
let adminLoadedFor = null;

export function renderNavbar() {
    const hash = location.hash || '#/';

    function linkClass(path) {
        if (path === '#/' && (hash === '#/' || hash === '' || hash === '#'))
            return 'nav-link active';
        if (path !== '#/' && hash.startsWith(path))
            return 'nav-link active';
        return 'nav-link';
    }

    const mobPaths = ['#/barbarus', '#/rifts', '#/city'];
    const isMobActive = mobPaths.some(p => hash.startsWith(p));

    return `
    <nav class="navbar">
        <div class="navbar-container">
            <button class="nav-hamburger" id="nav-hamburger" aria-label="Toggle menu">
                <span></span>
                <span></span>
                <span></span>
            </button>
            <div class="navbar-links" id="navbar-links">
                <a href="#/" class="${linkClass('#/')}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M9 22V12h6v10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Browser</span>
                </a>
                <div class="nav-dropdown">
                    <a href="#/barbarus" class="nav-link ${isMobActive ? 'active' : ''}">
                        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2" stroke-linecap="round"/>
                            <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <span>Mobs</span>
                        <svg class="nav-dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" width="12" height="12">
                            <path d="M6 9l6 6 6-6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                    <div class="nav-dropdown-content">
                        <a href="#/barbarus" class="${hash === '#/barbarus' ? 'active' : ''}">Barbarus</a>
                        <a href="#/rifts" class="${hash === '#/rifts' ? 'active' : ''}">Rifts & Rivets</a>
                        <a href="#/city" class="${hash === '#/city' ? 'active' : ''}">The City</a>
                    </div>
                </div>
                <a href="#/library" class="${linkClass('#/library')}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Library</span>
                </a>
                <a href="#/community" class="${linkClass('#/community')}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="9" cy="7" r="4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Community</span>
                </a>
                <a href="#/review" class="${linkClass('#/review')}" id="nav-review" ${adminCached ? '' : 'hidden'}>
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M9 11l3 3L22 4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Review</span>
                </a>
            </div>
            <div class="nav-account" id="nav-account"></div>
        </div>
    </nav>`;
}

function renderAccount(container, user) {
    if (user) {
        const name = user.user_metadata?.full_name || user.email || 'Account';
        container.innerHTML = `
            <span class="nav-account-name" title="${user.email || ''}">${name}</span>
            <button class="nav-account-btn" id="nav-signout">Sign out</button>`;
        container.querySelector('#nav-signout').addEventListener('click', () => signOut());
    } else {
        container.innerHTML = `<button class="nav-account-btn" id="nav-signin">Sign in</button>`;
        container.querySelector('#nav-signin').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Signing in…';
            try {
                await signIn();
            } catch (err) {
                btn.disabled = false;
                btn.textContent = 'Sign in';
                console.warn('Sign-in failed:', err.message);
            }
        });
    }
}

// The Review link is a convenience only — RLS is what actually gates the queue.
async function refreshReviewLink() {
    const link = document.getElementById('nav-review');
    if (!link || !isConfigured()) return;

    const userId = getUser()?.id ?? null;
    if (!userId) {
        adminCached = false;
        adminLoadedFor = null;
        link.hidden = true;
        return;
    }

    // Only hit the network when the account actually changed; navigating
    // between pages must not re-query on every render.
    if (adminLoadedFor !== userId) {
        try {
            await loadMyDesigns();
        } catch {
            return;
        }
        adminCached = isAdmin();
        adminLoadedFor = userId;
    }

    link.hidden = !adminCached;
}

function initAccount() {
    const container = document.getElementById('nav-account');
    if (!container || !isConfigured()) return;

    // Re-subscribing on every navigation would leave listeners writing into
    // detached navbars and refire the admin lookup once per stale listener.
    if (unsubscribeAuth) unsubscribeAuth();
    unsubscribeAuth = onAuthChange(user => {
        const el = document.getElementById('nav-account');
        if (el) renderAccount(el, user);
        refreshReviewLink();
    });
}

export function initNavbar() {
    initAccount();

    const hamburger = document.getElementById('nav-hamburger');
    const links = document.getElementById('navbar-links');
    if (!hamburger || !links) return;

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('open');
        links.classList.toggle('open');
    });

    // Mobile dropdown toggle (tap instead of hover)
    const dropdown = links.querySelector('.nav-dropdown');
    if (dropdown) {
        const dropdownLink = dropdown.querySelector('.nav-link');
        if (dropdownLink) {
            dropdownLink.addEventListener('click', (e) => {
                // Only handle as toggle on mobile
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    dropdown.classList.toggle('open');
                }
            });
        }
    }

    // Close menu when a nav link is clicked (mobile)
    links.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('open');
            links.classList.remove('open');
        });
    });

    // Close sub-dropdown links too
    links.querySelectorAll('.nav-dropdown-content a').forEach(link => {
        link.addEventListener('click', () => {
            const dd = links.querySelector('.nav-dropdown');
            if (dd) dd.classList.remove('open');
        });
    });
}
