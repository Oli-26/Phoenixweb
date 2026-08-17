import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard } from '../components/ability-card.js';
import { renderMobCard } from '../components/mob-card.js';
import { escapeHtml } from '../utils/sanitize.js';
import { markdownToPlain } from '../utils/markdown.js';
import { listPublic } from '../services/design-service.js';
import { isConfigured } from '../services/supabase-client.js';
import { saveCustomAbility, saveCustomMob } from '../services/storage-service.js';

let entries = [];
let kindFilter = 'all';
let searchTerm = '';
let searchDebounceTimer = null;
// Design row ids copied this session, so the button can report itself.
const copied = new Set();

function titleOf({ kind, item }) {
    return kind === 'ability' ? item.data.abilityName : item.data.name;
}

function descriptionOf({ kind, item }) {
    return kind === 'ability' ? item.data.abilityDescription : item.data.description;
}

function truncate(text) {
    const plain = markdownToPlain(text);
    if (plain.length <= 100) return plain;
    return plain.substring(0, 97) + '...';
}

function visible() {
    let results = entries;

    if (kindFilter !== 'all') {
        results = results.filter(e => e.kind === kindFilter);
    }

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(e =>
            titleOf(e).toLowerCase().includes(term) ||
            descriptionOf(e).toLowerCase().includes(term)
        );
    }

    return results;
}

export function render() {
    return `
    ${renderNavbar()}
    <div class="ability-browser community-page">
        <div class="browser-header">
            <h1>Community Designs</h1>
            <p class="subtitle">Abilities and mobs shared by other players, after review.</p>
        </div>
        <div class="browser-layout">
            <div class="main-panel">
                <div class="search-section">
                    <input type="text" class="search-input" placeholder="Search community designs..."
                        id="community-search" value="${escapeHtml(searchTerm)}" />
                </div>
                <div class="filters-container">
                    <div class="filter-group">
                        <div class="filter-label">Type</div>
                        <div class="numeric-filters community-kind-filters" id="community-kind">
                            <button data-kind="all">All</button>
                            <button data-kind="ability">Abilities</button>
                            <button data-kind="mob">Mobs</button>
                        </div>
                    </div>
                </div>
                <div class="abilities-grid" id="community-grid">
                    <div class="no-results"><p>Loading…</p></div>
                </div>
            </div>
        </div>
    </div>

    <div id="community-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content community-modal" style="background: var(--gray-50, #f9fafb); padding: 24px; max-height: 90vh; max-width: 90vw; overflow-y: auto; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="community-modal-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="community-modal-body"></div>
        </div>
    </div>`;
}

function renderGrid() {
    const items = visible();
    if (items.length === 0) {
        return `<div class="no-results"><p>${entries.length === 0
            ? 'Nothing published yet. Approved designs show up here.'
            : 'No designs match that search.'}</p></div>`;
    }

    return items.map(entry => {
        const { row, kind, item } = entry;
        const tags = item.data.tags || [];
        return `
        <div class="grid-item" data-design-id="${escapeHtml(row.id)}">
            <div class="grid-item-header">
                <h3>${escapeHtml(titleOf(entry))}</h3>
                <div class="grid-item-stats">
                    <span class="stat-pip power-pip" title="Power">${item.data.power}</span>
                    <span class="stat-pip complexity-pip" title="Complexity">${item.data.complexity}</span>
                </div>
            </div>
            <p class="grid-item-description">${escapeHtml(truncate(descriptionOf(entry)))}</p>
            <div class="grid-item-tags">
                <span class="mini-tag community-kind-tag">${kind === 'ability' ? 'Ability' : 'Mob'}</span>
                ${tags.slice(0, 2).map(t => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}
                ${tags.length > 2 ? `<span class="mini-tag">+${tags.length - 2}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

function refreshGrid() {
    const grid = document.getElementById('community-grid');
    if (!grid) return;
    grid.innerHTML = renderGrid();
}

function openModal(entry) {
    const overlay = document.getElementById('community-modal-overlay');
    const body = document.getElementById('community-modal-body');
    if (!overlay || !body) return;

    const { row, kind, item } = entry;
    const shared = new Date(row.created_at).toLocaleDateString();
    const done = copied.has(row.id);

    overlay.style.display = 'flex';
    // The card's own save button targets the canonical directory by id, which a
    // community design is not in — copying to the library is the action here.
    body.innerHTML = `
        <div class="community-modal-head">
            <span class="community-meta">${kind === 'ability' ? 'Ability' : 'Mob'} · shared ${escapeHtml(shared)}</span>
            <button class="modal-action-btn community-copy-btn" ${done ? 'disabled' : ''}>
                ${done ? '✓ Copied to library' : 'Copy to my library'}
            </button>
        </div>
        <div class="community-preview">
            ${kind === 'ability' ? renderAbilityCard(item) : renderMobCard(item, item.world)}
        </div>`;

    const btn = body.querySelector('.community-copy-btn');
    btn.addEventListener('click', () => {
        // A fresh id, so a copy never overwrites a local design that happens to
        // share the author's local_id.
        const clone = { ...item, id: crypto.randomUUID() };
        if (kind === 'ability') {
            saveCustomAbility(clone);
        } else {
            saveCustomMob(clone);
        }
        copied.add(row.id);
        btn.disabled = true;
        btn.textContent = '✓ Copied to library';
    });
}

function closeModal() {
    const overlay = document.getElementById('community-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updateKindButtons() {
    document.querySelectorAll('#community-kind button').forEach(btn => {
        btn.className = btn.dataset.kind === kindFilter ? 'active' : '';
    });
}

export function init() {
    updateKindButtons();

    const grid = document.getElementById('community-grid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.grid-item');
            if (!card) return;
            const entry = entries.find(x => x.row.id === card.dataset.designId);
            if (entry) openModal(entry);
        });
    }

    const search = document.getElementById('community-search');
    if (search) {
        search.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(refreshGrid, 200);
        });
    }

    const kinds = document.getElementById('community-kind');
    if (kinds) {
        kinds.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-kind]');
            if (!btn) return;
            kindFilter = btn.dataset.kind;
            updateKindButtons();
            refreshGrid();
        });
    }

    document.getElementById('community-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('community-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'community-modal-overlay') closeModal();
    });

    load();
}

async function load() {
    const grid = document.getElementById('community-grid');
    if (!grid) return;

    if (!isConfigured()) {
        grid.innerHTML = '<div class="no-results"><p>Sharing is not configured for this build.</p></div>';
        return;
    }

    try {
        entries = await listPublic();
    } catch (err) {
        grid.innerHTML = `<div class="no-results"><p>Could not load community designs: ${escapeHtml(err.message)}</p></div>`;
        return;
    }
    refreshGrid();
}
