import { getClient, isConfigured } from './supabase-client.js';
import { sanitizeAbility, sanitizeMob } from '../utils/sanitize.js';

const CACHE_KEY = 'phoenix_catalog_v1';
const PAGE_SIZE = 1000;
// A cold visit still has to download the catalogue, but a stale-revision check
// must never leave the app hanging on a slow or paused backend.
const REVISION_TIMEOUT_MS = 4000;

const BUNDLED_MOB_FILES = {
    barbarus: 'data/barbarus-mobs.json',
    rifts: 'data/rifts-mobs.json',
    city: 'data/city-mobs.json'
};

let abilities = [];
let mobsByWorld = {};
let source = 'none';   // 'remote' | 'cache' | 'bundled' | 'none'
let loadPromise = null;

export function getCatalogAbilities() {
    return abilities;
}

export function getCatalogMobs(world) {
    return mobsByWorld[world] || [];
}

// Which copy the app is actually rendering, so the admin page can say so.
export function getCatalogSource() {
    return source;
}

export function loadCatalog() {
    if (!loadPromise) loadPromise = doLoad();
    return loadPromise;
}

async function doLoad() {
    const cached = readCache();

    if (!isConfigured()) {
        if (cached) return apply(cached, 'cache');
        return apply(await loadBundled(), 'bundled');
    }

    let revision;
    try {
        revision = await withTimeout(fetchRevision(), REVISION_TIMEOUT_MS);
    } catch {
        revision = null;
    }

    if (revision === null) {
        // Backend unreachable or paused — the app still has to boot.
        if (cached) return apply(cached, 'cache');
        return apply(await loadBundled(), 'bundled');
    }

    if (cached && cached.revision === revision) {
        return apply(cached, 'cache');
    }

    try {
        const snapshot = await fetchRows(revision);
        writeCache(snapshot);
        return apply(snapshot, 'remote');
    } catch (err) {
        console.warn('Catalogue fetch failed, falling back:', err.message);
        if (cached) return apply(cached, 'cache');
        return apply(await loadBundled(), 'bundled');
    }
}

function apply(snapshot, from) {
    abilities = snapshot.abilities || [];
    mobsByWorld = snapshot.mobsByWorld || {};
    source = from;
}

async function fetchRevision() {
    const client = await getClient();
    const { data, error } = await client
        .from('catalog_meta')
        .select('revision')
        .maybeSingle();
    if (error) throw error;
    return data ? data.revision : null;
}

async function fetchRows(revision) {
    const client = await getClient();
    const rows = [];

    // PostgREST caps a response at 1000 rows, so page until short.
    for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await client
            .from('catalog')
            .select('id, kind, world, data')
            .eq('published', true)
            .order('name')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }

    return toSnapshot(rows, revision);
}

function toSnapshot(rows, revision) {
    const snapshot = { revision, abilities: [], mobsByWorld: {} };

    for (const row of rows) {
        if (row.kind === 'ability') {
            const ability = sanitizeAbility({ id: row.id, data: row.data });
            if (ability) snapshot.abilities.push(ability);
        } else {
            const mob = sanitizeMob({ id: row.id, world: row.world, data: row.data });
            if (!mob) continue;
            (snapshot.mobsByWorld[row.world] ||= []).push({ id: mob.id, data: mob.data });
        }
    }

    return snapshot;
}

// The files still shipped in data/ — last-ditch fallback, and what a brand-new
// visitor sees if the backend is down on their very first visit.
async function loadBundled() {
    const snapshot = { revision: null, abilities: [], mobsByWorld: {} };

    try {
        const res = await fetch('data/abilities.json');
        if (res.ok) snapshot.abilities = (await res.json()).dataItems || [];
    } catch (e) {
        console.error('Failed to load bundled abilities:', e);
    }

    await Promise.all(Object.entries(BUNDLED_MOB_FILES).map(async ([world, file]) => {
        try {
            const res = await fetch(file);
            if (res.ok) snapshot.mobsByWorld[world] = (await res.json()).dataItems || [];
        } catch (e) {
            console.error(`Failed to load bundled mobs for ${world}:`, e);
        }
    }));

    return snapshot;
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.revision !== 'number' || !Array.isArray(parsed.abilities)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCache(snapshot) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    } catch (e) {
        // Quota exceeded is survivable: the app just re-fetches next visit.
        console.warn('Could not cache the catalogue:', e.message);
    }
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); }
        );
    });
}

// ---------------------------------------------------------------- admin

