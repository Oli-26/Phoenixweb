import { getAllAbilities } from '../services/ability-service.js';
import { getAllMobs, getWorldName, getAllWorldKeys } from '../services/mob-service.js';
import {
    getSavedAbilityIds, removeAbility, clearAllAbilities,
    getSavedMobEntries, removeMob, clearAllMobs,
    clearAll, exportLibrary, importLibrary,
    isAbilityFavorited, toggleAbilityFavorite,
    isMobFavorited, toggleMobFavorite,
    getCustomAbilities, saveCustomAbility, deleteCustomAbility, isCustomAbility,
    getCustomMobs, saveCustomMob, deleteCustomMob, isCustomMob,
    getAbilityFolders, createAbilityFolder, renameAbilityFolder, deleteAbilityFolder,
    getAbilityFolderId, setAbilityFolder,
    getMobFolders, createMobFolder, renameMobFolder, deleteMobFolder,
    getMobFolderId, setMobFolder
} from '../services/storage-service.js';
import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard, attachAbilityCardEvents, scaleAbilityPages } from '../components/ability-card.js';
import { renderMobCard, attachMobCardEvents } from '../components/mob-card.js';
import { renderCardActionButtons, attachCardActionEvents } from '../components/card-actions.js';
import { renderAbilityEditModal, showAbilityEditModal } from '../components/ability-edit-modal.js';
import { renderMobEditModal, showMobEditModal } from '../components/mob-edit-modal.js';

let savedAbilities = [];
let savedMobsByWorld = {};
let totalMobCount = 0;
let abilityGroups = [];
let mobGroups = [];
let isModalOpen = false;
let printMode = false;
let printSelected = new Set(); // stores 'ability:id' or 'mob:id:world'
let activeKey = 'all';      // 'all' | 'favorites' | 'custom' | 'a-folder:<id>' | 'a-unfiled' | 'm-folder:<id>' | 'm-world:<key>'
let searchQuery = '';
let segmentTab = 'all';     // 'all' | 'abilities' | 'mobs'

const TINTS = {
    rose:    { bg: '#fff1f2', fg: '#9f1239', dot: '#f43f5e' },
    amber:   { bg: '#fffbeb', fg: '#92400e', dot: '#f59e0b' },
    emerald: { bg: '#ecfdf5', fg: '#065f46', dot: '#10b981' },
    violet:  { bg: '#f5f3ff', fg: '#5b21b6', dot: '#8b5cf6' },
    sky:     { bg: '#f0f9ff', fg: '#075985', dot: '#0ea5e9' },
    slate:   { bg: '#f1f5f9', fg: '#334155', dot: '#64748b' }
};

function tint(name) { return TINTS[name] || TINTS.slate; }

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function truncateDescription(description) {
    if (!description) return '';
    if (description.length <= 100) return description;
    return description.substring(0, 97) + '...';
}

function loadSavedAbilities() {
    const savedIds = getSavedAbilityIds();
    const allAbilities = getAllAbilities();
    savedAbilities = allAbilities.filter(a => savedIds.includes(a.id));

    const customs = getCustomAbilities();
    for (const custom of customs) {
        if (!savedAbilities.some(a => a.id === custom.id)) {
            savedAbilities.push(custom);
        }
    }

    savedAbilities.sort((a, b) => {
        const aFav = isAbilityFavorited(a.id) ? 0 : 1;
        const bFav = isAbilityFavorited(b.id) ? 0 : 1;
        return aFav - bFav;
    });

    // Group by folder
    const folders = getAbilityFolders();
    const groups = {};
    for (const f of folders) groups[f.id] = { id: f.id, name: f.name, abilities: [] };
    const unfiled = { id: null, name: 'Unfiled', abilities: [] };

    for (const a of savedAbilities) {
        const fid = getAbilityFolderId(a.id);
        if (fid && groups[fid]) {
            groups[fid].abilities.push(a);
        } else {
            unfiled.abilities.push(a);
        }
    }

    abilityGroups = [unfiled, ...folders.map(f => groups[f.id])];
}

function loadSavedMobs() {
    const entries = getSavedMobEntries();
    savedMobsByWorld = {};
    totalMobCount = 0;

    const allEntries = [];
    for (const entry of entries) {
        const worldMobs = getAllMobs(entry.world);
        const mob = worldMobs.find(m => m.id === entry.id);
        if (mob) {
            allEntries.push({ mob, world: entry.world });
            totalMobCount++;
        }
    }

    const customs = getCustomMobs();
    for (const custom of customs) {
        const world = custom.world || 'custom';
        if (!allEntries.some(e => e.mob.id === custom.id)) {
            allEntries.push({ mob: custom, world });
            totalMobCount++;
        }
    }

    // Build groups: world groups for unfiled mobs; custom folder groups
    const folders = getMobFolders();
    const folderGroups = {};
    for (const f of folders) folderGroups[f.id] = { kind: 'folder', id: f.id, name: f.name, mobs: [] };

    const worldGroups = {};
    for (const entry of allEntries) {
        const fid = getMobFolderId(entry.mob.id);
        if (fid && folderGroups[fid]) {
            folderGroups[fid].mobs.push(entry);
        } else {
            const w = entry.world;
            if (!worldGroups[w]) {
                worldGroups[w] = { kind: 'world', id: w, name: getWorldName(w) || w, mobs: [] };
            }
            worldGroups[w].mobs.push(entry);
            if (!savedMobsByWorld[w]) savedMobsByWorld[w] = [];
            savedMobsByWorld[w].push(entry);
        }
    }

    const sortFav = (a, b) => (isMobFavorited(a.mob.id) ? 0 : 1) - (isMobFavorited(b.mob.id) ? 0 : 1);
    Object.values(worldGroups).forEach(g => g.mobs.sort(sortFav));
    Object.values(folderGroups).forEach(g => g.mobs.sort(sortFav));
    Object.values(savedMobsByWorld).forEach(arr => arr.sort(sortFav));

    mobGroups = [...Object.values(worldGroups), ...folders.map(f => folderGroups[f.id])];
}

function renderMeter(value, max = 5, color) {
    let html = '<div class="lib-meter">';
    for (let i = 0; i < max; i++) {
        const on = i < value;
        html += `<span class="lib-meter-pip${on ? ' is-on' : ''}" ${on ? `style="background:${color}"` : ''}></span>`;
    }
    html += '</div>';
    return html;
}

