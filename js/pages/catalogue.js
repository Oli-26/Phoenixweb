import { escapeHtml } from '../utils/sanitize.js';
import { renderAbilityEditModal, showAbilityEditModal } from '../components/ability-edit-modal.js';
import { renderMobEditModal, showMobEditModal } from '../components/mob-edit-modal.js';
import { isAdmin } from '../services/design-service.js';
import {
    listCatalog, getCatalogItem, saveCatalogAbility, saveCatalogMob,
    setCatalogPublished, deleteCatalogItem, invalidateCatalogCache,
    exportCatalog, parseCatalogImport, bulkUpsertCatalog
} from '../services/catalog-service.js';
import { getAllWorldKeys, getWorldName } from '../services/mob-service.js';

let rows = [];
let filter = 'ability';
let searchTerm = '';

export function renderCataloguePanel() {
    const worldTabs = getAllWorldKeys().map(w =>
        `<button data-filter="mob:${w}">${escapeHtml(getWorldName(w))}</button>`
    ).join('');

    return `
    <div id="catalogue-panel">
        <p class="review-subtitle">The official abilities and mobs everyone sees. Edits go live for visitors on their next load.</p>
        <div class="catalogue-bulk-actions">
            <button class="modal-action-btn" id="catalogue-export">Download all JSON</button>
            <label class="modal-action-btn catalogue-upload-label" for="catalogue-import">Upload JSON</label>
            <input type="file" id="catalogue-import" accept="application/json,.json" hidden>
            <label class="catalogue-world-label">World for raw mob files
                <select id="catalogue-import-world">
                    ${getAllWorldKeys().map(w => `<option value="${escapeHtml(w)}">${escapeHtml(getWorldName(w))}</option>`).join('')}
                </select>
            </label>
            <span id="catalogue-bulk-status" role="status"></span>
        </div>
        <div class="filters-container">
            <div class="filter-group">
                <div class="filter-label">Show</div>
                <div class="numeric-filters community-kind-filters" id="catalogue-filter">
                    <button data-filter="ability">Abilities</button>
                    ${worldTabs}
                </div>
            </div>
            <div class="filter-group">
                <div class="filter-label">Add</div>
                <div class="numeric-filters community-kind-filters">
                    <button id="catalogue-new-ability">+ Ability</button>
                    <button id="catalogue-new-mob">+ Mob</button>
                </div>
            </div>
        </div>
        <div class="search-section">
            <input type="text" class="search-input" id="catalogue-search"
                placeholder="Search the catalogue..." value="${escapeHtml(searchTerm)}" />
        </div>
        <div id="catalogue-body"><p class="review-empty">Loading…</p></div>
    </div>
    ${renderAbilityEditModal()}
    ${renderMobEditModal()}`;
}

export function initCataloguePanel() {
    updateFilterButtons();

    document.getElementById('catalogue-search')?.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderRows();
    });

    document.getElementById('catalogue-filter')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-filter]');
        if (!btn) return;
        filter = btn.dataset.filter;
        updateFilterButtons();
        renderRows();
    });

    document.getElementById('catalogue-new-ability')?.addEventListener('click', startNewAbility);
    document.getElementById('catalogue-new-mob')?.addEventListener('click', startNewMob);
    document.getElementById('catalogue-export')?.addEventListener('click', downloadExport);
    document.getElementById('catalogue-import')?.addEventListener('change', uploadImport);
    refreshCatalogue();
}

function updateFilterButtons() {
    document.querySelectorAll('#catalogue-filter button').forEach(btn => {
        btn.className = btn.dataset.filter === filter ? 'active' : '';
    });
}

export async function refreshCatalogue() {
    const body = document.getElementById('catalogue-body');
    if (!body) return;

    if (!isAdmin()) {
        body.innerHTML = '<p class="review-empty">Sign in with an admin account to edit the catalogue.</p>';
        return;
    }

    try {
        rows = await listCatalog();
    } catch (err) {
        body.innerHTML = `<p class="review-empty">Could not load the catalogue: ${escapeHtml(err.message)}</p>`;
        return;
    }

    renderRows();
}