// Admins see unpublished rows too; RLS is what actually enforces that.
export async function listCatalog() {
    const client = await getClient();
    const { data, error } = await client
        .from('catalog')
        .select('id, kind, world, name, published, updated_at')
        .order('kind')
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function getCatalogItem(id) {
    const client = await getClient();
    const { data, error } = await client
        .from('catalog')
        .select('id, kind, world, name, data, published')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function saveCatalogAbility(ability, { published = true } = {}) {
    const clean = sanitizeAbility(ability);
    if (!clean) throw new Error('That ability could not be saved.');
    if (!clean.data.abilityName) throw new Error('An ability needs a name.');
    return upsert({
        id: clean.id,
        kind: 'ability',
        world: null,
        name: clean.data.abilityName,
        data: clean.data,
        published
    });
}

export async function saveCatalogMob(mob, world, { published = true } = {}) {
    const clean = sanitizeMob({ ...mob, world });
    if (!clean) throw new Error('That mob could not be saved.');
    if (!clean.data.name) throw new Error('A mob needs a name.');
    if (!world) throw new Error('A mob needs a world.');
    return upsert({
        id: clean.id,
        kind: 'mob',
        world,
        name: clean.data.name,
        data: clean.data,
        published
    });
}

async function upsert(row) {
    const client = await getClient();
    const { error } = await client.from('catalog').upsert(row, { onConflict: 'id' });
    if (error) throw error;
}

export async function setCatalogPublished(id, published) {
    const client = await getClient();
    const { error } = await client.from('catalog').update({ published }).eq('id', id);
    if (error) throw error;
}

export async function deleteCatalogItem(id) {
    const client = await getClient();
    const { error } = await client.from('catalog').delete().eq('id', id);
    if (error) throw error;
}

// ---------------------------------------------------------------- bulk

// Everything, published or not, in the shape the importer accepts back.
export async function exportCatalog() {
    const client = await getClient();
    const rows = [];

    for (let page = 0; ; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await client
            .from('catalog')
            .select('id, kind, world, data, published')
            .order('kind')
            .order('name')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
    }

    const out = { format: 'phoenix-catalogue', version: 1, exportedAt: new Date().toISOString(), abilities: [], mobs: {} };
    for (const row of rows) {
        if (row.kind === 'ability') {
            out.abilities.push({ id: row.id, data: row.data, published: row.published });
        } else {
            (out.mobs[row.world] ||= []).push({ id: row.id, data: row.data, published: row.published });
        }
    }
    return out;
}

// Accepts either an export from above, or a raw `{ dataItems: [...] }` file of the
// kind the source data/*.json use — mobs in one of those need a world chosen for them.
export function parseCatalogImport(json, defaultWorld) {
    // Some of the original Wix exports carry a UTF-8 BOM. File.text() keeps it,
    // while JSON.parse rejects it as an unexpected character.
    const parsed = JSON.parse(json.replace(/^\uFEFF/, ''));
    const rows = [];
    const skipped = [];

    const pushAbility = (item) => {
        const clean = sanitizeAbility(item);
        if (!clean || !clean.data.abilityName) {
            skipped.push(item?.id || '(no id)');
            return;
        }
        rows.push({
            id: clean.id, kind: 'ability', world: null,
            name: clean.data.abilityName.slice(0, 200), data: clean.data,
            published: item.published !== false
        });
    };

    const pushMob = (item, world) => {
        const clean = sanitizeMob({ ...item, world });
        if (!clean || !clean.data.name || !world) {
            skipped.push(item?.id || '(no id)');
            return;
        }
        rows.push({
            id: clean.id, kind: 'mob', world,
            name: clean.data.name.slice(0, 200), data: clean.data,
            published: item.published !== false
        });
    };

    if (Array.isArray(parsed.abilities) || parsed.mobs || parsed.customMobs || parsed.customAbilities) {
        // A library backup keeps its own creations in custom* arrays, and its mobs
        // in a flat array whose items each carry their own world.
        for (const item of [...(parsed.abilities || []), ...(parsed.customAbilities || [])]) pushAbility(item);
        const mobLists = [...(parsed.customMobs || [])];
        if (Array.isArray(parsed.mobs)) mobLists.push(...parsed.mobs);
        for (const item of mobLists) pushMob(item, item?.world || defaultWorld);
        if (parsed.mobs && !Array.isArray(parsed.mobs)) {
            for (const [world, items] of Object.entries(parsed.mobs)) {
                for (const item of items || []) pushMob(item, world);
            }
        }
    } else if (Array.isArray(parsed.dataItems)) {
        for (const item of parsed.dataItems) {
            // Abilities and mobs are told apart by their own name field.
            if (item?.data?.abilityName !== undefined) pushAbility(item);
            else pushMob(item, defaultWorld);
        }
    } else {
        throw new Error('Unrecognised file. Expected a catalogue export or a { "dataItems": [...] } file.');
    }

    if (rows.length === 0) throw new Error('Nothing importable in that file.');
    return { rows, skipped };
}

// Merge-only: an import never deletes rows the file happens to omit.
export async function bulkUpsertCatalog(rows, onProgress) {
    const client = await getClient();
    const BATCH = 100;

    for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await client
            .from('catalog')
            .upsert(rows.slice(i, i + BATCH), { onConflict: 'id' });
        if (error) throw error;
        if (onProgress) onProgress(Math.min(i + BATCH, rows.length), rows.length);
    }
}

// Drops the local copy so the next load pulls fresh rows — used after an edit,
// so the admin sees their own change without waiting for a revision check.
export function invalidateCatalogCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch { /* nothing to do */ }
}