function renderAbilityLibCard(ability) {
    const fav = isAbilityFavorited(ability.id);
    const custom = isCustomAbility(ability.id);
    const d = ability.data;
    const tags = (d.tags || []).slice(0, 3);
    const selKey = `ability:${ability.id}`;
    const selected = printSelected.has(selKey);
    return `
    <article class="lib-card${fav ? ' is-fav' : ''}${custom ? ' is-custom' : ''}${printMode && selected ? ' is-selected' : ''}${printMode ? ' is-print-mode' : ''}" data-ability-id="${ability.id}" data-print-key="${selKey}" draggable="true">
        ${selected ? '<span class="lib-check"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
        ${custom && !selected ? '<span class="lib-badge lib-badge-custom">Custom</span>' : ''}
        <div class="lib-card-head">
            <h4 class="lib-card-title">${escapeHtml(d.abilityName)}</h4>
            ${fav ? '<span class="lib-fav"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>' : ''}
        </div>
        <p class="lib-card-desc">${escapeHtml(truncateDescription(d.abilityDescription))}</p>
        <div class="lib-meters">
            <div class="lib-meter-row">
                <span class="lib-meter-label">Power</span>
                ${renderMeter(parseInt(d.power) || 0, 5, '#10b981')}
                <span class="lib-meter-num">${d.power || 0}</span>
            </div>
            <div class="lib-meter-row">
                <span class="lib-meter-label">Complexity</span>
                ${renderMeter(parseInt(d.complexity) || 0, 5, '#8b5cf6')}
                <span class="lib-meter-num">${d.complexity || 0}</span>
            </div>
        </div>
        <div class="lib-card-foot">
            <div class="lib-tags">
                ${tags.map(t => `<span class="lib-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
        </div>
        <div class="lib-hover-actions">
            <button class="lib-hover-btn" data-select-key="${selKey}" title="Select">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="lib-hover-btn" data-fav-ability-id="${ability.id}" title="${fav ? 'Unfavorite' : 'Favorite'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <button class="lib-hover-btn lib-hover-btn-danger" data-remove-ability-id="${ability.id}" title="${custom ? 'Delete' : 'Remove from library'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
        </div>
    </article>`;
}

function renderMobLibCard(mob, world) {
    const fav = isMobFavorited(mob.id);
    const custom = isCustomMob(mob.id);
    const d = mob.data;
    const tags = (d.tags || []).slice(0, 3);
    const selKey = `mob:${mob.id}:${world}`;
    const selected = printSelected.has(selKey);
    const worldName = getWorldName(world) || world;
    return `
    <article class="lib-card lib-card-mob${fav ? ' is-fav' : ''}${custom ? ' is-custom' : ''}${printMode && selected ? ' is-selected' : ''}${printMode ? ' is-print-mode' : ''}" data-lib-mob-id="${mob.id}" data-lib-mob-world="${world}" data-print-key="${selKey}" draggable="true">
        ${selected ? '<span class="lib-check"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}
        ${custom && !selected ? '<span class="lib-badge lib-badge-custom">Custom</span>' : ''}
        <div class="lib-mob-head">
            <div>
                <h4 class="lib-card-title">${escapeHtml(d.name)}</h4>
                ${d.subtitle ? `<div class="lib-mob-sub">${escapeHtml(d.subtitle)}</div>` : ''}
            </div>
            ${fav ? '<span class="lib-fav"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>' : ''}
        </div>
        <div class="lib-mob-stats">
            <div class="lib-mob-stat"><span class="lib-mob-stat-label">HP</span><span class="lib-mob-stat-val">${escapeHtml(d.health) || '—'}</span></div>
            <div class="lib-mob-stat"><span class="lib-mob-stat-label">Focus</span><span class="lib-mob-stat-val">${escapeHtml(d.focus) || '—'}</span></div>
            <div class="lib-mob-stat"><span class="lib-mob-stat-label">DEF</span><span class="lib-mob-stat-val">${escapeHtml(d.stats?.def) || '—'}</span></div>
        </div>
        ${(d.power || d.complexity) ? `
        <div class="lib-meters">
            <div class="lib-meter-row">
                <span class="lib-meter-label">Power</span>
                ${renderMeter(parseInt(d.power) || 0, 5, '#10b981')}
                <span class="lib-meter-num">${d.power || 0}</span>
            </div>
            <div class="lib-meter-row">
                <span class="lib-meter-label">Complexity</span>
                ${renderMeter(parseInt(d.complexity) || 0, 5, '#8b5cf6')}
                <span class="lib-meter-num">${d.complexity || 0}</span>
            </div>
        </div>` : ''}
        <div class="lib-card-foot">
            <div class="lib-tags">
                ${tags.map(t => `<span class="lib-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
            <div class="lib-mob-world">${escapeHtml(worldName)}</div>
        </div>
        <div class="lib-hover-actions">
            <button class="lib-hover-btn" data-select-key="${selKey}" title="Select">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="lib-hover-btn" data-fav-mob-id="${mob.id}" title="${fav ? 'Unfavorite' : 'Favorite'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <button class="lib-hover-btn lib-hover-btn-danger" data-remove-mob-id="${mob.id}" title="${custom ? 'Delete' : 'Remove from library'}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
        </div>
    </article>`;
}

function renderEmptyState() {
    return `<div class="empty-library">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M5 3v18l7-5 7 5V3z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h3>Your library is empty</h3>
        <p>Save abilities and mobs from the browsers to view them here</p>
        <button class="browse-button" id="browse-btn">Browse Abilities</button>
    </div>`;
}

export function render() {
    loadSavedAbilities();
    loadSavedMobs();

    const totalCount = savedAbilities.length + totalMobCount;
    if (totalCount === 0) {
        return `
        ${renderNavbar()}
        <div class="lib-shell">
            <div class="lib-empty-library">
                ${renderEmptyState()}
            </div>
        </div>
        ${renderModals()}`;
    }

    return `
    ${renderNavbar()}
    <div class="lib-shell">
        ${renderLibHeader()}

        ${printMode ? renderPrintToolbar() : ''}

        <div class="lib-body">
            <aside class="lib-side">${renderSidebar()}</aside>
            <main class="lib-main">${renderMainPane()}</main>
        </div>
    </div>
    ${renderModals()}`;
}

function renderModals() {
    return `
    <div id="print-container" class="print-container"></div>

    <div id="library-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="library-modal-content" style="background: var(--gray-50, #f9fafb); padding: 24px; max-height: 90vh; max-width: 90vw; overflow-y: auto; border-radius: 8px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="library-modal-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="library-modal-body"></div>
        </div>
    </div>

    <div id="lib-extra-info-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="lib-extra-info-content" style="background: var(--surface, white); padding: 0; max-height: 80vh; max-width: 550px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="lib-extra-info-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="lib-extra-info-body"></div>
        </div>
    </div>

    <div id="lib-folder-edit-overlay" class="modal-overlay" style="display:none;"></div>

    ${renderAbilityEditModal()}
    ${renderMobEditModal()}`;
}

function showFolderEditPopover(type, id) {
    const folder = type === 'ability'
        ? getAbilityFolders().find(f => f.id === id)
        : getMobFolders().find(f => f.id === id);
    if (!folder) return;
    const overlay = document.getElementById('lib-folder-edit-overlay');
    overlay.style.display = 'flex';

    const colors = ['rose', 'amber', 'emerald', 'sky', 'violet', 'slate'];
    let currentTint = folder.tint || 'slate';
    let currentName = folder.name;

    const renderPop = () => `
        <div class="lib-popover" onclick="event.stopPropagation()">
            <div class="lib-popover-head">
                <span>Edit folder</span>
                <button id="lib-pop-close" title="Close">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="lib-popover-body">
                <input class="lib-popover-input" id="lib-pop-name" value="${escapeHtml(currentName)}" autofocus />
                <div class="lib-popover-label">Color</div>
                <div class="lib-color-grid">
                    ${colors.map(c => `<button class="lib-color-swatch ${c === currentTint ? 'is-active' : ''}" data-tint="${c}" style="background:${tint(c).dot}" title="${c}"></button>`).join('')}
                </div>
            </div>
            <div class="lib-popover-foot">
                <button class="lib-popover-cancel" id="lib-pop-cancel">Cancel</button>
                <button class="lib-popover-save" id="lib-pop-save">Save</button>
            </div>
        </div>`;

    overlay.innerHTML = renderPop();

    function close() {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }, { once: true });
    document.getElementById('lib-pop-close').addEventListener('click', close);
    document.getElementById('lib-pop-cancel').addEventListener('click', close);

    overlay.querySelectorAll('.lib-color-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTint = btn.dataset.tint;
            overlay.querySelectorAll('.lib-color-swatch').forEach(b => b.classList.toggle('is-active', b === btn));
        });
    });

    document.getElementById('lib-pop-save').addEventListener('click', () => {
        const newName = document.getElementById('lib-pop-name').value.trim() || folder.name;
        if (type === 'ability') renameAbilityFolder(id, newName, currentTint);
        else renameMobFolder(id, newName, currentTint);
        close();
        refreshLibContent();
    });

    setTimeout(() => document.getElementById('lib-pop-name')?.focus(), 0);
}

