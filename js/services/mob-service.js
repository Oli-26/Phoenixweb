import { loadCatalog, getCatalogMobs } from './catalog-service.js';

const worldConfig = {
    barbarus: { name: 'Barbarus' },
    rifts: { name: 'Rifts & Rivets' },
    city: { name: 'The City' }
};

export async function loadMobs(world) {
    if (!worldConfig[world]) return;
    await loadCatalog();
}

export function getAllMobs(world) {
    return getCatalogMobs(world);
}

export function getAllTags(world) {
    const mobs = getCatalogMobs(world);
    const tagSet = new Set();
    for (const m of mobs) {
        for (const tag of m.data.tags || []) {
            tagSet.add(tag);
        }
    }
    return [...tagSet].sort();
}

export function getMobById(world, id) {
    const mobs = getCatalogMobs(world);
    return mobs.find(m => m.id === id) || null;
}

export function getWorldName(world) {
    return worldConfig[world]?.name || world;
}

export function getAllWorldKeys() {
    return Object.keys(worldConfig);
}
