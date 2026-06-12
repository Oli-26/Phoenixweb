export function renderMobEditModal() {
    return `
    <div id="mob-edit-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="mob-edit-content" style="background: var(--surface, white); padding: 0; max-height: 90vh; max-width: 750px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="mob-edit-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div class="edit-form" id="mob-edit-form"></div>
        </div>
    </div>`;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let currentWeapons = [];
let currentAbilities = [];
let currentLoot = [];
let currentSpecialties = [];

function syncFromInputs() {
    // Sync weapons
    document.querySelectorAll('.edit-weapon-row').forEach((row, i) => {
        if (currentWeapons[i]) {
            currentWeapons[i].name = row.querySelector('.edit-weapon-name')?.value || '';
            currentWeapons[i].damage = row.querySelector('.edit-weapon-damage')?.value || '';
        }
    });
    // Sync abilities
    document.querySelectorAll('.edit-mob-ability-block').forEach((block, i) => {
        if (currentAbilities[i]) {
            currentAbilities[i].name = block.querySelector('.edit-mob-ability-name')?.value || '';
            currentAbilities[i].cost = block.querySelector('.edit-mob-ability-cost')?.value || '';
            currentAbilities[i].description = block.querySelector('.edit-mob-ability-desc')?.value || '';
        }
    });
    // Sync loot
    document.querySelectorAll('.edit-loot-input').forEach((input, i) => {
        if (i < currentLoot.length) {
            currentLoot[i] = input.value;
        }
    });
    // Sync specialties
    document.querySelectorAll('.edit-specialty-row').forEach((row, i) => {
        if (currentSpecialties[i]) {
            currentSpecialties[i].name = row.querySelector('.edit-specialty-name')?.value || '';
            currentSpecialties[i].stat = row.querySelector('.edit-specialty-stat')?.value || 'dex';
            currentSpecialties[i].value = row.querySelector('.edit-specialty-value')?.value || '';
        }
    });
}

function renderWeaponsSection() {
    let html = '<div class="edit-field"><label>Weapons</label><div id="edit-weapons-list">';
    currentWeapons.forEach((w, i) => {
        html += `
        <div class="edit-dynamic-row edit-weapon-row">
            <input type="text" class="edit-weapon-name" value="${escapeAttr(w.name)}" placeholder="Weapon name" />
            <input type="text" class="edit-weapon-damage" value="${escapeAttr(w.damage)}" placeholder="Damage" />
            <button class="edit-remove-item-btn" data-remove-weapon="${i}">&times;</button>
        </div>`;
    });
    html += '</div><button class="edit-add-item-btn" id="add-weapon-btn">+ Add Weapon</button></div>';
    return html;
}

function renderAbilitiesSection() {
    let html = '<div class="edit-field"><label>Abilities</label><div id="edit-abilities-list">';
    currentAbilities.forEach((a, i) => {
        html += `
        <div class="edit-dynamic-block edit-mob-ability-block">
            <div class="edit-dynamic-row">
                <input type="text" class="edit-mob-ability-name" value="${escapeAttr(a.name)}" placeholder="Ability name" />
                <input type="text" class="edit-mob-ability-cost" value="${escapeAttr(a.cost)}" placeholder="Cost" />
                <button class="edit-remove-item-btn" data-remove-ability="${i}">&times;</button>
            </div>
            <textarea class="edit-mob-ability-desc" rows="2" placeholder="Description">${escapeHtml(a.description || '')}</textarea>
        </div>`;
    });
    html += '</div><button class="edit-add-item-btn" id="add-ability-btn">+ Add Ability</button></div>';
    return html;
}

function renderSpecialtiesSection() {
    let html = '<div class="edit-field"><label>Specialties</label><div id="edit-specialties-list">';
    const stats = [
        ['str','STR'], ['end','END'], ['dex','DEX'], ['int','INT'],
        ['wil','WIL'], ['per','PER'], ['cha','CHA'], ['def','DEF']
    ];
    currentSpecialties.forEach((s, i) => {
        html += `
        <div class="edit-dynamic-row edit-specialty-row">
            <input type="text" class="edit-specialty-name" value="${escapeAttr(s.name)}" placeholder="Specialty (e.g. Stealth)" />
            <select class="edit-specialty-stat">
                ${stats.map(([k, label]) => `<option value="${k}" ${s.stat === k ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <input type="text" class="edit-specialty-value" value="${escapeAttr(s.value)}" placeholder="Value (e.g. 2 (+4))" />
            <button class="edit-remove-item-btn" data-remove-specialty="${i}">&times;</button>
        </div>`;
    });
    html += '</div><button class="edit-add-item-btn" id="add-specialty-btn">+ Add Specialty</button></div>';
    return html;
}

function renderLootSection() {
    let html = '<div class="edit-field"><label>Loot</label><div id="edit-loot-list">';
    currentLoot.forEach((l, i) => {
        html += `
        <div class="edit-dynamic-row">
            <input type="text" class="edit-loot-input" value="${escapeAttr(l)}" placeholder="Loot item" />
            <button class="edit-remove-item-btn" data-remove-loot="${i}">&times;</button>
        </div>`;
    });
    html += '</div><button class="edit-add-item-btn" id="add-loot-btn">+ Add Loot</button></div>';
    return html;
}

function renderForm(mob, world) {
    const d = mob.data;
    const s = d.stats || {};

    return `
        <h2 class="edit-form-title">Edit Mob</h2>

        <div class="edit-field">
            <label for="edit-mob-name">Name</label>
            <input type="text" id="edit-mob-name" value="${escapeAttr(d.name)}" placeholder="Mob name" />
        </div>

        <div class="edit-row">
            <div class="edit-field">
                <label for="edit-mob-subtitle">Subtitle</label>
                <input type="text" id="edit-mob-subtitle" value="${escapeAttr(d.subtitle)}" placeholder="Subtitle" />
            </div>
            <div class="edit-field">
                <label for="edit-mob-world">World</label>
                <select id="edit-mob-world">
                    <option value="custom" ${world === 'custom' ? 'selected' : ''}>Custom</option>
                    <option value="barbarus" ${world === 'barbarus' ? 'selected' : ''}>Barbarus</option>
                    <option value="rifts" ${world === 'rifts' ? 'selected' : ''}>Rifts &amp; Rivets</option>
                    <option value="city" ${world === 'city' ? 'selected' : ''}>The City</option>
                </select>
            </div>
        </div>

        <div class="edit-field">
            <label for="edit-mob-desc">Description</label>
            <textarea id="edit-mob-desc" rows="3" placeholder="Description">${escapeHtml(d.description || '')}</textarea>
        </div>

        <div class="edit-row">
            <div class="edit-field">
                <label for="edit-mob-health">Health</label>
                <input type="text" id="edit-mob-health" value="${escapeAttr(d.health)}" placeholder="e.g. 3 (+2)" />
            </div>
            <div class="edit-field">
                <label for="edit-mob-focus">Focus</label>
                <input type="text" id="edit-mob-focus" value="${escapeAttr(d.focus)}" placeholder="e.g. 7" />
            </div>
        </div>

        <div class="edit-row">
            <div class="edit-field">
                <label for="edit-mob-power">Power (1-5)</label>
                <input type="number" id="edit-mob-power" min="1" max="5" value="${d.power || ''}" />
            </div>
            <div class="edit-field">
                <label for="edit-mob-complexity">Complexity (1-5)</label>
                <input type="number" id="edit-mob-complexity" min="1" max="5" value="${d.complexity || ''}" />
            </div>
        </div>

        <div class="edit-field">
            <label for="edit-mob-tags">Tags (comma-separated)</label>
            <input type="text" id="edit-mob-tags" value="${escapeAttr((d.tags || []).join(', '))}" placeholder="Tag1, Tag2" />
        </div>

        <div class="edit-field">
            <label>Stats</label>
            <div class="edit-stats-grid">
                <div class="edit-stat-item">
                    <label for="edit-mob-str">STR</label>
                    <input type="text" id="edit-mob-str" value="${escapeAttr(s.str)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-end">END</label>
                    <input type="text" id="edit-mob-end" value="${escapeAttr(s.end)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-dex">DEX</label>
                    <input type="text" id="edit-mob-dex" value="${escapeAttr(s.dex)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-int">INT</label>
                    <input type="text" id="edit-mob-int" value="${escapeAttr(s.int)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-wil">WIL</label>
                    <input type="text" id="edit-mob-wil" value="${escapeAttr(s.wil)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-per">PER</label>
                    <input type="text" id="edit-mob-per" value="${escapeAttr(s.per)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-cha">CHA</label>
                    <input type="text" id="edit-mob-cha" value="${escapeAttr(s.cha)}" />
                </div>
                <div class="edit-stat-item">
                    <label for="edit-mob-def">DEF</label>
                    <input type="text" id="edit-mob-def" value="${escapeAttr(s.def)}" />
                </div>
            </div>
        </div>

        <div id="edit-specialties-container">${renderSpecialtiesSection()}</div>

        <div id="edit-weapons-container">${renderWeaponsSection()}</div>

        <div class="edit-field">
            <label for="edit-mob-tactics">Tactics</label>
            <textarea id="edit-mob-tactics" rows="2" placeholder="Tactics description">${escapeHtml(d.tacticsDescription || '')}</textarea>
        </div>

        <div id="edit-abilities-container">${renderAbilitiesSection()}</div>

        <div id="edit-loot-container">${renderLootSection()}</div>

        <div class="edit-field">
            <label for="edit-mob-extra">Supporting Info</label>
            <textarea id="edit-mob-extra" rows="3" placeholder="Supporting information / lore">${escapeHtml(d.extraInfo || '')}</textarea>
        </div>

        <div class="edit-form-actions">
            <button class="edit-save-btn" id="mob-edit-save">Save</button>
            <button class="edit-cancel-btn" id="mob-edit-cancel">Cancel</button>
        </div>`;
}

function refreshDynamicSection(containerId, renderFn) {
    syncFromInputs();
    document.getElementById(containerId).innerHTML = renderFn();
}

export function showMobEditModal(mob, world, onSave) {
    const overlay = document.getElementById('mob-edit-overlay');
    const content = document.getElementById('mob-edit-content');
    const form = document.getElementById('mob-edit-form');
    overlay.style.display = 'flex';

    // Init dynamic arrays from mob data
    currentWeapons = (mob.data.weapons || []).map(w => ({ ...w }));
    currentAbilities = (mob.data.abilities || []).map(a => ({ ...a }));
    currentLoot = [...(mob.data.loot || [])];
    currentSpecialties = (mob.data.specialties || []).map(s => ({ ...s }));

    form.innerHTML = renderForm(mob, world);

    function attachDynamicEvents() {
        // Weapon events
        form.querySelectorAll('[data-remove-weapon]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncFromInputs();
                currentWeapons.splice(parseInt(btn.dataset.removeWeapon), 1);
                document.getElementById('edit-weapons-container').innerHTML = renderWeaponsSection();
                attachDynamicEvents();
            });
        });

        const addWeaponBtn = document.getElementById('add-weapon-btn');
        if (addWeaponBtn) {
            addWeaponBtn.addEventListener('click', () => {
                syncFromInputs();
                currentWeapons.push({ name: '', damage: '' });
                document.getElementById('edit-weapons-container').innerHTML = renderWeaponsSection();
                attachDynamicEvents();
            });
        }

        // Ability events
        form.querySelectorAll('[data-remove-ability]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncFromInputs();
                currentAbilities.splice(parseInt(btn.dataset.removeAbility), 1);
                document.getElementById('edit-abilities-container').innerHTML = renderAbilitiesSection();
                attachDynamicEvents();
            });
        });

        const addAbilityBtn = document.getElementById('add-ability-btn');
        if (addAbilityBtn) {
            addAbilityBtn.addEventListener('click', () => {
                syncFromInputs();
                currentAbilities.push({ name: '', cost: '', description: '' });
                document.getElementById('edit-abilities-container').innerHTML = renderAbilitiesSection();
                attachDynamicEvents();
            });
        }

        // Loot events
        form.querySelectorAll('[data-remove-loot]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncFromInputs();
                currentLoot.splice(parseInt(btn.dataset.removeLoot), 1);
                document.getElementById('edit-loot-container').innerHTML = renderLootSection();
                attachDynamicEvents();
            });
        });

        const addLootBtn = document.getElementById('add-loot-btn');
        if (addLootBtn) {
            addLootBtn.addEventListener('click', () => {
                syncFromInputs();
                currentLoot.push('');
                document.getElementById('edit-loot-container').innerHTML = renderLootSection();
                attachDynamicEvents();
            });
        }

        // Specialty events
        form.querySelectorAll('[data-remove-specialty]').forEach(btn => {
            btn.addEventListener('click', () => {
                syncFromInputs();
                currentSpecialties.splice(parseInt(btn.dataset.removeSpecialty), 1);
                document.getElementById('edit-specialties-container').innerHTML = renderSpecialtiesSection();
                attachDynamicEvents();
            });
        });

        const addSpecialtyBtn = document.getElementById('add-specialty-btn');
        if (addSpecialtyBtn) {
            addSpecialtyBtn.addEventListener('click', () => {
                syncFromInputs();
                currentSpecialties.push({ name: '', stat: 'dex', value: '' });
                document.getElementById('edit-specialties-container').innerHTML = renderSpecialtiesSection();
                attachDynamicEvents();
            });
        }
    }

    attachDynamicEvents();

    function close() {
        overlay.style.display = 'none';
        cleanup();
    }

    function cleanup() {
        document.getElementById('mob-edit-save')?.removeEventListener('click', handleSave);
        document.getElementById('mob-edit-cancel')?.removeEventListener('click', close);
        document.getElementById('mob-edit-close')?.removeEventListener('click', close);
        overlay.removeEventListener('click', handleOverlayClick);
        content.removeEventListener('click', stopProp);
    }

    function handleOverlayClick(e) {
        if (e.target === overlay) close();
    }

    function stopProp(e) {
        e.stopPropagation();
    }

    function handleSave() {
        syncFromInputs();

        const tagsRaw = document.getElementById('edit-mob-tags').value;
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0);

        const updatedMob = {
            id: mob.id,
            world: document.getElementById('edit-mob-world').value.trim(),
            data: {
                name: document.getElementById('edit-mob-name').value.trim(),
                subtitle: document.getElementById('edit-mob-subtitle').value.trim(),
                description: document.getElementById('edit-mob-desc').value.trim(),
                health: document.getElementById('edit-mob-health').value.trim(),
                focus: document.getElementById('edit-mob-focus').value.trim(),
                power: parseInt(document.getElementById('edit-mob-power').value) || 0,
                complexity: parseInt(document.getElementById('edit-mob-complexity').value) || 0,
                tags: tags,
                stats: {
                    str: document.getElementById('edit-mob-str').value.trim(),
                    end: document.getElementById('edit-mob-end').value.trim(),
                    dex: document.getElementById('edit-mob-dex').value.trim(),
                    int: document.getElementById('edit-mob-int').value.trim(),
                    wil: document.getElementById('edit-mob-wil').value.trim(),
                    per: document.getElementById('edit-mob-per').value.trim(),
                    cha: document.getElementById('edit-mob-cha').value.trim(),
                    def: document.getElementById('edit-mob-def').value.trim()
                },
                weapons: currentWeapons.filter(w => w.name.trim()),
                tacticsDescription: document.getElementById('edit-mob-tactics').value.trim(),
                abilities: currentAbilities.filter(a => a.name.trim()),
                loot: currentLoot.filter(l => l.trim()),
                specialties: currentSpecialties.filter(s => s.name.trim()),
                extraInfo: document.getElementById('edit-mob-extra').value.trim()
            }
        };

        close();
        onSave(updatedMob);
    }

    document.getElementById('mob-edit-save').addEventListener('click', handleSave);
    document.getElementById('mob-edit-cancel').addEventListener('click', close);
    document.getElementById('mob-edit-close').addEventListener('click', close);
    overlay.addEventListener('click', handleOverlayClick);
    content.addEventListener('click', stopProp);
}
