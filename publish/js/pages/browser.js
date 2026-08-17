import { getAllAbilities, getAllTags } from '../services/ability-service.js';
import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard, attachAbilityCardEvents } from '../components/ability-card.js';
import { renderCardActionButtons, attachCardActionEvents } from '../components/card-actions.js';
import { renderMarkdown, markdownToPlain } from '../utils/markdown.js';

let searchTerm = '';
let selectedTags = [];
let selectedPowers = [];
let selectedComplexities = [];
let filteredAbilities = [];
let allAbilities = [];
let allTags = [];
let isModalOpen = false;
let selectedAbility = null;
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
    return selectedTags.length > 0 || selectedPowers.length > 0 || selectedComplexities.length > 0 || searchTerm.trim() !== '';
}

function performSearch() {
    let results = allAbilities;

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(a =>
            a.data.abilityName.toLowerCase().includes(term) ||
            a.data.abilityDescription.toLowerCase().includes(term)
        );
    }

    if (selectedTags.length > 0) {
        results = results.filter(a => selectedTags.every(t => a.data.tags.includes(t)));
    }

    if (selectedPowers.length > 0) {
        results = results.filter(a => selectedPowers.includes(a.data.power));
    }

    if (selectedComplexities.length > 0) {
        results = results.filter(a => selectedComplexities.includes(a.data.complexity));
    }

    filteredAbilities = results;
}

function getNumericFilterClass(value, list, type) {
    if (!list.includes(value)) return '';
    if (type === 'power') return 'power-active';
    if (type === 'complexity') return 'complexity-active';
    return 'active';
}

function renderGrid() {
    if (filteredAbilities.length === 0) {
        return `<div class="no-results">
            <p>No abilities found</p>
            ${hasActiveFilters() ? '<button class="reset-filters-btn" id="reset-filters">Reset Filters</button>' : ''}
        </div>`;
    }

    return filteredAbilities.map(ability => `
        <div class="grid-item" data-ability-id="${ability.id}">
            <div class="grid-item-header">
                <h3>${escapeHtml(ability.data.abilityName)}</h3>
                <div class="grid-item-stats">
                    <span class="stat-pip power-pip" title="Power">${ability.data.power}</span>
                    <span class="stat-pip complexity-pip" title="Complexity">${ability.data.complexity}</span>
                </div>
            </div>
            <p class="grid-item-description">${escapeHtml(truncateDescription(ability.data.abilityDescription))}</p>
            <div class="grid-item-tags">
                ${ability.data.tags.slice(0, 3).map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}
                ${ability.data.tags.length > 3 ? `<span class="mini-tag">+${ability.data.tags.length - 3}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function renderActiveFiltersSummary() {
    if (!hasActiveFilters()) return '';

    const chips = [];
    selectedPowers.forEach(p => {
        chips.push(`<span class="filter-chip power-chip">Power: ${p}<button class="chip-remove" data-toggle-power="${p}">&times;</button></span>`);
    });
    selectedComplexities.forEach(c => {
        chips.push(`<span class="filter-chip complexity-chip">Complexity: ${c}<button class="chip-remove" data-toggle-complexity="${c}">&times;</button></span>`);
    });
    selectedTags.forEach(t => {
        chips.push(`<span class="filter-chip tag-chip">${escapeHtml(t)}<button class="chip-remove" data-toggle-tag="${escapeHtml(t)}">&times;</button></span>`);
    });

    return `<div class="active-filters-summary">
        <span class="results-count">${filteredAbilities.length} results</span>
        <div class="active-chips">${chips.join('')}</div>
    </div>`;
}

export function render() {
    allAbilities = getAllAbilities();
    allTags = getAllTags();
    if (filteredAbilities.length === 0 && !hasActiveFilters()) {
        filteredAbilities = allAbilities;
    }

    const powerButtons = [1,2,3,4,5].map(i =>
        `<button class="${getNumericFilterClass(i, selectedPowers, 'power')}" data-power="${i}">${i}</button>`
    ).join('');

    const complexityButtons = [1,2,3,4,5].map(i =>
        `<button class="${getNumericFilterClass(i, selectedComplexities, 'complexity')}" data-complexity="${i}">${i}</button>`
    ).join('');

    const tagButtons = allTags.map(tag =>
        `<button class="filter-tag ${selectedTags.includes(tag) ? 'active' : ''}" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)}${selectedTags.includes(tag) ? '<span class="tag-close">&times;</span>' : ''}
        </button>`
    ).join('');

    return `
    ${renderNavbar()}
    <div class="ability-browser">
        <div class="browser-header">
            <h1>Ability Directory</h1>
            <p class="subtitle">Browse and search through ${allAbilities.length} abilities</p>
        </div>
        <div class="browser-layout">
            <div class="main-panel">
                <div class="search-section">
                    <input type="text" class="search-input" placeholder="Search abilities..."
                        id="search-input" value="${escapeHtml(searchTerm)}" />
                </div>

                <div class="filters-container">
                    <div class="filter-group">
                        <div class="filter-label">Power</div>
                        <div class="numeric-filters" id="power-filters">${powerButtons}</div>
                    </div>
                    <div class="filter-group">
                        <div class="filter-label">Complexity</div>
                        <div class="numeric-filters" id="complexity-filters">${complexityButtons}</div>
                    </div>
                    ${hasActiveFilters() ? `
                    <button class="clear-all-filters" id="clear-all-filters">
                        <svg class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Clear All
                    </button>` : ''}
                </div>

                <div class="filter-section">
                    <div class="filter-header">
                        <span>Filter by Tags</span>
                        ${selectedTags.length > 0 ? '<button class="clear-filters" id="clear-tags">Clear Tags</button>' : ''}
                    </div>
                    <div class="tag-filters">${tagButtons}</div>
                </div>

                ${renderActiveFiltersSummary()}

                <div class="abilities-grid" id="abilities-grid">
                    ${renderGrid()}
                </div>
            </div>
        </div>
    </div>

    <div id="ability-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="ability-modal-content" style="background: var(--gray-50, #f9fafb); padding: 24px; max-height: 90vh; max-width: 90vw; overflow-y: auto; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="ability-modal-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="ability-modal-body"></div>
        </div>
    </div>

    <div id="ability-extra-info-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="ability-extra-info-content" style="background: var(--surface, white); padding: 0; max-height: 80vh; max-width: 550px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="ability-extra-info-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="ability-extra-info-body"></div>
        </div>
    </div>`;
}

function refreshGrid() {
    performSearch();
    const grid = document.getElementById('abilities-grid');
    if (grid) grid.innerHTML = renderGrid();
    attachGridEvents();

    // Update active filters summary
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
    document.querySelectorAll('.grid-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.abilityId;
            const ability = allAbilities.find(a => a.id === id);
            if (ability) openModal(ability);
        });
    });

    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
        resetBtn.addEventListener('click', clearAllFilters);
    }
}

