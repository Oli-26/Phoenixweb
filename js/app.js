import { loadAbilities } from './services/ability-service.js';
import { loadMobs } from './services/mob-service.js';
import * as browser from './pages/browser.js';
import * as library from './pages/library.js';
import * as mobBrowser from './pages/mob-browser.js';
import { initNavbar } from './components/navbar.js';
import { initAuth } from './services/auth-service.js';

const routes = {
    '/': browser,
    '/library': library,
    '/barbarus': {
        render: () => mobBrowser.render('barbarus'),
        init: () => mobBrowser.init('barbarus')
    },
    '/rifts': {
        render: () => mobBrowser.render('rifts'),
        init: () => mobBrowser.init('rifts')
    },
    '/city': {
        render: () => mobBrowser.render('city'),
        init: () => mobBrowser.init('city')
    }
};

function getRoute() {
    const hash = location.hash.replace('#', '') || '/';
    return hash;
}

function navigate() {
    const path = getRoute();
    const page = routes[path] || routes['/'];
    const app = document.getElementById('app');
    app.innerHTML = page.render();
    page.init();
    initNavbar();
}

async function start() {
    await Promise.all([
        loadAbilities(),
        loadMobs('barbarus'),
        loadMobs('rifts'),
        loadMobs('city')
    ]);
    navigate();
    window.addEventListener('hashchange', navigate);

    // Non-blocking: the app is fully usable signed-out, so auth must never gate startup.
    initAuth().catch(err => console.warn('Auth init failed:', err.message));

    // Global Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlays = document.querySelectorAll('.modal-overlay');
            for (const overlay of overlays) {
                if (overlay.style.display !== 'none' && overlay.style.display !== '') {
                    overlay.style.display = 'none';
                    break;
                }
            }
        }
    });
}

start();