function renderPrintToolbar() {
    const empty = printSelected.size === 0;
    return `
    <div class="lib-bulkbar-wrap">
        <div class="lib-bulkbar">
            <div class="lib-bulk-count"><span class="lib-bulk-num">${printSelected.size}</span><span>selected</span></div>
            <div class="lib-bulk-divider"></div>
            <button class="lib-bulk-btn" id="bulk-select-all">Select all</button>
            <button class="lib-bulk-btn" id="bulk-clear" ${empty ? 'disabled' : ''}>Clear</button>
            <div class="lib-bulk-divider"></div>
            <button class="lib-bulk-btn" id="bulk-move" ${empty ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span>Move to folder</span>
            </button>
            <button class="lib-bulk-btn" id="bulk-favorite" ${empty ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>Favorite</span>
            </button>
            <button class="lib-bulk-btn" id="bulk-print" ${empty ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                <span>Print</span>
            </button>
            <button class="lib-bulk-btn lib-bulk-btn-danger" id="bulk-delete" ${empty ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                <span>Delete</span>
            </button>
            <div class="lib-bulk-spacer"></div>
            <button class="lib-bulk-cancel" id="print-cancel">Cancel</button>
        </div>
    </div>`;
}

function renderLibHeader() {
    const segActive = (val) => segmentTab === val ? 'is-active' : '';
    return `
    <header class="lib-header">
        <div class="lib-header-left">
            <h1 class="lib-title">Library</h1>
            <span class="lib-stats">${savedAbilities.length} abilities · ${totalMobCount} mobs</span>
        </div>
        <div class="lib-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="lib-search-input" placeholder="Search abilities, mobs, tags…" value="${escapeHtml(searchQuery)}" />
            ${searchQuery ? '<button class="lib-search-clear" id="lib-search-clear" title="Clear">&times;</button>' : ''}
        </div>
        <div class="lib-header-right">
            <div class="lib-segment">
                <button class="${segActive('all')}" data-segment="all">All</button>
                <button class="${segActive('abilities')}" data-segment="abilities">Abilities</button>
                <button class="${segActive('mobs')}" data-segment="mobs">Mobs</button>
            </div>
            <div class="lib-create-wrap">
                <button class="lib-cta" id="lib-create-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>Create</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="lib-create-menu" id="lib-create-menu" style="display:none;">
                    <button data-create="ability">New ability</button>
                    <button data-create="mob">New mob</button>
                    <div class="lib-menu-sep"></div>
                    <button data-create="ability-folder">New ability folder</button>
                    <button data-create="mob-folder">New mob folder</button>
                </div>
            </div>
            <button class="lib-icon-btn" id="lib-print-btn" title="Print mode">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
        </div>
    </header>`;
}

