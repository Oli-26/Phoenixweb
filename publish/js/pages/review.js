import { renderNavbar } from '../components/navbar.js';
import { renderAbilityCard } from '../components/ability-card.js';
import { renderMobCard } from '../components/mob-card.js';
import { escapeHtml } from '../utils/sanitize.js';
import {
    isAdmin, listPending, moderate, loadMyDesigns,
    listReported, setHidden, clearReports
} from '../services/design-service.js';
import { onAuthChange } from '../services/auth-service.js';
import { renderCataloguePanel, initCataloguePanel, refreshCatalogue } from './catalogue.js';

let pending = [];
let reported = [];
let unsubscribeAuth = null;
let activeTab = 'community';

export function render() {
    return `
    ${renderNavbar()}
    <div class="container review-page">
        <div class="review-header">
            <h1>Admin</h1>
        </div>
        <div class="review-tabs" role="tablist" aria-label="Admin sections">
            <button role="tab" data-review-tab="community">Community review</button>
            <button role="tab" data-review-tab="catalogue">Core mobs &amp; abilities</button>
        </div>
        <section id="review-community-panel">
            <p class="review-subtitle">Community designs waiting to go public, plus reported submissions.</p>
            <h2 class="review-section-title">Awaiting approval</h2>
            <div id="review-body"><p class="review-empty">Loading…</p></div>
            <h2 class="review-section-title">Reported</h2>
            <div id="review-reported"><p class="review-empty">Loading…</p></div>
        </section>
        <section id="review-catalogue-panel">${renderCataloguePanel()}</section>
    </div>`;
}

export function init() {
    document.querySelector('.review-tabs')?.addEventListener('click', (e) => {
        const button = e.target.closest('[data-review-tab]');
        if (!button) return;
        activeTab = button.dataset.reviewTab;
        updateTabs();
    });
    initCataloguePanel();
    updateTabs();
    // Auth resolves asynchronously at startup, so re-check whenever it settles.
    if (unsubscribeAuth) unsubscribeAuth();
    unsubscribeAuth = onAuthChange(() => {
        refresh();
        refreshCatalogue();
    });
}

function updateTabs() {
    document.querySelectorAll('[data-review-tab]').forEach(button => {
        const selected = button.dataset.reviewTab === activeTab;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
    });
    const community = document.getElementById('review-community-panel');
    const catalogue = document.getElementById('review-catalogue-panel');
    if (community) community.hidden = activeTab !== 'community';
    if (catalogue) catalogue.hidden = activeTab !== 'catalogue';
}

async function refresh() {
    const body = document.getElementById('review-body');
    const reportedBody = document.getElementById('review-reported');
    if (!body) return;

    try {
        await loadMyDesigns();
    } catch (err) {
        body.innerHTML = `<p class="review-empty">Could not load: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (!isAdmin()) {
        body.innerHTML = '<p class="review-empty">Sign in with a moderator account to review submissions.</p>';
        if (reportedBody) reportedBody.innerHTML = '';
        return;
    }

    refreshReported(reportedBody);

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

async function refreshReported(container) {
    if (!container) return;

    try {
        reported = await listReported();
    } catch (err) {
        container.innerHTML = `<p class="review-empty">Could not load reports: ${escapeHtml(err.message)}</p>`;
        return;
    }

    if (reported.length === 0) {
        container.innerHTML = '<p class="review-empty">No reports outstanding.</p>';
        return;
    }

    container.innerHTML = reported.map(renderReportedEntry).join('');
    attachReportedEvents(container);
}

function renderReportedEntry({ row, kind, item, reports }) {
    const reasons = (reports || [])
        .map(r => `<li>${escapeHtml(r.reason)}</li>`)
        .join('');

    return `
    <section class="review-entry" data-design-id="${escapeHtml(row.id)}">
        <div class="review-entry-head">
            <div>
                <h2>${escapeHtml(row.name)}</h2>
                <span class="review-meta">
                    ${kind === 'ability' ? 'Ability' : 'Mob'} ·
                    ${row.report_count} report${row.report_count === 1 ? '' : 's'} ·
                    ${row.hidden ? 'hidden from Community' : 'visible in Community'}
                </span>
            </div>
            <div class="review-actions">
                <button class="review-btn review-reject" data-report-action="${row.hidden ? 'unhide' : 'hide'}">
                    ${row.hidden ? 'Unhide' : 'Hide'}
                </button>
                <button class="review-btn review-approve" data-report-action="dismiss">Dismiss reports</button>
            </div>
        </div>
        <ul class="review-report-reasons">${reasons}</ul>
        <div class="review-preview">
            ${kind === 'ability' ? renderAbilityCard(item) : renderMobCard(item, item.world)}
        </div>
    </section>`;
}

function attachReportedEvents(container) {
    // refreshReported() re-runs after every action, so bind the container once.
    if (container.dataset.bound === 'true') return;
    container.dataset.bound = 'true';

    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-report-action]');
        if (!btn) return;

        const entry = btn.closest('.review-entry');
        const id = entry.dataset.designId;
        const action = btn.dataset.reportAction;

        entry.querySelectorAll('.review-btn').forEach(b => { b.disabled = true; });
        try {
            if (action === 'dismiss') {
                // Clearing reports leaves `hidden` alone — un-hiding stays deliberate.
                await clearReports(id);
            } else {
                await setHidden(id, action === 'hide');
            }
            await refreshReported(document.getElementById('review-reported'));
        } catch (err) {
            entry.querySelectorAll('.review-btn').forEach(b => { b.disabled = false; });
            alert('Could not save: ' + err.message);
        }
    });
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
    if (body.dataset.bound === 'true') return;
    body.dataset.bound = 'true';

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
