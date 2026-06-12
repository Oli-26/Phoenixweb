import { renderAbilityCard, scaleAbilityPages } from './ability-card.js';
import { renderMobCard } from './mob-card.js';

let html2canvasLoaded = null;

function loadHtml2Canvas() {
    if (html2canvasLoaded) return html2canvasLoaded;
    html2canvasLoaded = new Promise((resolve, reject) => {
        if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(window.html2canvas);
        script.onerror = () => {
            html2canvasLoaded = null;
            reject(new Error('Failed to load html2canvas'));
        };
        document.head.appendChild(script);
    });
    return html2canvasLoaded;
}

function ensurePrintContainer() {
    let container = document.getElementById('print-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'print-container';
        container.className = 'print-container';
        document.body.appendChild(container);
    }
    return container;
}

export function printSingleCard(type, itemData, world, widthClass) {
    const container = ensurePrintContainer();
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'print-card-block';

    if (type === 'ability') {
        wrapper.innerHTML = renderAbilityCard(itemData);
    } else {
        wrapper.innerHTML = renderMobCard(itemData, world);
        if (widthClass) {
            const cardWrapper = wrapper.querySelector('.mob-card-wrapper');
            if (cardWrapper) cardWrapper.classList.add(widthClass);
        }
    }
    container.appendChild(wrapper);

    document.body.classList.add('printing-cards');

    requestAnimationFrame(() => {
        scaleAbilityPages();
        requestAnimationFrame(() => {
            window.print();
            document.body.classList.remove('printing-cards');
            container.innerHTML = '';
        });
    });
}

export async function saveCardAsImage(mob, btn) {
    const cardEl = document.querySelector('.mob-card');
    if (!cardEl) return;

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Capturing...';
    }

    try {
        const h2c = await loadHtml2Canvas();
        const canvas = await h2c(cardEl, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            logging: false
        });

        const link = document.createElement('a');
        link.download = `${(mob.data.name || 'mob').replace(/[^a-z0-9]/gi, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        alert('Failed to capture image: ' + err.message);
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = saveImageBtnInner();
    }
}

function saveImageBtnInner() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="21 15 16 10 5 21" stroke-linecap="round" stroke-linejoin="round"/>
    </svg> Save as Image`;
}

export function renderCardActionButtons(type) {
    let html = '<div class="modal-action-buttons">';

    if (type === 'mob') {
        html += `<div class="mob-width-toggle" role="group" aria-label="Card width">
            <button data-mob-width="mob-width-narrow" title="Narrow (fits 2 per page)">Narrow</button>
            <button data-mob-width="mob-width-standard" class="active" title="Standard">Standard</button>
            <button data-mob-width="mob-width-wide" title="Wide (full page)">Wide</button>
        </div>`;
    }

    html += `<button class="modal-action-btn print-card-btn" data-print-type="${type}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="6 9 6 2 18 2 18 9" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="6" y="14" width="12" height="8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Print
    </button>`;

    if (type === 'mob') {
        html += `<button class="modal-action-btn save-image-btn">${saveImageBtnInner()}</button>`;
    }

    html += '</div>';
    return html;
}

const WIDTH_CLASSES = ['mob-width-narrow', 'mob-width-standard', 'mob-width-wide'];

function applyMobWidth(container, widthClass) {
    const cardWrapper = container.querySelector('.mob-card-wrapper');
    if (!cardWrapper) return;
    WIDTH_CLASSES.forEach(c => cardWrapper.classList.remove(c));
    cardWrapper.classList.add(widthClass);
}

function getActiveMobWidth(container) {
    const activeBtn = container.querySelector('.mob-width-toggle button.active');
    return activeBtn?.dataset.mobWidth || 'mob-width-standard';
}

export function attachCardActionEvents(container, type, itemData, world) {
    if (type === 'mob') {
        applyMobWidth(container, 'mob-width-standard');

        container.querySelectorAll('.mob-width-toggle button').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.mob-width-toggle button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyMobWidth(container, btn.dataset.mobWidth);
            });
        });
    }

    const printBtn = container.querySelector('.print-card-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            const widthClass = type === 'mob' ? getActiveMobWidth(container) : null;
            printSingleCard(type, itemData, world, widthClass);
        });
    }

    if (type === 'mob') {
        const imgBtn = container.querySelector('.save-image-btn');
        if (imgBtn) {
            imgBtn.addEventListener('click', () => saveCardAsImage(itemData, imgBtn));
        }
    }
}
