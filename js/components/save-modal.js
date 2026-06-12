let resolvePromise = null;

export function renderSaveModal() {
    return `<div id="save-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Save Character</h2>
                <button class="close-btn" id="save-modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="field">
                    <label>Save as:</label>
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="saveMode" value="update" id="save-mode-update" checked />
                            <span id="save-mode-update-label">Update existing</span>
                        </label>
                        <label>
                            <input type="radio" name="saveMode" value="new" id="save-mode-new" />
                            Save as new character
                        </label>
                    </div>
                </div>
                <div class="field" id="new-name-field" style="display:none;">
                    <label>Character Name:</label>
                    <input type="text" id="save-new-name" placeholder="Enter character name" />
                    <div class="error-message" id="save-error" style="display:none;"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" id="save-modal-cancel">Cancel</button>
                <button class="btn-primary" id="save-modal-confirm">Save</button>
            </div>
        </div>
    </div>`;
}

export function showSaveModal(currentName, hasExisting) {
    const overlay = document.getElementById('save-modal-overlay');
    const updateRadio = document.getElementById('save-mode-update');
    const newRadio = document.getElementById('save-mode-new');
    const updateLabel = document.getElementById('save-mode-update-label');
    const newNameField = document.getElementById('new-name-field');
    const nameInput = document.getElementById('save-new-name');
    const errorEl = document.getElementById('save-error');

    overlay.style.display = 'flex';
    nameInput.value = currentName || '';
    errorEl.style.display = 'none';
    updateLabel.textContent = `Update existing (${currentName || 'unnamed'})`;

    if (!hasExisting) {
        newRadio.checked = true;
        updateRadio.parentElement.style.display = 'none';
        newNameField.style.display = 'block';
    } else {
        updateRadio.checked = true;
        updateRadio.parentElement.style.display = '';
        newNameField.style.display = 'none';
    }

    function updateVisibility() {
        newNameField.style.display = newRadio.checked ? 'block' : 'none';
    }

    updateRadio.onchange = updateVisibility;
    newRadio.onchange = updateVisibility;

    return new Promise((resolve) => {
        resolvePromise = resolve;

        function cleanup() {
            overlay.style.display = 'none';
            overlay.removeEventListener('click', onOverlayClick);
        }

        function onOverlayClick(e) {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        }

        overlay.addEventListener('click', onOverlayClick);

        document.getElementById('save-modal-close').onclick = () => {
            cleanup();
            resolve(null);
        };

        document.getElementById('save-modal-cancel').onclick = () => {
            cleanup();
            resolve(null);
        };

        document.getElementById('save-modal-confirm').onclick = () => {
            const isNew = newRadio.checked;
            if (isNew && !nameInput.value.trim()) {
                errorEl.textContent = 'Character name is required';
                errorEl.style.display = 'block';
                return;
            }
            cleanup();
            resolve({
                isNewCharacter: isNew,
                characterName: isNew ? nameInput.value.trim() : currentName
            });
        };
    });
}
