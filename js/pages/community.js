import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard } from '../components/ability-card.js';
import { renderMobCard } from '../components/mob-card.js';
import { escapeHtml } from '../utils/sanitize.js';
import { renderMarkdown, markdownToPlain } from '../utils/markdown.js';
import {
    listPublic, loadMyVotes, setVote, reportDesign, isPublishingAvailable
} from '../services/design-service.js';
import { isConfigured } from '../services/supabase-client.js';
import { saveCustomAbility, saveCustomMob } from '../services/storage-service.js';

let entries = [];
let kindFilter = 'all';
let sort = 'new';
let searchTerm = '';
let searchDebounceTimer = null;
let selectedTags = [];
let excludedTags = [];
// Built from whatever is published, since community designs have no canonical tag list.
let availableTags = [];
// Design row ids copied this session, so the button can report itself.
const copied = new Set();
let myVotes = new Set();
const reportedThisSession = new Set();

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

function tagsOf({ item }) {
    return item.data.tags || [];
}

function visible() {
    let results = entries;

    if (kindFilter !== 'all') {
        results = results.filter(e => e.kind === kindFilter);
    }

    if (selectedTags.length > 0) {
        results = results.filter(e => selectedTags.every(t => tagsOf(e).includes(t)));
    }

    if (excludedTags.length > 0) {
        results = results.filter(e => !excludedTags.some(t => tagsOf(e).includes(t)));
    }

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(e =>
            titleOf(e).toLowerCase().includes(term) ||
            descriptionOf(e).toLowerCase().includes(term) ||
            tagsOf(e).some(t => t.toLowerCase().includes(term))
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
                    <input type="text" class="search-input" placeholder="Search designs and tags..."
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
                    <div class="filter-group">
                        <div class="filter-label">Sort</div>
                        <div class="numeric-filters community-kind-filters" id="community-sort">
                            <button data-sort="new">Newest</button>
                            <button data-sort="top">Most liked</button>
                        </div>
                    </div>
                </div>
                <div class="filter-section" id="community-tag-section" style="display:none;">
                    <div class="filter-header">
                        <span>Filter by Tags</span>
                        <button class="clear-filters" id="community-clear-tags" style="display:none;">Clear Tags</button>
                    </div>
                    <div class="tag-filters" id="community-tag-filters"></div>
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
    </div>

    <div id="community-extra-info-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="background: var(--surface, white); padding: 0; max-height: 80vh; max-width: 550px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="community-extra-info-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="community-extra-info-body"></div>
        </div>
    </div>`;
}

function renderGrid() {
    const items = visible();
    if (items.length === 0) {
        return `<div class="no-results"><p>${entries.length === 0
            ? 'Nothing published yet. Approved designs show up here.'
            : 'No designs match those filters.'}</p></div>`;
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
                <span class="community-vote-tally ${myVotes.has(row.id) ? 'voted' : ''}">👍 ${row.vote_count || 0}</span>
            </div>
        </div>`;
    }).join('');
}

function tagStateClass(tag) {
    if (selectedTags.includes(tag)) return 'active';
    if (excludedTags.includes(tag)) return 'excluded';
    return '';
}

function tagAffix(tag) {
    if (selectedTags.includes(tag)) return '<span class="tag-close">&times;</span>';
    if (excludedTags.includes(tag)) return '<span class="tag-close">&minus;</span>';
    return '';
}

function renderTagFilters() {
    const section = document.getElementById('community-tag-section');
    const container = document.getElementById('community-tag-filters');
    if (!section || !container) return;

    section.style.display = availableTags.length > 0 ? '' : 'none';
    container.innerHTML = availableTags.map(tag =>
        `<button class="filter-tag ${tagStateClass(tag)}" data-tag="${escapeHtml(tag)}" title="Click to include, again to exclude">
            ${escapeHtml(tag)}${tagAffix(tag)}
        </button>`
    ).join('');

    const clear = document.getElementById('community-clear-tags');
    if (clear) {
        clear.style.display = selectedTags.length > 0 || excludedTags.length > 0 ? '' : 'none';
    }
}