function attachChipEvents() {
    document.querySelectorAll('.chip-remove[data-toggle-power]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePower(parseFloat(btn.dataset.togglePower));
        });
    });
    document.querySelectorAll('.chip-remove[data-toggle-complexity]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleComplexity(parseFloat(btn.dataset.toggleComplexity));
        });
    });
    document.querySelectorAll('.chip-remove[data-toggle-tag]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTag(btn.dataset.toggleTag);
        });
    });
}

function togglePower(value) {
    const idx = selectedPowers.indexOf(value);
    if (idx !== -1) selectedPowers.splice(idx, 1);
    else selectedPowers.push(value);
    refreshGrid();
    updateFilterButtons();
}

function toggleComplexity(value) {
    const idx = selectedComplexities.indexOf(value);
    if (idx !== -1) selectedComplexities.splice(idx, 1);
    else selectedComplexities.push(value);
    refreshGrid();
    updateFilterButtons();
}

function toggleTag(tag) {
    const idx = selectedTags.indexOf(tag);
    if (idx !== -1) selectedTags.splice(idx, 1);
    else selectedTags.push(tag);
    refreshGrid();
    updateTagButtons();
}

function clearAllFilters() {
    selectedTags = [];
    selectedPowers = [];
    selectedComplexities = [];
    searchTerm = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    refreshGrid();
    updateFilterButtons();
    updateTagButtons();
}

