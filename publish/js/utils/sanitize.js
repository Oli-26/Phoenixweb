// Whitelist rebuild for untrusted ability/mob/folder objects (library import today,
// account-to-account sharing later). Anything not listed here is dropped, so a
// malicious payload cannot smuggle extra fields into the render path.

const MAX_SHORT = 200;
const MAX_LONG = 5000;
const TINT_NAMES = ['rose', 'amber', 'emerald', 'violet', 'sky', 'slate']; // must match TINTS in library.js

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Ids land in HTML attributes and data-* lookups, so keep them to a boring charset.
export function safeId(value) {
    if (typeof value !== 'string') return null;
    const id = value.trim().replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    return id || null;
}

function text(value, max = MAX_SHORT) {
    if (value === null || value === undefined) return '';
    // Strip control chars except newline/tab; they only ever cause display grief.
    return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, max);
}

function int(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function textList(value, max = MAX_SHORT, limit = 50) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, limit).map(v => text(v, max)).filter(v => v.trim());
}

export function sanitizeAbility(input) {
    if (!input || typeof input !== 'object') return null;
    const id = safeId(input.id);
    if (!id) return null;
    const d = input.data && typeof input.data === 'object' ? input.data : {};

    const data = {
        abilityName: text(d.abilityName),
        abilityDescription: text(d.abilityDescription, MAX_LONG),
        power: int(d.power, 0, 99, 1),
        complexity: int(d.complexity, 0, 99, 1),
        tags: textList(d.tags, 60),
        extraInfo: text(d.extraInfo, MAX_LONG)
    };
    for (let i = 1; i <= 5; i++) {
        data[`level${i}Cost`] = text(d[`level${i}Cost`], 60);
        data[`level${i}Description`] = text(d[`level${i}Description`], MAX_LONG);
    }
    return { id, data };
}

export function sanitizeMob(input) {
    if (!input || typeof input !== 'object') return null;
    const id = safeId(input.id);
    if (!id) return null;
    const d = input.data && typeof input.data === 'object' ? input.data : {};
    const s = d.stats && typeof d.stats === 'object' ? d.stats : {};

    const stats = {};
    for (const key of ['str', 'end', 'dex', 'int', 'wil', 'per', 'cha', 'def']) {
        stats[key] = text(s[key], 40);
    }

    const list = (value, fn, limit = 50) =>
        Array.isArray(value) ? value.slice(0, limit).map(fn).filter(Boolean) : [];

    return {
        id,
        world: text(input.world, 60),
        data: {
            name: text(d.name),
            subtitle: text(d.subtitle),
            description: text(d.description, MAX_LONG),
            health: text(d.health, 40),
            focus: text(d.focus, 40),
            power: int(d.power, 0, 99, 0),
            complexity: int(d.complexity, 0, 99, 0),
            tags: textList(d.tags, 60),
            stats,
            weapons: list(d.weapons, w => w && typeof w === 'object'
                ? { name: text(w.name), damage: text(w.damage, 60) } : null),
            tacticsDescription: text(d.tacticsDescription, MAX_LONG),
            abilities: list(d.abilities, a => a && typeof a === 'object'
                ? { name: text(a.name), cost: text(a.cost, 60), description: text(a.description, MAX_LONG) } : null),
            loot: textList(d.loot),
            specialties: list(d.specialties, sp => sp && typeof sp === 'object'
                ? { name: text(sp.name), value: text(sp.value, 40), stat: text(sp.stat, 10) } : null),
            extraInfo: text(d.extraInfo, MAX_LONG)
        }
    };
}

export function sanitizeFolder(input) {
    if (!input || typeof input !== 'object') return null;
    const id = safeId(input.id);
    const name = text(input.name, 80).trim();
    if (!id || !name) return null;
    return { id, name, tint: TINT_NAMES.includes(input.tint) ? input.tint : 'slate' };
}

// Folder maps are { itemId: folderId }; both sides feed attributes and lookups.
export function sanitizeFolderMap(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const [key, value] of Object.entries(input)) {
        const k = safeId(key);
        const v = value === null ? null : safeId(value);
        if (k && v !== undefined) out[k] = v;
    }
    return out;
}