// Off -> include -> exclude -> off, matching the ability and mob browsers.
function toggleTag(tag) {
    const inc = selectedTags.indexOf(tag);
    const exc = excludedTags.indexOf(tag);

    if (inc !== -1) {
        selectedTags.splice(inc, 1);
        excludedTags.push(tag);
    } else if (exc !== -1) {
        excludedTags.splice(exc, 1);
    } else {
        selectedTags.push(tag);
    }

    renderTagFilters();
    refreshGrid();
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
    const signedIn = isPublishingAvailable();
    const voted = myVotes.has(row.id);
    const reported = reportedThisSession.has(row.id);

    body.innerHTML = `
        <div class="community-modal-head">
            <span class="community-meta">${kind === 'ability' ? 'Ability' : 'Mob'} · shared ${escapeHtml(shared)}</span>
            <div class="community-modal-actions">
                <button class="modal-action-btn community-vote-btn ${voted ? 'voted' : ''}"
                    ${signedIn ? '' : 'disabled title="Sign in to vote"'}>
                    👍 <span class="community-vote-count">${row.vote_count || 0}</span>
                </button>
                <button class="modal-action-btn community-copy-btn" ${done ? 'disabled' : ''}>
                    ${done ? '✓ Copied to library' : 'Copy to my library'}
                </button>
                <button class="modal-action-btn community-report-btn"
                    ${signedIn && !reported ? '' : 'disabled'}
                    title="${signedIn ? 'Report this design' : 'Sign in to report'}">
                    ${reported ? 'Reported' : 'Report'}
                </button>
            </div>
        </div>
        <div class="community-preview">
            ${kind === 'ability' ? renderAbilityCard(item) : renderMobCard(item, item.world)}
        </div>`;

    const extraBtn = body.querySelector('.ability-extra-info-btn, .mob-extra-info-btn');
    if (extraBtn) {
        extraBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openExtraInfo(entry);
        });
    }

    const voteBtn = body.querySelector('.community-vote-btn');
    if (signedIn) {
        voteBtn.addEventListener('click', async () => {
            const next = !myVotes.has(row.id);
            voteBtn.disabled = true;
            try {
                const count = await setVote(row.id, next);
                if (next) myVotes.add(row.id); else myVotes.delete(row.id);
                row.vote_count = count;
                voteBtn.classList.toggle('voted', next);
                voteBtn.querySelector('.community-vote-count').textContent = count;
                refreshGrid();
            } catch (err) {
                alert('Could not save your vote: ' + err.message);
            }
            voteBtn.disabled = false;
        });
    }

    const reportBtn = body.querySelector('.community-report-btn');
    if (signedIn && !reported) {
        reportBtn.addEventListener('click', async () => {
            const reason = prompt('What is wrong with this design?');
            if (reason === null) return;
            if (!reason.trim()) {
                alert('Give a reason so a moderator knows what to look at.');
                return;
            }

            reportBtn.disabled = true;
            try {
                await reportDesign(row.id, reason.trim().slice(0, 500));
                reportedThisSession.add(row.id);
                reportBtn.textContent = 'Reported';
                alert('Thanks — a moderator will take a look.');
            } catch (err) {
                reportBtn.disabled = false;
                alert('Could not send the report: ' + err.message);
            }
        });
    }

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

function openExtraInfo(entry) {
    const overlay = document.getElementById('community-extra-info-overlay');
    const body = document.getElementById('community-extra-info-body');
    if (!overlay || !body) return;

    overlay.style.display = 'flex';
    body.innerHTML = `
        <div class="extra-info-modal">
            <div class="extra-info-header">
                <h2>${escapeHtml(titleOf(entry))}</h2>
                <span class="extra-info-subtitle">Supporting Information</span>
            </div>
            <div class="extra-info-body-content">
                ${renderMarkdown(entry.item.data.extraInfo)}
            </div>
        </div>`;
}

function closeExtraInfo() {
    const overlay = document.getElementById('community-extra-info-overlay');
    if (overlay) overlay.style.display = 'none';
}

function updateKindButtons() {
    document.querySelectorAll('#community-kind button').forEach(btn => {
        btn.className = btn.dataset.kind === kindFilter ? 'active' : '';
    });
    document.querySelectorAll('#community-sort button').forEach(btn => {
        btn.className = btn.dataset.sort === sort ? 'active' : '';
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

    const sorts = document.getElementById('community-sort');
    if (sorts) {
        sorts.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-sort]');
            if (!btn || btn.dataset.sort === sort) return;
            sort = btn.dataset.sort;
            updateKindButtons();
            load();   // ordering is applied server-side, over all 200 rows
        });
    }

    const tagFilters = document.getElementById('community-tag-filters');
    if (tagFilters) {
        tagFilters.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-tag]');
            if (!btn) return;
            toggleTag(btn.dataset.tag);
        });
    }

    document.getElementById('community-clear-tags')?.addEventListener('click', () => {
        selectedTags = [];
        excludedTags = [];
        renderTagFilters();
        refreshGrid();
    });

    document.getElementById('community-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('community-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'community-modal-overlay') closeModal();
    });

    document.getElementById('community-extra-info-close')?.addEventListener('click', closeExtraInfo);
    document.getElementById('community-extra-info-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'community-extra-info-overlay') closeExtraInfo();
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
        entries = await listPublic({ sort });
    } catch (err) {
        grid.innerHTML = `<div class="no-results"><p>Could not load community designs: ${escapeHtml(err.message)}</p></div>`;
        return;
    }

    // Own votes are a separate read, and a failure there must not blank the list.
    try {
        myVotes = await loadMyVotes();
    } catch {
        myVotes = new Set();
    }

    const seen = new Set(entries.flatMap(tagsOf));
    availableTags = [...seen].sort((a, b) => a.localeCompare(b));
    // A re-sort can drop a tag that no longer appears in the returned rows.
    selectedTags = selectedTags.filter(t => seen.has(t));
    excludedTags = excludedTags.filter(t => seen.has(t));

    renderTagFilters();
    refreshGrid();
}
