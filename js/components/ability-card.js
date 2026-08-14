import { isAbilitySaved, addAbility, removeAbility } from '../services/storage-service.js';
import { hasLevel, getLevelDescription, getLevelCost, isPassive } from '../services/ability-service.js';
import { escapeHtml } from '../utils/sanitize.js';

function getSubtitle(ability) {
    const worldTags = ['Barbarus', 'Rifts and Rivets', 'The City', 'PHOENIX'];
    const subtitle = ability.data.tags.find(t => worldTags.includes(t));
    return subtitle || (ability.data.tags[0] || '');
}

function renderLevelSection(data, level) {
    const has = hasLevel(data, level);
    const desc = getLevelDescription(data, level);
    const cost = getLevelCost(data, level);
    const passive = isPassive(data, level);

    return `
    <div class="level-section">
        <div class="level-badge">
            <span class="level-number">${level}</span>
            <span class="level-label">Level ${level}</span>
        </div>
        <div class="level-content">
            ${has
                ? `<div class="ability-type">${passive ? 'Passive' : escapeHtml(cost)}</div>
                   <p class="level-description">${escapeHtml(desc)}</p>`
                : `<div class="ability-type">N/A</div>
                   <p class="level-description na">N/A</p>`
            }
        </div>
    </div>`;
}

export function renderAbilityCard(ability) {
    const saved = isAbilitySaved(ability.id);
    const data = ability.data;
    const leftPageMaxLevel = 2;

    let leftLevels = '';
    for (let i = 1; i <= leftPageMaxLevel; i++) {
        leftLevels += renderLevelSection(data, i);
    }

    let rightLevels = '';
    for (let i = leftPageMaxLevel + 1; i <= 5; i++) {
        rightLevels += renderLevelSection(data, i);
    }

    return `
    <div class="ability-card-wrapper">
        <div class="stats-bar">
            <div class="stat-badges">
                <span class="stat-badge">Power: ${parseInt(data.power) || 0}</span>
                <span class="stat-badge">Complexity: ${parseInt(data.complexity) || 0}</span>
            </div>
            <button class="save-button ${saved ? 'saved' : ''}" data-ability-id="${escapeHtml(ability.id)}">
                <span>${saved ? '\u2605 In Library' : 'Add to Library'}</span>
            </button>
        </div>

        <div class="ability-card-container">
            <div class="ability-page">
                <div class="card-header">
                    <h2 class="ability-title">${escapeHtml(data.abilityName)}</h2>
                    <div class="ability-subtitle">${escapeHtml(getSubtitle(ability))}</div>
                </div>
                <div class="card-content">
                    <div class="description-section">
                        <h3>Description</h3>
                        <p>${escapeHtml(data.abilityDescription)}</p>
                    </div>
                    ${leftLevels}
                </div>
            </div>

            <div class="ability-page">
                <div class="card-content">
                    ${rightLevels}
                </div>
            </div>
        </div>

        <div class="tags-section">
            ${data.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            ${data.extraInfo ? `<button class="ability-extra-info-btn" data-ability-id="${escapeHtml(ability.id)}">Supporting Info</button>` : ''}
        </div>
    </div>`;
}

export function scaleAbilityPages() {
    // No-op: pages now grow to fit content (min-height keeps a baseline,
    // flex/grid parent stretches both pages to equal height).
    document.querySelectorAll('.ability-page .card-content').forEach(content => {
        content.style.transform = '';
        content.style.width = '';
        content.style.height = '';
    });
}

export function attachAbilityCardEvents(ability, onToggle) {
    const btn = document.querySelector(`.save-button[data-ability-id="${ability.id}"]`);
    if (!btn) return;

    // Scale pages to fit fixed height
    scaleAbilityPages();

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const saved = isAbilitySaved(ability.id);
        if (saved) {
            removeAbility(ability.id);
        } else {
            addAbility(ability.id);
        }
        btn.classList.toggle('saved');
        btn.querySelector('span').textContent = isAbilitySaved(ability.id) ? '\u2605 In Library' : 'Add to Library';
        if (onToggle) onToggle();
    });
}
