export function renderLoadModal() {
    return `<div id="load-modal-overlay" class="modal-overlay" style="display:none;">
        <div class="modal-content large">
            <div class="modal-header">
                <h2>Load Character</h2>
                <button class="close-btn" id="load-modal-close">&times;</button>
            </div>
            <div class="modal-body" id="load-modal-body"></div>
            <div class="modal-footer">
                <button class="btn-secondary" id="load-modal-cancel">Cancel</button>
                <button class="btn-primary" id="load-modal-confirm" disabled>Load</button>
            </div>
        </div>
    </div>`;
}

function formatDate(isoString) {
    try {
        const d = new Date(isoString);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const month = months[d.getMonth()];
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${month} ${day}, ${year} ${hours}:${mins}`;
    } catch {
        return '';
    }
}

export function showLoadModal(characters, onLoad, onDelete) {
    const overlay = document.getElementById('load-modal-overlay');
    const body = document.getElementById('load-modal-body');
    const confirmBtn = document.getElementById('load-modal-confirm');

    let selectedId = '';

    function renderBody() {
        if (!characters || characters.length === 0) {
            body.innerHTML = '<p class="no-characters">No saved characters found.</p>';
            confirmBtn.disabled = true;
            return;
        }

        const sorted = [...characters].sort((a, b) => {
            return new Date(b.lastModified) - new Date(a.lastModified);
        });

        body.innerHTML = `<div class="character-list">
            ${sorted.map(c => `
                <div class="character-card ${selectedId === c.id ? 'selected' : ''}" data-char-id="${c.id}">
                    <div class="character-info">
                        <h3>${c.name || 'Unnamed'}</h3>
                        <div class="character-details">
                            <span>Level ${c.level || 0}</span>
                            ${c.race ? `<span> &bull; ${c.race}</span>` : ''}
                            ${c.concept ? `<span> &bull; ${c.concept}</span>` : ''}
                        </div>
                        <div class="character-date">
                            Last modified: ${formatDate(c.lastModified)}
                        </div>
                    </div>
                    <button class="delete-btn" data-delete-id="${c.id}">\uD83D\uDDD1\uFE0F</button>
                </div>
            `).join('')}
        </div>`;

        body.querySelectorAll('.character-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn')) return;
                selectedId = card.dataset.charId;
                confirmBtn.disabled = false;
                body.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
        });

        body.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.deleteId;
                if (onDelete) onDelete(id);
                characters = characters.filter(c => c.id !== id);
                if (selectedId === id) {
                    selectedId = '';
                    confirmBtn.disabled = true;
                }
                renderBody();
            });
        });
    }

    overlay.style.display = 'flex';
    selectedId = '';
    confirmBtn.disabled = true;
    renderBody();

    function cleanup() {
        overlay.style.display = 'none';
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup();
    });

    document.getElementById('load-modal-close').onclick = cleanup;
    document.getElementById('load-modal-cancel').onclick = cleanup;

    confirmBtn.onclick = () => {
        if (selectedId && onLoad) {
            onLoad(selectedId);
        }
        cleanup();
    };
}