async function downloadExport() {
    const status = document.getElementById('catalogue-bulk-status');
    try {
        if (status) status.textContent = 'Preparing download…';
        const data = await exportCatalog();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `phoenix-catalogue-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        if (status) status.textContent = `Downloaded ${data.abilities.length + Object.values(data.mobs).flat().length} items.`;
    } catch (err) {
        if (status) status.textContent = '';
        alert('Could not download the catalogue: ' + err.message);
    }
}

async function uploadImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const status = document.getElementById('catalogue-bulk-status');
    if (!file) return;

    try {
        const world = document.getElementById('catalogue-import-world')?.value;
        const { rows: imported, skipped } = parseCatalogImport(await file.text(), world);
        const details = `${imported.length} item${imported.length === 1 ? '' : 's'}` +
            (skipped.length ? ` (${skipped.length} invalid skipped)` : '');
        if (!confirm(`Import ${details} from “${file.name}”? Existing matching IDs will be overwritten; other catalogue items will be left alone.`)) return;

        await bulkUpsertCatalog(imported, (done, total) => {
            if (status) status.textContent = `Uploading ${done}/${total}…`;
        });
        invalidateCatalogCache();
        if (status) status.textContent = `Imported ${details}.`;
        await refreshCatalogue();
    } catch (err) {
        if (status) status.textContent = '';
        alert('Could not import that file: ' + err.message);
    } finally {
        input.value = '';
    }
}

function visibleRows() {
    const [kind, world] = filter.split(':');
    let results = rows.filter(r => r.kind === kind && (!world || r.world === world));

    if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(r => r.name.toLowerCase().includes(term));
    }

    return results;
}

function renderRows() {
    const body = document.getElementById('catalogue-body');
    if (!body || !isAdmin()) return;

    const items = visibleRows();
    if (items.length === 0) {
        body.innerHTML = '<p class="review-empty">Nothing here yet.</p>';
        return;
    }

    body.innerHTML = `<div class="catalogue-list">${items.map(r => `
        <div class="catalogue-row ${r.published ? '' : 'unpublished'}" data-id="${escapeHtml(r.id)}">
            <div class="catalogue-row-main">
                <span class="catalogue-row-name">${escapeHtml(r.name)}</span>
                ${r.published ? '' : '<span class="mini-tag">Hidden</span>'}
            </div>
            <div class="catalogue-row-actions">
                <button class="modal-action-btn" data-action="edit">Edit</button>
                <button class="modal-action-btn" data-action="publish">${r.published ? 'Hide' : 'Publish'}</button>
                <button class="modal-action-btn" data-action="delete">Delete</button>
            </div>
        </div>`).join('')}</div>`;

    body.querySelectorAll('.catalogue-row').forEach(el => {
        el.querySelector('[data-action="edit"]').addEventListener('click', () => editRow(el.dataset.id));
        el.querySelector('[data-action="publish"]').addEventListener('click', () => togglePublished(el.dataset.id));
        el.querySelector('[data-action="delete"]').addEventListener('click', () => removeRow(el.dataset.id));
    });
}

async function editRow(id) {
    let item;
    try {
        item = await getCatalogItem(id);
    } catch (err) {
        alert('Could not open that entry: ' + err.message);
        return;
    }
    if (!item) return;

    if (item.kind === 'ability') {
        showAbilityEditModal({ id: item.id, data: item.data }, (updated) =>
            commit(() => saveCatalogAbility(updated, { published: item.published })));
    } else {
        showMobEditModal({ id: item.id, data: item.data }, item.world, (updated) =>
            commit(() => saveCatalogMob(updated, item.world, { published: item.published })));
    }
}

function startNewAbility() {
    const blank = {
        id: crypto.randomUUID(),
        data: { abilityName: '', abilityDescription: '', power: 1, complexity: 1, tags: [], extraInfo: '' }
    };
    for (let i = 1; i <= 5; i++) {
        blank.data[`level${i}Cost`] = '';
        blank.data[`level${i}Description`] = '';
    }
    showAbilityEditModal(blank, (updated) => commit(() => saveCatalogAbility(updated)));
}

function startNewMob() {
    const world = filter.startsWith('mob:') ? filter.split(':')[1] : getAllWorldKeys()[0];
    const blank = {
        id: crypto.randomUUID(),
        data: {
            name: '', subtitle: '', description: '', health: '', focus: '', tags: [],
            stats: {}, weapons: [], tacticsDescription: '', abilities: [], loot: [], specialties: [], extraInfo: ''
        }
    };
    showMobEditModal(blank, world, (updated) => commit(() => saveCatalogMob(updated, world)));
}

async function togglePublished(id) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    await commit(() => setCatalogPublished(id, !row.published));
}

async function removeRow(id) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    if (!confirm(`Delete "${row.name}" from the catalogue? Visitors will lose it on their next load.`)) return;
    await commit(() => deleteCatalogItem(id));
}

// Every write invalidates the local snapshot, so the admin's own session shows
// the change instead of serving its cached copy until the revision check runs.
async function commit(action) {
    try {
        await action();
    } catch (err) {
        alert('Could not save: ' + err.message);
        return;
    }
    invalidateCatalogCache();
    await refreshCatalogue();
}
