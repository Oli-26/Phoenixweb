export function renderAbilityEditModal() {
    return `
    <div id="ability-edit-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content" id="ability-edit-content" style="background: var(--surface, white); padding: 0; max-height: 90vh; max-width: 700px; overflow-y: auto; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative;">
            <button class="modal-close" id="ability-edit-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div class="edit-form" id="ability-edit-form">
                <h2 class="edit-form-title">Edit Ability</h2>

                <div class="edit-field">
                    <label for="edit-ability-name">Name</label>
                    <input type="text" id="edit-ability-name" placeholder="Ability name" />
                </div>

                <div class="edit-field">
                    <label for="edit-ability-desc">Description</label>
                    <textarea id="edit-ability-desc" rows="3" placeholder="Ability description"></textarea>
                </div>

                <div class="edit-row">
                    <div class="edit-field">
                        <label for="edit-ability-power">Power (1-5)</label>
                        <input type="number" id="edit-ability-power" min="1" max="5" />
                    </div>
                    <div class="edit-field">
                        <label for="edit-ability-complexity">Complexity (1-5)</label>
                        <input type="number" id="edit-ability-complexity" min="1" max="5" />
                    </div>
                </div>

                <div class="edit-field">
                    <label for="edit-ability-tags">Tags (comma-separated)</label>
                    <input type="text" id="edit-ability-tags" placeholder="Tag1, Tag2, Tag3" />
                </div>

                <div class="edit-field">
                    <label for="edit-ability-extra">Supporting Info</label>
                    <textarea id="edit-ability-extra" rows="4" placeholder="Supporting information / lore (markdown: # heading, - bullet, **bold**)"></textarea>
                </div>

                <div id="edit-ability-levels"></div>

                <div class="edit-form-actions">
                    <button class="edit-save-btn" id="ability-edit-save">Save</button>
                    <button class="edit-cancel-btn" id="ability-edit-cancel">Cancel</button>
                </div>
            </div>
        </div>
    </div>`;
}

function renderLevelFields() {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += `
        <div class="edit-level-section">
            <h3>Level ${i}</h3>
            <div class="edit-row">
                <div class="edit-field" style="flex: 0 0 140px;">
                    <label for="edit-ability-l${i}-cost">Cost</label>
                    <input type="text" id="edit-ability-l${i}-cost" placeholder="e.g. Passive or 3 Focus" />
                </div>
                <div class="edit-field" style="flex: 1;">
                    <label for="edit-ability-l${i}-desc">Description</label>
                    <textarea id="edit-ability-l${i}-desc" rows="2" placeholder="Level ${i} description"></textarea>
                </div>
            </div>
        </div>`;
    }
    return html;
}

export function showAbilityEditModal(ability, onSave) {
    const overlay = document.getElementById('ability-edit-overlay');
    const content = document.getElementById('ability-edit-content');
    overlay.style.display = 'flex';

    // Render level fields
    document.getElementById('edit-ability-levels').innerHTML = renderLevelFields();

    // Populate form
    const d = ability.data;
    document.getElementById('edit-ability-name').value = d.abilityName || '';
    document.getElementById('edit-ability-desc').value = d.abilityDescription || '';
    document.getElementById('edit-ability-power').value = d.power || 1;
    document.getElementById('edit-ability-complexity').value = d.complexity || 1;
    document.getElementById('edit-ability-tags').value = (d.tags || []).join(', ');
    document.getElementById('edit-ability-extra').value = d.extraInfo || '';

    for (let i = 1; i <= 5; i++) {
        document.getElementById(`edit-ability-l${i}-cost`).value = d[`level${i}Cost`] || '';
        document.getElementById(`edit-ability-l${i}-desc`).value = d[`level${i}Description`] || '';
    }

    // Event handlers
    function close() {
        overlay.style.display = 'none';
        cleanup();
    }

    function cleanup() {
        document.getElementById('ability-edit-save').removeEventListener('click', handleSave);
        document.getElementById('ability-edit-cancel').removeEventListener('click', close);
        document.getElementById('ability-edit-close').removeEventListener('click', close);
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
        const tagsRaw = document.getElementById('edit-ability-tags').value;
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0);

        const updatedAbility = {
            id: ability.id,
            data: {
                abilityName: document.getElementById('edit-ability-name').value.trim(),
                abilityDescription: document.getElementById('edit-ability-desc').value.trim(),
                power: parseInt(document.getElementById('edit-ability-power').value) || 1,
                complexity: parseInt(document.getElementById('edit-ability-complexity').value) || 1,
                tags: tags,
                extraInfo: document.getElementById('edit-ability-extra').value.trim()
            }
        };

        for (let i = 1; i <= 5; i++) {
            updatedAbility.data[`level${i}Cost`] = document.getElementById(`edit-ability-l${i}-cost`).value.trim();
            updatedAbility.data[`level${i}Description`] = document.getElementById(`edit-ability-l${i}-desc`).value.trim();
        }

        close();
        onSave(updatedAbility);
    }

    document.getElementById('ability-edit-save').addEventListener('click', handleSave);
    document.getElementById('ability-edit-cancel').addEventListener('click', close);
    document.getElementById('ability-edit-close').addEventListener('click', close);
    overlay.addEventListener('click', handleOverlayClick);
    content.addEventListener('click', stopProp);
}
