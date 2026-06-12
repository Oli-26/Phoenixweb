const cache = {};

const worldConfig = {
    barbarus: { file: 'data/barbarus-mobs.json', name: 'Barbarus' },
    rifts: { file: 'data/rifts-mobs.json', name: 'Rifts & Rivets' },
    city: { file: 'data/city-mobs.json', name: 'The City' }
};

export async function loadMobs(world) {
    if (cache[world]) return;
    const config = worldConfig[world];
    if (!config) return;

    try {
        const response = await fetch(config.file);
        if (response.ok) {
            const data = await response.json();
            cache[world] = data.dataItems || [];
        }
    } catch (e) {
        console.error(`Failed to load mobs for ${world}:`, e);
        cache[world] = [];
    }
}

export function getAllMobs(world) {
    return cache[world] || [];
}

export function getAllTags(world) {
    const mobs = cache[world] || [];
    const tagSet = new Set();
    for (const m of mobs) {
        for (const tag of m.data.tags) {
            tagSet.add(tag);
        }
    }
    return [...tagSet].sort();
}

export function getMobById(world, id) {
    const mobs = cache[world] || [];
    return mobs.find(m => m.id === id) || null;
}

export function getWorldName(world) {
    return worldConfig[world]?.name || world;
}

export function getAllWorldKeys() {
    return Object.keys(worldConfig);
}