function updateFilterButtons() {
    document.querySelectorAll('#power-filters button').forEach(btn => {
        const val = parseFloat(btn.dataset.power);
        btn.className = getNumericFilterClass(val, selectedPowers, 'power');
    });
    document.querySelectorAll('#complexity-filters button').forEach(btn => {
        const val = parseFloat(btn.dataset.complexity);
        btn.className = getNumericFilterClass(val, selectedComplexities, 'complexity');
    });

    const clearBtn = document.getElementById('clear-all-filters');
    if (clearBtn && !hasActiveFilters()) {
        clearBtn.style.display = 'none';
    } else if (!clearBtn && hasActiveFilters()) {
        const container = document.querySelector('.filters-container');
        if (container) {
            container.insertAdjacentHTML('beforeend', `
            <button class="clear-all-filters" id="clear-all-filters">
                <svg class="clear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Clear All
            </button>`);
            document.getElementById('clear-all-filters').addEventListener('click', clearAllFilters);
        }
    }
}

function updateTagButtons() {
    document.querySelectorAll('.filter-tag[data-tag]').forEach(btn => {
        const tag = btn.dataset.tag;
        if (selectedTags.includes(tag)) {
            btn.classList.add('active');
            if (!btn.querySelector('.tag-close')) {
                btn.insertAdjacentHTML('beforeend', '<span class="tag-close">&times;</span>');
            }
        } else {
            btn.classList.remove('active');
            const close = btn.querySelector('.tag-close');
            if (close) close.remove();
        }
    });
}

function openModal(ability) {
    selectedAbility = ability;
    isModalOpen = true;
    const overlay = document.getElementById('ability-modal-overlay');
    const body = document.getElementById('ability-modal-body');
    overlay.style.display = 'flex';
    body.innerHTML = renderCardActionButtons('ability') + renderAbilityCard(ability);
    attachAbilityCardEvents(ability);
    attachCardActionEvents(body, 'ability', ability);

    const extraBtn = body.querySelector('.ability-extra-info-btn');
    if (extraBtn) {
        extraBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openExtraInfo(ability);
        });
    }
}

function closeModal() {
    isModalOpen = false;
    selectedAbility = null;
    document.getElementById('ability-modal-overlay').style.display = 'none';
}

function openExtraInfo(ability) {
    const overlay = document.getElementById('ability-extra-info-overlay');
    const body = document.getElementById('ability-extra-info-body');
    overlay.style.display = 'flex';
    body.innerHTML = `
        <div class="extra-info-modal">
            <div class="extra-info-header">
                <h2>${escapeHtml(ability.data.abilityName)}</h2>
                <span class="extra-info-subtitle">Supporting Information</span>
            </div>
            <div class="extra-info-body-content">
                ${renderMarkdown(ability.data.extraInfo)}
            </div>
        </div>`;
}

function closeExtraInfo() {
    document.getElementById('ability-extra-info-overlay').style.display = 'none';
}

export function init() {
    allAbilities = getAllAbilities();
    allTags = getAllTags();
    filteredAbilities = allAbilities;

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => refreshGrid(), 200);
        });
    }

    document.querySelectorAll('#power-filters button').forEach(btn => {
        btn.addEventListener('click', () => togglePower(parseFloat(btn.dataset.power)));
    });

    document.querySelectorAll('#complexity-filters button').forEach(btn => {
        btn.addEventListener('click', () => toggleComplexity(parseFloat(btn.dataset.complexity)));
    });

    document.querySelectorAll('.filter-tag[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => toggleTag(btn.dataset.tag));
    });

    const clearAllBtn = document.getElementById('clear-all-filters');
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllFilters);

    const clearTagsBtn = document.getElementById('clear-tags');
    if (clearTagsBtn) clearTagsBtn.addEventListener('click', () => {
        selectedTags = [];
        refreshGrid();
        updateTagButtons();
    });

    attachGridEvents();
    attachChipEvents();

    // Modal events
    const modalOverlay = document.getElementById('ability-modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    const modalClose = document.getElementById('ability-modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    const modalContent = document.getElementById('ability-modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // Extra info modal events
    const extraOverlay = document.getElementById('ability-extra-info-overlay');
    if (extraOverlay) {
        extraOverlay.addEventListener('click', (e) => {
            if (e.target === extraOverlay) closeExtraInfo();
        });
    }

    const extraClose = document.getElementById('ability-extra-info-close');
    if (extraClose) extraClose.addEventListener('click', closeExtraInfo);

    const extraContent = document.getElementById('ability-extra-info-content');
    if (extraContent) {
        extraContent.addEventListener('click', (e) => e.stopPropagation());
    }
}