function renderSidebar() {
    const folders = getAbilityFolders();
    const mFolders = getMobFolders();
    const favCount = savedAbilities.filter(a => isAbilityFavorited(a.id)).length
        + mobGroups.flatMap(g => g.mobs).filter(e => isMobFavorited(e.mob.id)).length;
    const customCount = savedAbilities.filter(a => isCustomAbility(a.id)).length
        + mobGroups.flatMap(g => g.mobs).filter(e => isCustomMob(e.mob.id)).length;
    const totalCount = savedAbilities.length + totalMobCount;

    const row = (key, dot, label, count, opts = {}) => {
        const cls = `lib-row ${activeKey === key ? 'is-active' : ''} ${opts.sub ? 'is-sub' : ''} ${opts.quick ? 'is-quick' : ''}`.trim();
        const editBtn = opts.editable ? `<button class="lib-row-edit" data-edit-folder="${opts.editFolderType}:${opts.folderId}" title="Edit folder">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : '';
        return `<button class="${cls}" data-active-key="${escapeHtml(key)}">
            ${dot}
            <span class="lib-row-label">${escapeHtml(label)}</span>
            <span class="lib-row-count">${count}</span>
            ${editBtn}
        </button>`;
    };

    const dotEl = (color) => `<span class="lib-row-dot" style="background:${color}"></span>`;
    const iconEl = (svg) => `<span class="lib-row-icon">${svg}</span>`;

    let html = '';

    // Quick section
    html += `<div class="lib-side-section">
        <div class="lib-side-head"><span>Quick</span></div>
        ${row('all', iconEl('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>'), 'All items', totalCount, { quick: true })}
        ${row('favorites', iconEl('<svg viewBox="0 0 24 24" width="14" height="14" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'), 'Favorites', favCount, { quick: true })}
        ${row('custom', iconEl('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>'), 'Custom only', customCount, { quick: true })}
    </div>`;

    // Ability folders
    html += `<div class="lib-side-section">
        <div class="lib-side-head">
            <span>Ability folders</span>
            <button class="lib-side-add" id="lib-new-ability-folder" title="New folder">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
        </div>`;
    for (const f of folders) {
        const count = abilityGroups.find(g => g.id === f.id)?.abilities.length || 0;
        html += row(`a-folder:${f.id}`, dotEl(tint(f.tint).dot), f.name, count, { editable: true, editFolderType: 'ability', folderId: f.id });
    }
    const unfiledCount = abilityGroups.find(g => !g.id)?.abilities.length || 0;
    html += row('a-unfiled', dotEl(tint('slate').dot), 'Unfiled', unfiledCount);
    html += '</div>';

    // Mob folders
    html += `<div class="lib-side-section">
        <div class="lib-side-head">
            <span>Mob folders</span>
            <button class="lib-side-add" id="lib-new-mob-folder" title="New folder">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
        </div>`;
    for (const f of mFolders) {
        const count = mobGroups.find(g => g.kind === 'folder' && g.id === f.id)?.mobs.length || 0;
        html += row(`m-folder:${f.id}`, dotEl(tint(f.tint).dot), f.name, count, { editable: true, editFolderType: 'mob', folderId: f.id });
    }

    const worldRows = mobGroups.filter(g => g.kind === 'world');
    if (worldRows.length > 0) {
        html += '<div class="lib-side-subhead">By campaign</div>';
        for (const w of worldRows) {
            html += row(`m-world:${w.id}`, dotEl(tint('emerald').dot), w.name, w.mobs.length, { sub: true });
        }
    }
    html += '</div>';

    // Footer
    html += `
    <div class="lib-side-foot">
        <label class="lib-foot-btn" for="import-library-input">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Import</span>
        </label>
        <input type="file" id="import-library-input" accept=".json" style="display:none;" />
        <button class="lib-foot-btn" id="export-library">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export</span>
        </button>
        <button class="lib-foot-btn" id="lib-side-print">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            <span>Print</span>
        </button>
        <button class="lib-foot-btn lib-foot-btn-danger" id="clear-library">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            <span>Clear</span>
        </button>
    </div>`;

    return html;
}

function getActiveItems() {
    // Returns { abilities, mobs, title, count, swatch, deletable, editable }
    if (searchQuery.trim()) return getSearchResults();

    const allAbilities = savedAbilities;
    const allMobs = mobGroups.flatMap(g => g.mobs);

    if (activeKey === 'all') {
        return { kind: 'all', title: 'All items', swatch: tint('emerald').dot, abilities: allAbilities, mobs: allMobs };
    }
    if (activeKey === 'favorites') {
        return {
            kind: 'favorites', title: 'Favorites', swatch: '#f59e0b',
            abilities: allAbilities.filter(a => isAbilityFavorited(a.id)),
            mobs: allMobs.filter(e => isMobFavorited(e.mob.id))
        };
    }
    if (activeKey === 'custom') {
        return {
            kind: 'custom', title: 'Custom only', swatch: tint('violet').dot,
            abilities: allAbilities.filter(a => isCustomAbility(a.id)),
            mobs: allMobs.filter(e => isCustomMob(e.mob.id))
        };
    }
    if (activeKey.startsWith('a-folder:')) {
        const id = activeKey.slice('a-folder:'.length);
        const folder = getAbilityFolders().find(f => f.id === id);
        const grp = abilityGroups.find(g => g.id === id);
        return { kind: 'folder', folderType: 'ability', folderId: id, title: folder?.name || 'Folder', swatch: tint(folder?.tint).dot, abilities: grp?.abilities || [], mobs: [], editable: true, deletable: true };
    }
    if (activeKey === 'a-unfiled') {
        const grp = abilityGroups.find(g => !g.id);
        return { kind: 'folder', title: 'Unfiled abilities', swatch: tint('slate').dot, abilities: grp?.abilities || [], mobs: [] };
    }
    if (activeKey.startsWith('m-folder:')) {
        const id = activeKey.slice('m-folder:'.length);
        const folder = getMobFolders().find(f => f.id === id);
        const grp = mobGroups.find(g => g.kind === 'folder' && g.id === id);
        return { kind: 'folder', folderType: 'mob', folderId: id, title: folder?.name || 'Folder', swatch: tint(folder?.tint).dot, abilities: [], mobs: grp?.mobs || [], editable: true, deletable: true };
    }
    if (activeKey.startsWith('m-world:')) {
        const w = activeKey.slice('m-world:'.length);
        const grp = mobGroups.find(g => g.kind === 'world' && g.id === w);
        return { kind: 'world', worldKey: w, title: getWorldName(w) || w, swatch: tint('emerald').dot, abilities: [], mobs: grp?.mobs || [], deletable: true };
    }
    return { kind: 'all', title: 'All items', swatch: tint('emerald').dot, abilities: allAbilities, mobs: allMobs };
}

function renderSearchResults() {
    const view = getSearchResults();
    const showAbilities = segmentTab !== 'mobs';
    const showMobs = segmentTab !== 'abilities';
    const abilities = showAbilities ? view.abilities : [];
    const mobs = showMobs ? view.mobs : [];
    const total = abilities.length + mobs.length;
    const q = searchQuery.trim();
    const qLower = q.toLowerCase();

    if (total === 0) {
        return `
        <div class="lib-search-empty">
            <div class="lib-empty-icon">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h3>No matches for "${escapeHtml(q)}"</h3>
            <p>Try a different word, or check that the item is saved to your library.</p>
        </div>`;
    }

    const highlight = (name) => {
        const idx = name.toLowerCase().indexOf(qLower);
        if (idx < 0) return escapeHtml(name);
        return escapeHtml(name.slice(0, idx))
            + '<mark>' + escapeHtml(name.slice(idx, idx + q.length)) + '</mark>'
            + escapeHtml(name.slice(idx + q.length));
    };

    const folderForAbility = (id) => {
        const fid = getAbilityFolderId(id);
        if (fid) {
            const f = getAbilityFolders().find(x => x.id === fid);
            if (f) return { name: f.name, dot: tint(f.tint).dot, key: `a-folder:${f.id}` };
        }
        return { name: 'Unfiled', dot: tint('slate').dot, key: 'a-unfiled' };
    };
    const folderForMob = (entry) => {
        const fid = getMobFolderId(entry.mob.id);
        if (fid) {
            const f = getMobFolders().find(x => x.id === fid);
            if (f) return { name: f.name, dot: tint(f.tint).dot, key: `m-folder:${f.id}` };
        }
        const wn = getWorldName(entry.world) || entry.world;
        return { name: wn, dot: tint('emerald').dot, key: `m-world:${entry.world}` };
    };

    let rows = '';
    for (const a of abilities) {
        const f = folderForAbility(a.id);
        rows += `<div class="lib-search-row" data-search-jump="${escapeHtml(f.key)}" data-search-open="ability:${a.id}">
            <div class="lib-search-pill" data-type="ability">A</div>
            <div class="lib-search-main">
                <div class="lib-search-name">${highlight(a.data.abilityName)}</div>
                <div class="lib-search-crumbs">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                    <span>Library</span>
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    <span class="lib-search-folder"><span class="lib-search-folder-dot" style="background:${f.dot}"></span>${escapeHtml(f.name)}</span>
                </div>
            </div>
            <button class="lib-search-jump"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>
        </div>`;
    }
    for (const e of mobs) {
        const f = folderForMob(e);
        rows += `<div class="lib-search-row" data-search-jump="${escapeHtml(f.key)}" data-search-open="mob:${e.mob.id}:${e.world}">
            <div class="lib-search-pill" data-type="mob">M</div>
            <div class="lib-search-main">
                <div class="lib-search-name">${highlight(e.mob.data.name)}</div>
                <div class="lib-search-crumbs">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                    <span>Library</span>
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
                    <span class="lib-search-folder"><span class="lib-search-folder-dot" style="background:${f.dot}"></span>${escapeHtml(f.name)}</span>
                </div>
            </div>
            <button class="lib-search-jump"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg></button>
        </div>`;
    }

    return `
    <div class="lib-search-head">
        <span class="lib-search-eyebrow">Results for</span>
        <span class="lib-search-q">"${escapeHtml(q)}"</span>
        <span class="lib-search-count">${total} matches</span>
    </div>
    <div class="lib-search-list">${rows}</div>`;
}

function getSearchResults() {
    const q = searchQuery.trim().toLowerCase();
    const abilities = savedAbilities.filter(a =>
        a.data.abilityName.toLowerCase().includes(q) ||
        (a.data.abilityDescription || '').toLowerCase().includes(q) ||
        (a.data.tags || []).some(t => t.toLowerCase().includes(q))
    );
    const mobs = mobGroups.flatMap(g => g.mobs).filter(e =>
        e.mob.data.name.toLowerCase().includes(q) ||
        (e.mob.data.description || '').toLowerCase().includes(q) ||
        (e.mob.data.tags || []).some(t => t.toLowerCase().includes(q))
    );
    return { kind: 'search', title: `Results for "${searchQuery}"`, swatch: tint('emerald').dot, abilities, mobs };
}

function renderMainPane() {
    if (searchQuery.trim()) return renderSearchResults();
    const view = getActiveItems();
    const showAbilities = segmentTab !== 'mobs';
    const showMobs = segmentTab !== 'abilities';
    const abilities = showAbilities ? view.abilities : [];
    const mobs = showMobs ? view.mobs : [];
    const total = abilities.length + mobs.length;

    let mainHead = `
    <div class="lib-main-head">
        <div class="lib-main-title">
            <span class="lib-main-swatch" style="background:${view.swatch}"></span>
            <h2>${escapeHtml(view.title)}</h2>
            <span class="lib-main-count">${total} item${total === 1 ? '' : 's'}</span>
        </div>
        <div class="lib-main-tools">
            ${view.editable ? `<button class="lib-main-tool" id="lib-edit-active-folder">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Rename</span>
            </button>` : ''}
            ${view.deletable && view.kind === 'folder' ? `<button class="lib-main-tool lib-main-tool-danger" id="lib-delete-active-folder">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>` : ''}
            ${view.kind === 'world' ? `<button class="lib-main-tool lib-main-tool-danger" id="lib-clear-world" data-world="${view.worldKey}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                <span>Clear campaign</span>
            </button>` : ''}
        </div>
    </div>`;

    let body;
    if (total === 0) {
        body = `<div class="lib-empty-folder">
            <div class="lib-empty-icon">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p class="lib-empty-text">${searchQuery ? 'No matches' : 'No items here yet'}</p>
            <p class="lib-empty-sub">${searchQuery ? `Nothing in your library matches "${escapeHtml(searchQuery)}".` : 'Save items from the Browser, or move existing items into this folder.'}</p>
        </div>`;
    } else {
        let cards = '';
        for (const ability of abilities) cards += renderAbilityLibCard(ability);
        for (const entry of mobs) cards += renderMobLibCard(entry.mob, entry.world);
        body = `<div class="lib-grid">${cards}</div>`;
    }

    return mainHead + body;
}

function refreshPage() {
    const app = document.getElementById('app');
    app.innerHTML = render();
    init();
}

// --- Print Mode ---

function enterPrintMode() {
    printMode = true;
    printSelected.clear();
    refreshPage();
}

function exitPrintMode() {
    printMode = false;
    printSelected.clear();
    refreshPage();
}

function togglePrintSelection(key) {
    if (printSelected.has(key)) {
        printSelected.delete(key);
    } else {
        printSelected.add(key);
    }
    refreshGridsOnly();
}

function selectAllForPrint() {
    for (const ability of savedAbilities) {
        printSelected.add(`ability:${ability.id}`);
    }
    for (const group of mobGroups) {
        for (const entry of group.mobs) {
            printSelected.add(`mob:${entry.mob.id}:${entry.world}`);
        }
    }
    refreshGridsOnly();
}

function deselectAllForPrint() {
    printSelected.clear();
    refreshGridsOnly();
}

function refreshGridsOnly() {
    const main = document.querySelector('.lib-main');
    if (main) {
        main.innerHTML = renderMainPane();
        attachMainPaneTools();
    }

    const wrap = document.querySelector('.lib-bulkbar-wrap');
    if (wrap) {
        wrap.outerHTML = renderPrintToolbar();
        attachBulkBarEvents();
    }
}


function executePrint() {
    const container = document.getElementById('print-container');
    container.innerHTML = '';

    // Render selected ability cards
    for (const ability of savedAbilities) {
        if (printSelected.has(`ability:${ability.id}`)) {
            const wrapper = document.createElement('div');
            wrapper.className = 'print-card-block';
            wrapper.innerHTML = renderAbilityCard(ability);
            container.appendChild(wrapper);
        }
    }

    // Render selected mob cards
    for (const group of mobGroups) {
        for (const entry of group.mobs) {
            if (printSelected.has(`mob:${entry.mob.id}:${entry.world}`)) {
                const wrapper = document.createElement('div');
                wrapper.className = 'print-card-block';
                wrapper.innerHTML = renderMobCard(entry.mob, entry.world);
                container.appendChild(wrapper);
            }
        }
    }

    document.body.classList.add('printing-cards');

    // Scale ability pages in print container and then print
    requestAnimationFrame(() => {
        scaleAbilityPages();
        requestAnimationFrame(() => {
            window.print();
            document.body.classList.remove('printing-cards');
            container.innerHTML = '';
        });
    });
}


// --- Modal Action Buttons ---

function renderModalActionButtons(id, type, world) {
    const custom = type === 'ability' ? isCustomAbility(id) : isCustomMob(id);
    const isFav = type === 'ability' ? isAbilityFavorited(id) : isMobFavorited(id);

    let html = '<div class="modal-action-buttons">';

    html += `<button class="modal-favorite-btn${isFav ? ' active' : ''}" data-modal-fav-id="${id}" data-modal-fav-type="${type}">
        ${isFav ? '&#9733; Favorited' : '&#9734; Add to Favorites'}
    </button>`;

    // Move to folder
    if (type === 'ability') {
        const currentFolderId = getAbilityFolderId(id);
        const folders = getAbilityFolders();
        html += `<label class="modal-folder-picker">
            <span>Folder:</span>
            <select class="modal-folder-select" data-folder-type="ability" data-folder-item-id="${id}">
                <option value="">Unfiled</option>
                ${folders.map(f => `<option value="${f.id}" ${f.id === currentFolderId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
            </select>
        </label>`;
    } else {
        const currentFolderId = getMobFolderId(id);
        const folders = getMobFolders();
        const worldName = getWorldName(world) || world;
        html += `<label class="modal-folder-picker">
            <span>Folder:</span>
            <select class="modal-folder-select" data-folder-type="mob" data-folder-item-id="${id}">
                <option value="">${escapeHtml(worldName)} (default)</option>
                ${folders.map(f => `<option value="${f.id}" ${f.id === currentFolderId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
            </select>
        </label>`;
    }

    // Duplicate & Edit (all items)
    html += `<button class="modal-action-btn duplicate-btn" data-duplicate-id="${id}" data-duplicate-type="${type}"${world ? ` data-duplicate-world="${world}"` : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Duplicate &amp; Edit
    </button>`;

    if (custom) {
        html += `<button class="modal-action-btn edit-btn" data-edit-id="${id}" data-edit-type="${type}"${world ? ` data-edit-world="${world}"` : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Edit
        </button>`;
        html += `<button class="modal-action-btn delete-custom-btn" data-delete-id="${id}" data-delete-type="${type}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete
        </button>`;
    }

    html += '</div>';
    return html;
}

function attachModalActionEvents(container, itemData, world) {
    // Folder select
    const folderSelect = container.querySelector('.modal-folder-select');
    if (folderSelect) {
        folderSelect.addEventListener('change', () => {
            const t = folderSelect.dataset.folderType;
            const itemId = folderSelect.dataset.folderItemId;
            const value = folderSelect.value || null;
            if (t === 'ability') {
                setAbilityFolder(itemId, value);
            } else {
                setMobFolder(itemId, value);
            }
            closeModal();
            refreshPage();
        });
    }

    // Favorite toggle
    const favBtn = container.querySelector('.modal-favorite-btn');
    if (favBtn) {
        favBtn.addEventListener('click', () => {
            const id = favBtn.dataset.modalFavId;
            const type = favBtn.dataset.modalFavType;
            if (type === 'ability') {
                toggleAbilityFavorite(id);
                loadSavedAbilities();
                refreshAbilityGrids();
            } else {
                toggleMobFavorite(id);
                loadSavedMobs();
                refreshMobGrids();
            }
            const isFav = type === 'ability' ? isAbilityFavorited(id) : isMobFavorited(id);
            favBtn.classList.toggle('active', isFav);
            favBtn.innerHTML = isFav ? '&#9733; Favorited' : '&#9734; Add to Favorites';
        });
    }

    // Duplicate & Edit
    const dupBtn = container.querySelector('.duplicate-btn');
    if (dupBtn) {
        dupBtn.addEventListener('click', () => {
            const type = dupBtn.dataset.duplicateType;
            const w = dupBtn.dataset.duplicateWorld;
            closeModal();

            if (type === 'ability') {
                const clone = JSON.parse(JSON.stringify(itemData));
                clone.id = crypto.randomUUID();
                clone.data.abilityName += ' (Copy)';
                showAbilityEditModal(clone, (updated) => {
                    saveCustomAbility(updated);
                    refreshPage();
                });
            } else {
                const clone = JSON.parse(JSON.stringify(itemData));
                clone.id = crypto.randomUUID();
                clone.data.name += ' (Copy)';
                clone.world = w;
                showMobEditModal(clone, w, (updated) => {
                    saveCustomMob(updated);
                    refreshPage();
                });
            }
        });
    }

    // Edit (custom only)
    const editBtn = container.querySelector('.edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const type = editBtn.dataset.editType;
            const w = editBtn.dataset.editWorld;
            closeModal();

            if (type === 'ability') {
                showAbilityEditModal(itemData, (updated) => {
                    saveCustomAbility(updated);
                    refreshPage();
                });
            } else {
                showMobEditModal(itemData, w, (updated) => {
                    saveCustomMob(updated);
                    refreshPage();
                });
            }
        });
    }

    // Delete (custom only)
    const delBtn = container.querySelector('.delete-custom-btn');
    if (delBtn) {
        delBtn.addEventListener('click', () => {
            const type = delBtn.dataset.deleteType;
            const id = delBtn.dataset.deleteId;
            if (confirm('Permanently delete this custom item?')) {
                if (type === 'ability') {
                    deleteCustomAbility(id);
                } else {
                    deleteCustomMob(id);
                }
                closeModal();
                refreshPage();
            }
        });
    }
}

function refreshMobGrids() { refreshLibContent(); }
function refreshAbilityGrids() { refreshLibContent(); }

function openAbilityModal(ability) {
    isModalOpen = true;
    const overlay = document.getElementById('library-modal-overlay');
    const body = document.getElementById('library-modal-body');
    overlay.style.display = 'flex';
    body.innerHTML = renderModalActionButtons(ability.id, 'ability') + renderCardActionButtons('ability') + renderAbilityCard(ability);
    attachAbilityCardEvents(ability, () => {
        loadSavedAbilities();
        refreshAbilityGrids();
    });
    attachModalActionEvents(body, ability);
    attachCardActionEvents(body, 'ability', ability);
}

function openMobModal(mob, world) {
    isModalOpen = true;
    const overlay = document.getElementById('library-modal-overlay');
    const body = document.getElementById('library-modal-body');
    overlay.style.display = 'flex';
    body.innerHTML = renderModalActionButtons(mob.id, 'mob', world) + renderCardActionButtons('mob') + renderMobCard(mob, world);
    attachModalActionEvents(body, mob, world);
    attachCardActionEvents(body, 'mob', mob, world);
    attachMobCardEvents(mob, world, () => {
        loadSavedMobs();
        refreshMobGrids();
    });

    const extraBtn = body.querySelector('.mob-extra-info-btn');
    if (extraBtn) {
        extraBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLibExtraInfo(mob);
        });
    }
}

function openLibExtraInfo(mob) {
    const overlay = document.getElementById('lib-extra-info-overlay');
    const body = document.getElementById('lib-extra-info-body');
    overlay.style.display = 'flex';
    body.innerHTML = `
        <div class="extra-info-modal">
            <div class="extra-info-header">
                <h2>${escapeHtml(mob.data.name)}</h2>
                <span class="extra-info-subtitle">Supporting Information</span>
            </div>
            <div class="extra-info-body-content">
                <p>${escapeHtml(mob.data.extraInfo)}</p>
            </div>
        </div>`;
}

function closeLibExtraInfo() {
    document.getElementById('lib-extra-info-overlay').style.display = 'none';
}

function closeModal() {
    isModalOpen = false;
    document.getElementById('library-modal-overlay').style.display = 'none';
}

let draggingItemType = null; // 'ability' | 'mob'

function attachLibCardEvents() {
    const main = document.querySelector('.lib-main');
    if (!main) return;

    main.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.lib-card');
        if (!card) return;
        let key, type;
        if (card.dataset.abilityId) {
            type = 'ability';
            key = `ability:${card.dataset.abilityId}`;
        } else if (card.dataset.libMobId) {
            type = 'mob';
            key = `mob:${card.dataset.libMobId}:${card.dataset.libMobWorld}`;
        } else return;
        draggingItemType = type;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
        card.classList.add('is-dragging');
        document.body.classList.add('lib-dragging');
        document.body.dataset.dragType = type;
    });

    main.addEventListener('dragend', (e) => {
        const card = e.target.closest('.lib-card');
        if (card) card.classList.remove('is-dragging');
        document.body.classList.remove('lib-dragging');
        delete document.body.dataset.dragType;
        draggingItemType = null;
    });

    main.addEventListener('click', (e) => {
        // Search row click: open item modal; jump arrow: navigate to folder
        const jumpBtn = e.target.closest('.lib-search-jump');
        if (jumpBtn) {
            e.stopPropagation();
            const row = jumpBtn.closest('.lib-search-row');
            const key = row?.dataset.searchJump;
            if (key) {
                activeKey = key;
                searchQuery = '';
                refreshLibContent();
            }
            return;
        }
        const searchRow = e.target.closest('.lib-search-row');
        if (searchRow) {
            const open = searchRow.dataset.searchOpen;
            if (open) {
                if (open.startsWith('ability:')) {
                    const id = open.slice('ability:'.length);
                    const a = savedAbilities.find(x => x.id === id);
                    if (a) openAbilityModal(a);
                } else if (open.startsWith('mob:')) {
                    const rest = open.slice('mob:'.length);
                    const lastColon = rest.lastIndexOf(':');
                    const id = rest.slice(0, lastColon);
                    const world = rest.slice(lastColon + 1);
                    const all = mobGroups.flatMap(g => g.mobs);
                    const entry = all.find(x => x.mob.id === id && x.world === world);
                    if (entry) openMobModal(entry.mob, entry.world);
                }
            }
            return;
        }

        // Hover Select button: enter bulk mode + select this card
        const selBtn = e.target.closest('[data-select-key]');
        if (selBtn) {
            e.stopPropagation();
            const key = selBtn.dataset.selectKey;
            if (!printMode) {
                printMode = true;
                printSelected.clear();
                printSelected.add(key);
                refreshPage();
            } else {
                togglePrintSelection(key);
            }
            return;
        }

        // Print-mode: card click toggles selection
        if (printMode) {
            const card = e.target.closest('.lib-card');
            if (card) {
                e.stopPropagation();
                const key = card.dataset.printKey;
                if (key) togglePrintSelection(key);
            }
            return;
        }

        // Hover actions: favorite
        const favA = e.target.closest('[data-fav-ability-id]');
        if (favA) {
            e.stopPropagation();
            toggleAbilityFavorite(favA.dataset.favAbilityId);
            loadSavedAbilities();
            refreshLibContent();
            return;
        }
        const favM = e.target.closest('[data-fav-mob-id]');
        if (favM) {
            e.stopPropagation();
            toggleMobFavorite(favM.dataset.favMobId);
            loadSavedMobs();
            refreshLibContent();
            return;
        }

        // Hover actions: remove
        const remA = e.target.closest('[data-remove-ability-id]');
        if (remA) {
            e.stopPropagation();
            const id = remA.dataset.removeAbilityId;
            if (isCustomAbility(id)) {
                if (confirm('Permanently delete this custom ability?')) {
                    deleteCustomAbility(id);
                    refreshPage();
                }
            } else {
                removeAbility(id);
                refreshPage();
            }
            return;
        }
        const remM = e.target.closest('[data-remove-mob-id]');
        if (remM) {
            e.stopPropagation();
            const id = remM.dataset.removeMobId;
            if (isCustomMob(id)) {
                if (confirm('Permanently delete this custom mob?')) {
                    deleteCustomMob(id);
                    refreshPage();
                }
            } else {
                removeMob(id);
                refreshPage();
            }
            return;
        }

        // Card click: open modal
        const card = e.target.closest('.lib-card');
        if (!card) return;
        if (card.dataset.abilityId) {
            const ability = savedAbilities.find(a => a.id === card.dataset.abilityId);
            if (ability) openAbilityModal(ability);
        } else if (card.dataset.libMobId) {
            const worldKey = card.dataset.libMobWorld;
            const all = mobGroups.flatMap(g => g.mobs);
            const entry = all.find(e2 => e2.mob.id === card.dataset.libMobId && e2.world === worldKey);
            if (entry) openMobModal(entry.mob, entry.world);
        }
    });
}

function refreshLibContent() {
    const header = document.querySelector('.lib-header');
    const side = document.querySelector('.lib-side');
    const main = document.querySelector('.lib-main');
    if (!header || !side || !main) {
        refreshPage();
        return;
    }
    loadSavedAbilities();
    loadSavedMobs();
    header.outerHTML = renderLibHeader();
    side.innerHTML = renderSidebar();
    main.innerHTML = renderMainPane();
    attachLibChromeEvents();
    // .lib-main delegate persists; do not reattach
}

function attachLibChromeEvents() {
    // Sidebar rows
    document.querySelectorAll('[data-active-key]').forEach(row => {
        row.addEventListener('click', () => {
            activeKey = row.dataset.activeKey;
            refreshLibContent();
        });
        // Drop targets
        row.addEventListener('dragover', (e) => {
            const key = row.dataset.activeKey;
            const acceptable = isDropAcceptable(key, draggingItemType);
            if (!acceptable) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            row.classList.add('is-drop-target');
        });
        row.addEventListener('dragleave', () => {
            row.classList.remove('is-drop-target');
        });
        row.addEventListener('drop', (e) => {
            row.classList.remove('is-drop-target');
            const key = row.dataset.activeKey;
            if (!isDropAcceptable(key, draggingItemType)) return;
            e.preventDefault();
            const itemKey = e.dataTransfer.getData('text/plain');
            const p = parseSelKey(itemKey);
            if (!p) return;
            applyDrop(p, key);
        });
    });

    // Sidebar edit folder pencil
    document.querySelectorAll('[data-edit-folder]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const [type, id] = btn.dataset.editFolder.split(':');
            showFolderEditPopover(type, id);
        });
    });

    // New folder buttons
    const newAFBtn = document.getElementById('lib-new-ability-folder');
    if (newAFBtn) newAFBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('Folder name:');
        if (name && name.trim()) {
            const f = createAbilityFolder(name);
            activeKey = `a-folder:${f.id}`;
            refreshLibContent();
        }
    });
    const newMFBtn = document.getElementById('lib-new-mob-folder');
    if (newMFBtn) newMFBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('Folder name:');
        if (name && name.trim()) {
            const f = createMobFolder(name);
            activeKey = `m-folder:${f.id}`;
            refreshLibContent();
        }
    });

    // Header search
    const searchInput = document.getElementById('lib-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            const main = document.querySelector('.lib-main');
            if (main) {
                main.innerHTML = renderMainPane();
                attachMainPaneTools();
            }
            const clearBtn = document.querySelector('.lib-search-clear');
            if (searchQuery && !clearBtn) {
                searchInput.parentElement.insertAdjacentHTML('beforeend', '<button class="lib-search-clear" id="lib-search-clear" title="Clear">&times;</button>');
                document.getElementById('lib-search-clear').addEventListener('click', () => {
                    searchQuery = '';
                    refreshLibContent();
                });
            } else if (!searchQuery && clearBtn) {
                clearBtn.remove();
            }
        });
    }
    const searchClear = document.getElementById('lib-search-clear');
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchQuery = '';
            refreshLibContent();
        });
    }

    // Segment tabs
    document.querySelectorAll('[data-segment]').forEach(btn => {
        btn.addEventListener('click', () => {
            segmentTab = btn.dataset.segment;
            refreshLibContent();
        });
    });

    // Create dropdown
    const createBtn = document.getElementById('lib-create-btn');
    const createMenu = document.getElementById('lib-create-menu');
    if (createBtn && createMenu) {
        createBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = createMenu.style.display !== 'none';
            createMenu.style.display = open ? 'none' : 'block';
        });
        document.addEventListener('click', () => { createMenu.style.display = 'none'; }, { once: true });
        createMenu.addEventListener('click', (e) => e.stopPropagation());
        createMenu.querySelectorAll('[data-create]').forEach(item => {
            item.addEventListener('click', () => {
                createMenu.style.display = 'none';
                const what = item.dataset.create;
                if (what === 'ability') startNewAbility();
                else if (what === 'mob') startNewMob();
                else if (what === 'ability-folder') {
                    const name = prompt('Folder name:');
                    if (name && name.trim()) {
                        const f = createAbilityFolder(name);
                        activeKey = `a-folder:${f.id}`;
                        refreshLibContent();
                    }
                } else if (what === 'mob-folder') {
                    const name = prompt('Folder name:');
                    if (name && name.trim()) {
                        const f = createMobFolder(name);
                        activeKey = `m-folder:${f.id}`;
                        refreshLibContent();
                    }
                }
            });
        });
    }

    // Header print button
    const printBtn = document.getElementById('lib-print-btn');
    if (printBtn) printBtn.addEventListener('click', enterPrintMode);

    // Sidebar footer
    const sidePrintBtn = document.getElementById('lib-side-print');
    if (sidePrintBtn) sidePrintBtn.addEventListener('click', enterPrintMode);

    attachMainPaneTools();
}

function attachMainPaneTools() {
    const editFolder = document.getElementById('lib-edit-active-folder');
    if (editFolder) {
        editFolder.addEventListener('click', () => {
            if (activeKey.startsWith('a-folder:')) {
                showFolderEditPopover('ability', activeKey.slice('a-folder:'.length));
            } else if (activeKey.startsWith('m-folder:')) {
                showFolderEditPopover('mob', activeKey.slice('m-folder:'.length));
            }
        });
    }
    const delFolder = document.getElementById('lib-delete-active-folder');
    if (delFolder) {
        delFolder.addEventListener('click', () => {
            if (activeKey.startsWith('a-folder:')) {
                if (confirm('Delete this folder? Items move to Unfiled.')) {
                    deleteAbilityFolder(activeKey.slice('a-folder:'.length));
                    activeKey = 'all';
                    refreshLibContent();
                }
            } else if (activeKey.startsWith('m-folder:')) {
                if (confirm('Delete this folder? Items move back to their campaign.')) {
                    deleteMobFolder(activeKey.slice('m-folder:'.length));
                    activeKey = 'all';
                    refreshLibContent();
                }
            }
        });
    }
    const clearWorld = document.getElementById('lib-clear-world');
    if (clearWorld) {
        clearWorld.addEventListener('click', () => {
            const w = clearWorld.dataset.world;
            const wn = getWorldName(w) || w;
            if (confirm(`Clear all saved ${wn} mobs?`)) {
                removeMobsByWorld(w);
                activeKey = 'all';
                refreshPage();
            }
        });
    }
}

function isDropAcceptable(rowKey, itemType) {
    if (!itemType) return false;
    if (itemType === 'ability') {
        return rowKey === 'a-unfiled' || rowKey.startsWith('a-folder:');
    }
    if (itemType === 'mob') {
        return rowKey.startsWith('m-folder:') || rowKey.startsWith('m-world:');
    }
    return false;
}

function applyDrop(item, rowKey) {
    if (item.type === 'ability') {
        if (rowKey === 'a-unfiled') setAbilityFolder(item.id, null);
        else if (rowKey.startsWith('a-folder:')) setAbilityFolder(item.id, rowKey.slice('a-folder:'.length));
    } else if (item.type === 'mob') {
        if (rowKey.startsWith('m-folder:')) setMobFolder(item.id, rowKey.slice('m-folder:'.length));
        else if (rowKey.startsWith('m-world:')) setMobFolder(item.id, null);
    }
    refreshLibContent();
}

function attachBulkBarEvents() {
    const selectAllBtn = document.getElementById('bulk-select-all');
    if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllForPrint);

    const clearBtn2 = document.getElementById('bulk-clear');
    if (clearBtn2) clearBtn2.addEventListener('click', deselectAllForPrint);

    const moveBtn = document.getElementById('bulk-move');
    if (moveBtn) moveBtn.addEventListener('click', showBulkMovePopover);

    const favBtn = document.getElementById('bulk-favorite');
    if (favBtn) favBtn.addEventListener('click', bulkFavorite);

    const printBtn2 = document.getElementById('bulk-print');
    if (printBtn2) printBtn2.addEventListener('click', executePrint);

    const delBtn = document.getElementById('bulk-delete');
    if (delBtn) delBtn.addEventListener('click', bulkDelete);

    const cancelBtn = document.getElementById('print-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', exitPrintMode);
}

function parseSelKey(key) {
    if (key.startsWith('ability:')) return { type: 'ability', id: key.slice('ability:'.length) };
    if (key.startsWith('mob:')) {
        const rest = key.slice('mob:'.length);
        const i = rest.lastIndexOf(':');
        return { type: 'mob', id: rest.slice(0, i), world: rest.slice(i + 1) };
    }
    return null;
}

function bulkFavorite() {
    for (const key of printSelected) {
        const p = parseSelKey(key);
        if (!p) continue;
        if (p.type === 'ability' && !isAbilityFavorited(p.id)) toggleAbilityFavorite(p.id);
        if (p.type === 'mob' && !isMobFavorited(p.id)) toggleMobFavorite(p.id);
    }
    printSelected.clear();
    printMode = false;
    refreshPage();
}

function bulkDelete() {
    if (!confirm(`Remove ${printSelected.size} item(s) from your library?`)) return;
    for (const key of printSelected) {
        const p = parseSelKey(key);
        if (!p) continue;
        if (p.type === 'ability') {
            if (isCustomAbility(p.id)) deleteCustomAbility(p.id);
            else removeAbility(p.id);
        } else {
            if (isCustomMob(p.id)) deleteCustomMob(p.id);
            else removeMob(p.id);
        }
    }
    printSelected.clear();
    printMode = false;
    refreshPage();
}

function showBulkMovePopover() {
    const overlay = document.getElementById('lib-folder-edit-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Determine which kinds of folders to show: abilities, mobs, or both
    let hasAbility = false, hasMob = false;
    for (const key of printSelected) {
        const p = parseSelKey(key);
        if (p?.type === 'ability') hasAbility = true;
        if (p?.type === 'mob') hasMob = true;
    }

    const aFolders = getAbilityFolders();
    const mFolders = getMobFolders();

    let html = `<div class="lib-popover" onclick="event.stopPropagation()">
        <div class="lib-popover-head">
            <span>Move ${printSelected.size} item${printSelected.size === 1 ? '' : 's'} to…</span>
            <button id="lib-pop-close"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div class="lib-popover-body lib-move-list">`;
    if (hasAbility) {
        html += `<div class="lib-popover-label">Ability folders</div>`;
        html += `<button class="lib-move-row" data-move="ability:"><span class="lib-row-dot" style="background:${tint('slate').dot}"></span>Unfiled</button>`;
        for (const f of aFolders) {
            html += `<button class="lib-move-row" data-move="ability:${f.id}"><span class="lib-row-dot" style="background:${tint(f.tint).dot}"></span>${escapeHtml(f.name)}</button>`;
        }
    }
    if (hasMob) {
        html += `<div class="lib-popover-label">Mob folders</div>`;
        html += `<button class="lib-move-row" data-move="mob:"><span class="lib-row-dot" style="background:${tint('emerald').dot}"></span>Default (campaign)</button>`;
        for (const f of mFolders) {
            html += `<button class="lib-move-row" data-move="mob:${f.id}"><span class="lib-row-dot" style="background:${tint(f.tint).dot}"></span>${escapeHtml(f.name)}</button>`;
        }
    }
    html += `</div></div>`;
    overlay.innerHTML = html;

    function close() {
        overlay.style.display = 'none';
        overlay.innerHTML = '';
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }, { once: true });
    document.getElementById('lib-pop-close').addEventListener('click', close);

    overlay.querySelectorAll('.lib-move-row').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.move; // "ability:<id>" or "mob:<id>" or "ability:" / "mob:"
            const colon = target.indexOf(':');
            const targetType = target.slice(0, colon);
            const targetFolderId = target.slice(colon + 1) || null;
            for (const key of printSelected) {
                const p = parseSelKey(key);
                if (!p) continue;
                if (p.type !== targetType) continue;
                if (p.type === 'ability') setAbilityFolder(p.id, targetFolderId);
                else setMobFolder(p.id, targetFolderId);
            }
            close();
            printSelected.clear();
            printMode = false;
            refreshPage();
        });
    });
}

function startNewAbility() {
    const blank = {
        id: crypto.randomUUID(),
        data: { abilityName: '', abilityDescription: '', power: 1, complexity: 1, tags: [] }
    };
    for (let i = 1; i <= 5; i++) {
        blank.data[`level${i}Cost`] = '';
        blank.data[`level${i}Description`] = '';
    }
    showAbilityEditModal(blank, (updated) => {
        saveCustomAbility(updated);
        refreshPage();
    });
}

function startNewMob() {
    const blank = {
        id: crypto.randomUUID(),
        data: {
            name: '', subtitle: '', description: '', health: '', focus: '', tags: [],
            stats: {}, weapons: [], tacticsDescription: '', abilities: [], loot: [], specialties: [], extraInfo: ''
        }
    };
    showMobEditModal(blank, 'custom', (updated) => {
        saveCustomMob(updated);
        refreshPage();
    });
}

function removeMobsByWorld(worldKey) {
    const worldMobs = savedMobsByWorld[worldKey] || [];
    for (const entry of worldMobs) {
        if (isCustomMob(entry.mob.id)) {
            deleteCustomMob(entry.mob.id);
        } else {
            removeMob(entry.mob.id);
        }
    }
}

export function init() {
    const browseBtn = document.getElementById('browse-btn');
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            location.hash = '#/';
        });
    }

    const clearBtn = document.getElementById('clear-library');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear your entire library?')) {
                clearAll();
                closeModal();
                refreshPage();
            }
        });
    }

    if (printMode) attachBulkBarEvents();

    // Export library
    const exportBtn = document.getElementById('export-library');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const json = exportLibrary();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `phoenix-library-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Import library
    const importInput = document.getElementById('import-library-input');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const result = importLibrary(event.target.result);
                    refreshPage();
                    alert(`Library imported successfully! (${result.abilitiesAdded} abilities, ${result.mobsAdded} mobs)`);
                } catch (err) {
                    alert('Failed to import library: ' + err.message);
                }
                importInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    attachLibChromeEvents();
    attachLibCardEvents();

    // Modal events
    const modalOverlay = document.getElementById('library-modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    const modalClose = document.getElementById('library-modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    const modalContent = document.getElementById('library-modal-content');
    if (modalContent) {
        modalContent.addEventListener('click', (e) => e.stopPropagation());
    }

    // Extra info modal events
    const extraOverlay = document.getElementById('lib-extra-info-overlay');
    if (extraOverlay) {
        extraOverlay.addEventListener('click', (e) => {
            if (e.target === extraOverlay) closeLibExtraInfo();
        });
    }

    const extraClose = document.getElementById('lib-extra-info-close');
    if (extraClose) extraClose.addEventListener('click', closeLibExtraInfo);

    const extraContent = document.getElementById('lib-extra-info-content');
    if (extraContent) {
        extraContent.addEventListener('click', (e) => e.stopPropagation());
    }
}
