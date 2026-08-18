import { getAllMobs, getAllTags, getWorldName } from '../services/mob-service.js';
import { renderNavbar } from '../components/navbar.js';
import { renderMobCard, attachMobCardEvents } from '../components/mob-card.js';
import { renderCardActionButtons, attachCardActionEvents } from '../components/card-actions.js';
import { renderMarkdown, markdownToPlain } from '../utils/markdown.js';

let searchTerm = '';
let selectedTags = [];
let excludedTags = [];
let filteredMobs = [];
let allMobs = [];
let allTags = [];
let currentWorld = '';
let searchDebounceTimer = null;

function truncateDescription(description) {
    const plain = markdownToPlain(description);
    if (!plain) return '';
    if (plain.length <= 100) return plain;
    return plain.substring(0, 97) + '...';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function hasActiveFilters() {
    return selectedTags.length > 0 || excludedTags.length > 0 || searchTerm.trim() !== '';
}

function performSearch() {
    let results = allMobs;

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(m =>
            m.data.name.toLowerCase().includes(term) ||
            m.data.description.toLowerCase().includes(term)
        );
    }

    if (selectedTags.length > 0) {
        results = results.filter(m => selectedTags.every(t => m.data.tags.includes(t)));
    }

    if (excludedTags.length > 0) {
        results = results.filter(m => !excludedTags.some(t => m.data.tags.includes(t)));
    }

    filteredMobs = results;
}

