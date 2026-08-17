import { isMobSaved, addMob, removeMob } from '../services/storage-service.js';
import { escapeHtml } from '../utils/sanitize.js';
import { renderMarkdown } from '../utils/markdown.js';

function renderStatRow(label1, value1, label2, value2) {
    return `<tr>
        <td class="mob-stat-label">${label1}</td>
        <td class="mob-stat-value">${escapeHtml(value1) || '\u2014'}</td>
        <td class="mob-stat-label">${label2}</td>
        <td class="mob-stat-value">${escapeHtml(value2) || '\u2014'}</td>
    </tr>`;
}

function renderSpecialtyCell(specialty) {
    if (!specialty) return '<td colspan="2" class="mob-specialty-cell"></td>';
    return `<td colspan="2" class="mob-specialty-cell">
        <span class="mob-specialty-tree">\u2514</span>
        <span class="mob-specialty-name">${escapeHtml(specialty.name)}</span>
        <span class="mob-specialty-value">${escapeHtml(specialty.value) || '\u2014'}</span>
    </td>`;
}

function renderSpecialtySubRow(specialty) {
    return `<tr class="mob-specialty-row">
        <td colspan="4" class="mob-specialty-cell">
            <span class="mob-specialty-tree">\u2514</span>
            <span class="mob-specialty-name">${escapeHtml(specialty.name)}</span>
            <span class="mob-specialty-value">${escapeHtml(specialty.value) || '\u2014'}</span>
        </td>
    </tr>`;
}

function specialtiesFor(specialties, key) {
    return (specialties || []).filter(s => (s.stat || 'dex') === key);
}

function renderStatBlock(stats, specialties) {
    const pairs = [
        ['str', 'STR', 'wil', 'WIL'],
        ['end', 'END', 'per', 'PER'],
        ['dex', 'DEX', 'cha', 'CHA'],
        ['int', 'INT', 'def', 'DEF']
    ];

    let html = '';
    for (const [k1, l1, k2, l2] of pairs) {
        html += renderStatRow(l1, stats[k1], l2 || '', k2 ? stats[k2] : '');
        const s1 = specialtiesFor(specialties, k1);
        const s2 = k2 ? specialtiesFor(specialties, k2) : [];
        const rows = Math.max(s1.length, s2.length);
        for (let i = 0; i < rows; i++) {
            html += `<tr class="mob-specialty-row">${renderSpecialtyCell(s1[i])}${renderSpecialtyCell(s2[i])}</tr>`;
        }
    }
    // Any specialties without a recognized parent stat
    const recognised = new Set(['str','wil','end','per','dex','cha','def','int']);
    const orphans = (specialties || []).filter(s => !recognised.has(s.stat || 'dex'));
    for (const s of orphans) html += renderSpecialtySubRow(s);
    return html;
}

export function renderMobCard(mob, world) {
    const d = mob.data;
    const stats = d.stats || {};
    const saved = isMobSaved(mob.id);

    const weaponsHtml = (d.weapons || []).map(w =>
        `<div class="mob-weapon-entry">
            <span class="mob-weapon-name">${escapeHtml(w.name)}</span>
            <span class="mob-weapon-damage">${escapeHtml(w.damage)}</span>
        </div>`
    ).join('');

    const abilitiesHtml = (d.abilities || []).map(a =>
        `<div class="mob-ability-entry">
            <div class="mob-ability-header">
                <span class="mob-ability-name">${escapeHtml(a.name)}</span>
                <span class="mob-ability-cost">${escapeHtml(a.cost)}</span>
            </div>
            <div class="mob-ability-desc md-body">${renderMarkdown(a.description)}</div>
        </div>`
    ).join('');

    const lootHtml = (d.loot || []).map(l =>
        `<li>${escapeHtml(l)}</li>`
    ).join('');

    const tagsHtml = (d.tags || []).map(t =>
        `<span class="mob-tag-bubble">${escapeHtml(t)}</span>`
    ).join('');

    return `
    <div class="mob-card-wrapper">
        <div class="mob-save-bar">
            ${(d.power || d.complexity) ? `<div class="stat-badges">
                <span class="stat-badge">Power: ${parseInt(d.power) || 0}</span>
                <span class="stat-badge">Complexity: ${parseInt(d.complexity) || 0}</span>
            </div>` : ''}
            <button class="save-button ${saved ? 'saved' : ''}" data-mob-save-id="${escapeHtml(mob.id)}" data-mob-world="${escapeHtml(world || '')}">
                <span>${saved ? '\u2605 In Library' : 'Add to Library'}</span>
            </button>
        </div>
        <div class="mob-card">
            <div class="mob-card-header">
                <h2 class="mob-name">${escapeHtml(d.name)}</h2>
                ${d.subtitle ? `<div class="mob-subtitle">${escapeHtml(d.subtitle)}</div>` : ''}
            </div>

            <div class="mob-card-body">
                <div class="mob-section">
                    <div class="mob-description md-body">${renderMarkdown(d.description)}</div>
                </div>

                <div class="mob-vitals">
                    <span class="mob-vital"><strong>Health:</strong> ${escapeHtml(d.health)}</span>
                    <span class="mob-vital"><strong>Focus:</strong> ${escapeHtml(d.focus)}</span>
                </div>

                <div class="mob-section">
                    <div class="mob-section-header">Stat Modifiers</div>
                    <table class="mob-stat-table">
                        <tbody>
                            ${renderStatBlock(stats, d.specialties)}
                        </tbody>
                    </table>
                </div>

                ${(d.weapons && d.weapons.length > 0) ? `
                <div class="mob-section">
                    <div class="mob-section-header">Weapon Information</div>
                    ${weaponsHtml}
                </div>` : ''}

                <div class="mob-section mob-section-tactics">
                    <div class="mob-section-header">Tactics & Abilities</div>
                    ${d.tacticsDescription ? `<div class="mob-tactics md-body">${renderMarkdown(d.tacticsDescription)}</div>` : ''}
                    ${abilitiesHtml}
                </div>

                ${(d.loot && d.loot.length > 0) ? `
                <div class="mob-section">
                    <div class="mob-section-header">Loot</div>
                    <ul class="mob-loot-list">${lootHtml}</ul>
                </div>` : ''}
            </div>
        </div>

        <div class="mob-card-footer">
            <div class="mob-tag-bubbles">${tagsHtml}</div>
            ${d.extraInfo ? `<button class="mob-extra-info-btn" data-mob-id="${escapeHtml(mob.id)}">Supporting Info</button>` : ''}
        </div>
    </div>`;
}

export function attachMobCardEvents(mob, world, onToggle) {
    const btn = document.querySelector(`.save-button[data-mob-save-id="${mob.id}"]`);
    if (!btn) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const saved = isMobSaved(mob.id);
        if (saved) {
            removeMob(mob.id);
        } else {
            addMob(mob.id, world);
        }
        btn.classList.toggle('saved');
        btn.querySelector('span').textContent = isMobSaved(mob.id) ? '\u2605 In Library' : 'Add to Library';
        if (onToggle) onToggle();
    });
}
