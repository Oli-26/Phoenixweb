import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard } from '../components/ability-card.js';
import { renderMobCard } from '../components/mob-card.js';
import { escapeHtml } from '../utils/sanitize.js';
import { isAdmin, listPending, moderate, loadMyDesigns } from '../services/design-service.js';
import { onAuthChange } from '../services/auth-service.js';

let pending = [];
let unsubscribeAuth = null;

export function render() {
    return `
    ${renderNavbar()}
    <div class="container review-page">
        <div class="review-header">
            <h1>Review Queue</h1>
            <p class="review-subtitle">Designs waiting to go public.</p>
        </div>
        <div id="review-body"><p class="review-empty">Loading…</p></div>
    </div>`;
}

export function init() {
    // Auth resolves asynchronously at startup, so re-check whenever it settles.
    if (unsubscribeAuth) unsubscribeAuth();
    unsubscribeAuth = onAuthChange(() => refresh());
}

async function refresh() {
    const body = document.getElementById('review-body');
    if (!body) return;

    try {
        await loadMyDesigns();
    } catch (err) {
        body.innerHTML = `<p class="review-empty">Could not load: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!isAdmin()) {
        body.innerHTML = '<p class="review-empty">Sign in with a moderator account to review submissions.</p>';
        return;
    }

    try {
        pending = await listPending();
    } catch (err) {
        body.innerHTML = `<p class="review-empty">Could not load queue: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (pending.length === 0) {
        body.innerHTML = '<p class="review-empty">Nothing waiting. Queue is clear.</p>';
        return;
    }

    body.innerHTML = pending.map(renderEntry).join('');
    attachEvents(body);
}

function renderEntry({ row, kind, item }) {
    const submitted = new Date(row.created_at).toLocaleString();
    return `
    <section class="review-entry" data-design-id="${escapeHtml(row.id)}">
        <div class="review-entry-head">
            <div>
                <h2>${escapeHtml(row.name)}</h2>
                <span class="review-meta">${kind === 'ability' ? 'Ability' : 'Mob'} · submitted ${escapeHtml(submitted)}</span>
            </div>
            <div class="review-actions">
                <button class="review-btn review-approve" data-review-action="approved">Approve</button>
                <button class="review-btn review-reject" data-review-action="rejected">Reject</button>
            </div>
        </div>
        <label class="review-reason">
            <span>Reason (shown to the author on rejection)</span>
            <input type="text" class="review-reason-input" placeholder="Optional for approvals" />
        </label>
        <div class="review-preview">
            ${kind === 'ability' ? renderAbilityCard(item) : renderMobCard(item, item.world)}
        </div>
    </section>`;
}

function attachEvents(body) {
    body.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-review-action]');
        if (!btn) return;

        const entry = btn.closest('.review-entry');
        const id = entry.dataset.designId;
        const status = btn.dataset.reviewAction;
        const reason = entry.querySelector('.review-reason-input').value.trim();

        if (status === 'rejected' && !reason) {
            alert('Give a reason so the author knows what to change.');
            return;
        }

        entry.querySelectorAll('.review-btn').forEach(b => { b.disabled = true; });
        try {
            await moderate(id, status, reason);
            entry.remove();
            if (!body.querySelector('.review-entry')) {
                body.innerHTML = '<p class="review-empty">Nothing waiting. Queue is clear.</p>';
            }
        } catch (err) {
            entry.querySelectorAll('.review-btn').forEach(b => { b.disabled = false; });
            alert('Could not save: ' + err.message);
        }
    });
}