function renderGrid() {
    if (filteredMobs.length === 0) {
        return `<div class="no-results">
            <p>No mobs found</p>
            ${hasActiveFilters() ? '<button class="reset-filters-btn" id="reset-filters">Reset Filters</button>' : ''}
        </div>`;
    }

    return filteredMobs.map(mob => `
        <div class="grid-item" data-mob-id="${mob.id}">
            <div class="grid-item-header">
                <h3>${escapeHtml(mob.data.name)}</h3>
                ${(mob.data.power || mob.data.complexity) ? `<div class="grid-item-stats">
                    <span class="stat-pip power-pip" title="Power">${mob.data.power || 0}</span>
                    <span class="stat-pip complexity-pip" title="Complexity">${mob.data.complexity || 0}</span>
                </div>` : ''}
            </div>
            <p class="grid-item-description">${escapeHtml(truncateDescription(mob.data.description))}</p>
            <div class="grid-item-tags">
                ${mob.data.tags.map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

function renderActiveFiltersSummary() {
    if (!hasActiveFilters()) return '';

    const chips = [];
    selectedTags.forEach(t => {
        chips.push(`<span class="filter-chip tag-chip">${escapeHtml(t)}<button class="chip-remove" data-toggle-tag="${escapeHtml(t)}">&times;</button></span>`);
    });
    excludedTags.forEach(t => {
        chips.push(`<span class="filter-chip tag-chip excluded-chip">not ${escapeHtml(t)}<button class="chip-remove" data-toggle-tag="${escapeHtml(t)}">&times;</button></span>`);
    });

    return `<div class="active-filters-summary">
        <span class="results-count">${filteredMobs.length} results</span>
        <div class="active-chips">${chips.join('')}</div>
    </div>`;
}

export function render(world) {
    currentWorld = world;
    searchTerm = '';
    selectedTags = [];
    excludedTags = [];
    allMobs = getAllMobs(world);
    allTags = getAllTags(world);
    filteredMobs = allMobs;

    const worldName = getWorldName(world);

    const tagButtons = allTags.map(tag =>
        `<button class="filter-tag ${tagStateClass(tag)}" data-tag="${escapeHtml(tag)}" title="Click to include, again to exclude">
            ${escapeHtml(tag)}${tagAffix(tag)}
        </button>`
    ).join('');

    return `
    ${renderNavbar()}
    <div class="ability-browser">
        <div class="browser-header">
            <h1>${escapeHtml(worldName)} \u2014 Mob Database</h1>
            <p class="subtitle">Browse and search through ${allMobs.length} creatures</p>
        </div>
        <div class="browser-layout">
            <div class="main-panel">
                <div class="search-section">
                    <input type="text" class="search-input" placeholder="Search mobs..."
                        id="search-input" value="${escapeHtml(searchTerm)}" />
                </div>

                ${hasActiveFilters() ? `
                <div class="filters-container">
                    <button class="clear-all-filters" id="clear-all-filters">
                        <svg class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Clear All
                    </button>
                </div>` : ''}

                <div class="filter-section">
                    <div class="filter-header">
                        <span>Filter by Tags</span>
                        ${selectedTags.length > 0 || excludedTags.length > 0 ? '<button class="clear-filters" id="clear-tags">Clear Tags</button>' : ''}
                    </div>
                    <div class="tag-filters">${tagButtons}</div>
                </div>

                ${renderActiveFiltersSummary()}

                <div class="abilities-grid" id="mobs-grid">
                    ${renderGrid()}
                </div>
            </div>
        </div>
    </div>

    <div id="mob-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="mob-modal-content" style="background: var(--gray-50, #f9fafb); padding: 24px; max-height: 90vh; max-width: 90vw; overflow-y: auto; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="mob-modal-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="mob-modal-body"></div>
        </div>
    </div>

    <div id="extra-info-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="extra-info-content" style="background: var(--surface, white); padding: 0; max-height: 80vh; max-width: 550px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="extra-info-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="extra-info-body"></div>
        </div>
    </div>`;
}

function refreshGrid() {
    performSearch();
    const grid = document.getElementById('mobs-grid');
    if (grid) grid.innerHTML = renderGrid();
    attachGridEvents();

    const mainPanel = document.querySelector('.main-panel');
    const existingSummary = mainPanel?.querySelector('.active-filters-summary');
    const newSummaryHtml = renderActiveFiltersSummary();
    if (existingSummary) {
        if (newSummaryHtml) {
            existingSummary.outerHTML = newSummaryHtml;
        } else {
            existingSummary.remove();
        }
    } else if (newSummaryHtml && grid) {
        grid.insertAdjacentHTML('beforebegin', newSummaryHtml);
    }
    attachChipEvents();
}

function attachGridEvents() {
    const grid = document.getElementById('mobs-grid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const item = e.target.closest('.grid-item[data-mob-id]');
            if (!item) return;
            const id = item.dataset.mobId;
            const mob = allMobs.find(m => m.id === id);
            if (mob) openModal(mob);
        });
    }

    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', clearAllFilters);
    }
}

function attachChipEvents() {
    document.querySelectorAll('.chip-remove[data-toggle-tag]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTag(btn.dataset.toggleTag);
        });
    });
}

// Off -> include -> exclude -> off, so one control covers both filter senses.
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

    refreshGrid();
    updateTagButtons();
}

// The chip's x means "drop this filter", not "advance it to the next state".
function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t !== tag);
    excludedTags = excludedTags.filter(t => t !== tag);
    refreshGrid();
    updateTagButtons();
}

function clearAllFilters() {
    selectedTags = [];
    excludedTags = [];
    searchTerm = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    refreshGrid();
    updateTagButtons();
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

function updateTagButtons() {
    document.querySelectorAll('.filter-tag[data-tag]').forEach(btn => {
        const tag = btn.dataset.tag;
        btn.className = `filter-tag ${tagStateClass(tag)}`.trim();
        const affix = tagAffix(tag);
        const existing = btn.querySelector('.tag-close');
        if (existing) existing.remove();
        if (affix) btn.insertAdjacentHTML('beforeend', affix);
    });
}

function escapeHtmlSafe(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function openModal(mob) {
    const overlay = document.getElementById('mob-modal-overlay');
    const body = document.getElementById('mob-modal-body');
    overlay.style.display = 'flex';
    body.innerHTML = renderCardActionButtons('mob') + renderMobCard(mob, currentWorld);

    // Attach save button
    attachMobCardEvents(mob, currentWorld);
    attachCardActionEvents(body, 'mob', mob, currentWorld);

    // Attach extra info button if present
    const extraBtn = body.querySelector('.mob-extra-info-btn');
    if (extraBtn) {
        extraBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openExtraInfo(mob);
        });
    }
}

function closeModal() {
    document.getElementById('mob-modal-overlay').style.display = 'none';
}

function openExtraInfo(mob) {
    const overlay = document.getElementById('extra-info-overlay');
    const body = document.getElementById('extra-info-body');
    overlay.style.display = 'flex';
    body.innerHTML = `
        <div class="extra-info-modal">
            <div class="extra-info-header">
                <h2>${escapeHtmlSafe(mob.data.name)}</h2>
                <span class="extra-info-subtitle">Supporting Information</span>
            </div>
            <div class="extra-info-body-content">
                ${renderMarkdown(mob.data.extraInfo)}
            </div>
        </div>`;
}

function closeExtraInfo() {
    document.getElementById('extra-info-overlay').style.display = 'none';
}

export function init(world) {
    currentWorld = world;
    searchTerm = '';
    selectedTags = [];
    allMobs = getAllMobs(world);
    allTags = getAllTags(world);
    filteredMobs = allMobs;

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => refreshGrid(), 200);
        });
    }

    document.querySelectorAll('.filter-tag[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => toggleTag(btn.dataset.tag));
    });

    const clearAllBtn = document.getElementById('clear-all-filters');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllFilters);

    const clearTagsBtn = document.getElementById('clear-tags');
    if (clearTagsBtn) clearTagsBtn.addEventListener('click', () => {
        selectedTags = [];
        excludedTags = [];
        refreshGrid();
        updateTagButtons();
    });

    attachGridEvents();
    attachChipEvents();

    // Modal events
    const modalOverlay = document.getElementById('mob-modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    const modalClose = document.getElementById('mob-modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    const modalContent = document.getElementById('mob-modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // Extra info modal events
    const extraOverlay = document.getElementById('extra-info-overlay');
    if (extraOverlay) {
        extraOverlay.addEventListener('click', (e) => {
            if (e.target === extraOverlay) closeExtraInfo();
        });
    }

    const extraClose = document.getElementById('extra-info-close');
    if (extraClose) extraClose.addEventListener('click', closeExtraInfo);

    const extraContent = document.getElementById('extra-info-content');
    if (extraContent) {
        extraContent.addEventListener('click', (e) => e.stopPropagation());
    }
}
