import {
    sanitizeAbility, sanitizeMob, sanitizeFolder, sanitizeFolderMap, safeId
} from '../utils/sanitize.js';

const ABILITY_KEY = 'phoenixAbilityLibrary';
const MOB_KEY = 'phoenixMobLibrary';
const ABILITY_FAV_KEY = 'phoenixAbilityFavorites';
const MOB_FAV_KEY = 'phoenixMobFavorites';
const CUSTOM_ABILITY_KEY = 'phoenixCustomAbilities';
const CUSTOM_MOB_KEY = 'phoenixCustomMobs';
const ABILITY_FOLDERS_KEY = 'phoenixAbilityFolders';
const MOB_FOLDERS_KEY = 'phoenixMobFolders';
const ABILITY_FOLDER_MAP_KEY = 'phoenixAbilityFolderMap';
const MOB_FOLDER_MAP_KEY = 'phoenixMobFolderMap';

// --- Abilities ---

export function getSavedAbilityIds() {
    try {
        const json = localStorage.getItem(ABILITY_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function addAbility(abilityId) {
    const savedIds = getSavedAbilityIds();
    if (!savedIds.includes(abilityId)) {
        savedIds.push(abilityId);
        localStorage.setItem(ABILITY_KEY, JSON.stringify(savedIds));
    }
}

export function removeAbility(abilityId) {
    const savedIds = getSavedAbilityIds();
    const index = savedIds.indexOf(abilityId);
    if (index !== -1) {
        savedIds.splice(index, 1);
        localStorage.setItem(ABILITY_KEY, JSON.stringify(savedIds));
    }
    setAbilityFolder(abilityId, null);
}

export function isAbilitySaved(abilityId) {
    return getSavedAbilityIds().includes(abilityId);
}

export function clearAllAbilities() {
    localStorage.removeItem(ABILITY_KEY);
    localStorage.removeItem(ABILITY_FAV_KEY);
    localStorage.removeItem(CUSTOM_ABILITY_KEY);
    localStorage.removeItem(ABILITY_FOLDER_MAP_KEY);
}

// --- Mobs ---

export function getSavedMobEntries() {
    try {
        const json = localStorage.getItem(MOB_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function addMob(mobId, world) {
    const entries = getSavedMobEntries();
    if (!entries.find(e => e.id === mobId)) {
        entries.push({ id: mobId, world });
        localStorage.setItem(MOB_KEY, JSON.stringify(entries));
    }
}

export function removeMob(mobId) {
    let entries = getSavedMobEntries();
    entries = entries.filter(e => e.id !== mobId);
    localStorage.setItem(MOB_KEY, JSON.stringify(entries));
    setMobFolder(mobId, null);
}

export function isMobSaved(mobId) {
    return getSavedMobEntries().some(e => e.id === mobId);
}

export function clearAllMobs() {
    localStorage.removeItem(MOB_KEY);
    localStorage.removeItem(MOB_FAV_KEY);
    localStorage.removeItem(CUSTOM_MOB_KEY);
    localStorage.removeItem(MOB_FOLDER_MAP_KEY);
}

// --- Clear everything ---

export function clearAll() {
    localStorage.removeItem(ABILITY_KEY);
    localStorage.removeItem(MOB_KEY);
    localStorage.removeItem(ABILITY_FAV_KEY);
    localStorage.removeItem(MOB_FAV_KEY);
    localStorage.removeItem(CUSTOM_ABILITY_KEY);
    localStorage.removeItem(CUSTOM_MOB_KEY);
    localStorage.removeItem(ABILITY_FOLDERS_KEY);
    localStorage.removeItem(MOB_FOLDERS_KEY);
    localStorage.removeItem(ABILITY_FOLDER_MAP_KEY);
    localStorage.removeItem(MOB_FOLDER_MAP_KEY);
}

// --- Export / Import ---

export function exportLibrary() {
    return JSON.stringify({
        version: 4,
        exportedAt: new Date().toISOString(),
        abilities: getSavedAbilityIds(),
        mobs: getSavedMobEntries(),
        abilityFavorites: getFavoriteAbilityIds(),
        mobFavorites: getFavoriteMobIds(),
        customAbilities: getCustomAbilities(),
        customMobs: getCustomMobs(),
        abilityFolders: getAbilityFolders(),
        mobFolders: getMobFolders(),
        abilityFolderMap: getAbilityFolderMap(),
        mobFolderMap: getMobFolderMap()
    }, null, 2);
}

export function importLibrary(jsonString) {
    const data = JSON.parse(jsonString);

    if (!data || typeof data !== 'object') {
        throw new Error('Invalid library file');
    }

    // Support both versioned and raw format
    const abilities = data.abilities || [];
    const mobs = data.mobs || [];

    if (!Array.isArray(abilities) || !Array.isArray(mobs)) {
        throw new Error('Invalid library data: abilities and mobs must be arrays');
    }

    // Merge with existing (no duplicates)
    const existingAbilities = getSavedAbilityIds();
    for (const raw of abilities) {
        const id = safeId(raw);
        if (id && !existingAbilities.includes(id)) {
            existingAbilities.push(id);
        }
    }
    localStorage.setItem(ABILITY_KEY, JSON.stringify(existingAbilities));

    const existingMobs = getSavedMobEntries();
    for (const entry of mobs) {
        const id = entry && safeId(entry.id);
        const world = entry && typeof entry.world === 'string' ? entry.world.slice(0, 60) : '';
        if (id && world && !existingMobs.some(e => e.id === id)) {
            existingMobs.push({ id, world });
        }
    }
    localStorage.setItem(MOB_KEY, JSON.stringify(existingMobs));

    // Merge favorites
    const abilityFavs = data.abilityFavorites || [];
    const mobFavs = data.mobFavorites || [];
    if (Array.isArray(abilityFavs)) {
        const existingAbilityFavs = getFavoriteAbilityIds();
        for (const id of abilityFavs) {
            if (typeof id === 'string' && !existingAbilityFavs.includes(id)) {
                existingAbilityFavs.push(id);
            }
        }
        localStorage.setItem(ABILITY_FAV_KEY, JSON.stringify(existingAbilityFavs));
    }
    if (Array.isArray(mobFavs)) {
        const existingMobFavs = getFavoriteMobIds();
        for (const id of mobFavs) {
            if (typeof id === 'string' && !existingMobFavs.includes(id)) {
                existingMobFavs.push(id);
            }
        }
        localStorage.setItem(MOB_FAV_KEY, JSON.stringify(existingMobFavs));
    }

    // Merge custom abilities
    const customAbilities = data.customAbilities || [];
    if (Array.isArray(customAbilities)) {
        const existing = getCustomAbilities();
        for (const raw of customAbilities) {
            const ability = sanitizeAbility(raw);
            if (ability && !existing.some(a => a.id === ability.id)) {
                existing.push(ability);
            }
        }
        localStorage.setItem(CUSTOM_ABILITY_KEY, JSON.stringify(existing));
    }

    // Merge custom mobs
    const customMobs = data.customMobs || [];
    if (Array.isArray(customMobs)) {
        const existing = getCustomMobs();
        for (const raw of customMobs) {
            const mob = sanitizeMob(raw);
            if (mob && !existing.some(m => m.id === mob.id)) {
                existing.push(mob);
            }
        }
        localStorage.setItem(CUSTOM_MOB_KEY, JSON.stringify(existing));
    }

    // Merge folders
    if (Array.isArray(data.abilityFolders)) {
        const existing = getAbilityFolders();
        for (const raw of data.abilityFolders) {
            const f = sanitizeFolder(raw);
            if (f && !existing.some(e => e.id === f.id)) {
                existing.push(f);
            }
        }
        localStorage.setItem(ABILITY_FOLDERS_KEY, JSON.stringify(existing));
    }
    if (Array.isArray(data.mobFolders)) {
        const existing = getMobFolders();
        for (const raw of data.mobFolders) {
            const f = sanitizeFolder(raw);
            if (f && !existing.some(e => e.id === f.id)) {
                existing.push(f);
            }
        }
        localStorage.setItem(MOB_FOLDERS_KEY, JSON.stringify(existing));
    }
    if (data.abilityFolderMap && typeof data.abilityFolderMap === 'object') {
        const map = getAbilityFolderMap();
        Object.assign(map, sanitizeFolderMap(data.abilityFolderMap));
        localStorage.setItem(ABILITY_FOLDER_MAP_KEY, JSON.stringify(map));
    }
    if (data.mobFolderMap && typeof data.mobFolderMap === 'object') {
        const map = getMobFolderMap();
        Object.assign(map, sanitizeFolderMap(data.mobFolderMap));
        localStorage.setItem(MOB_FOLDER_MAP_KEY, JSON.stringify(map));
    }

    return { abilitiesAdded: abilities.length, mobsAdded: mobs.length };
}

// --- Ability Favorites ---

export function getFavoriteAbilityIds() {
    try {
        const json = localStorage.getItem(ABILITY_FAV_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function toggleAbilityFavorite(id) {
    const favs = getFavoriteAbilityIds();
    const idx = favs.indexOf(id);
    if (idx !== -1) {
        favs.splice(idx, 1);
    } else {
        favs.push(id);
    }
    localStorage.setItem(ABILITY_FAV_KEY, JSON.stringify(favs));
}

export function isAbilityFavorited(id) {
    return getFavoriteAbilityIds().includes(id);
}

// --- Mob Favorites ---

export function getFavoriteMobIds() {
    try {
        const json = localStorage.getItem(MOB_FAV_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function toggleMobFavorite(id) {
    const favs = getFavoriteMobIds();
    const idx = favs.indexOf(id);
    if (idx !== -1) {
        favs.splice(idx, 1);
    } else {
        favs.push(id);
    }
    localStorage.setItem(MOB_FAV_KEY, JSON.stringify(favs));
}

export function isMobFavorited(id) {
    return getFavoriteMobIds().includes(id);
}

// --- Custom Abilities ---

export function getCustomAbilities() {
    try {
        const json = localStorage.getItem(CUSTOM_ABILITY_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function saveCustomAbility(input) {
    const ability = sanitizeAbility(input);
    if (!ability) return;
    const items = getCustomAbilities();
    const idx = items.findIndex(a => a.id === ability.id);
    if (idx !== -1) {
        items[idx] = ability;
    } else {
        items.push(ability);
    }
    localStorage.setItem(CUSTOM_ABILITY_KEY, JSON.stringify(items));
}

export function deleteCustomAbility(id) {
    const items = getCustomAbilities().filter(a => a.id !== id);
    localStorage.setItem(CUSTOM_ABILITY_KEY, JSON.stringify(items));
    // Also clean up favorites
    const favs = getFavoriteAbilityIds().filter(f => f !== id);
    localStorage.setItem(ABILITY_FAV_KEY, JSON.stringify(favs));
}

export function isCustomAbility(id) {
    return getCustomAbilities().some(a => a.id === id);
}

// --- Custom Mobs ---

export function getCustomMobs() {
    try {
        const json = localStorage.getItem(CUSTOM_MOB_KEY);
        if (!json) return [];
        return JSON.parse(json);
    } catch {
        return [];
    }
}

export function saveCustomMob(input) {
    const mob = sanitizeMob(input);
    if (!mob) return;
    const items = getCustomMobs();
    const idx = items.findIndex(m => m.id === mob.id);
    if (idx !== -1) {
        items[idx] = mob;
    } else {
        items.push(mob);
    }
    localStorage.setItem(CUSTOM_MOB_KEY, JSON.stringify(items));
}

export function deleteCustomMob(id) {
    const items = getCustomMobs().filter(m => m.id !== id);
    localStorage.setItem(CUSTOM_MOB_KEY, JSON.stringify(items));
    // Also clean up favorites and mob entries
    const favs = getFavoriteMobIds().filter(f => f !== id);
    localStorage.setItem(MOB_FAV_KEY, JSON.stringify(favs));
    let entries = getSavedMobEntries().filter(e => e.id !== id);
    localStorage.setItem(MOB_KEY, JSON.stringify(entries));
}

export function isCustomMob(id) {
    return getCustomMobs().some(m => m.id === id);
}

// --- Folders (Abilities) ---

function readJson(key, fallback) {
    try {
        const json = localStorage.getItem(key);
        return json ? JSON.parse(json) : fallback;
    } catch {
        return fallback;
    }
}

export function getAbilityFolders() {
    return readJson(ABILITY_FOLDERS_KEY, []);
}

const TINTS = ['emerald', 'amber', 'rose', 'sky', 'violet', 'slate'];

function nextTint(folders) {
    const used = folders.map(f => f.tint).filter(Boolean);
    return TINTS.find(t => !used.includes(t)) || TINTS[folders.length % TINTS.length];
}

export function createAbilityFolder(name, tint) {
    const folders = getAbilityFolders();
    const folder = { id: crypto.randomUUID(), name: name.trim(), tint: tint || nextTint(folders) };
    folders.push(folder);
    localStorage.setItem(ABILITY_FOLDERS_KEY, JSON.stringify(folders));
    return folder;
}

export function renameAbilityFolder(id, name, tint) {
    const folders = getAbilityFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
        if (name !== undefined) folder.name = name.trim();
        if (tint !== undefined) folder.tint = tint;
        localStorage.setItem(ABILITY_FOLDERS_KEY, JSON.stringify(folders));
    }
}

export function deleteAbilityFolder(id) {
    const folders = getAbilityFolders().filter(f => f.id !== id);
    localStorage.setItem(ABILITY_FOLDERS_KEY, JSON.stringify(folders));
    const map = getAbilityFolderMap();
    let changed = false;
    for (const aid of Object.keys(map)) {
        if (map[aid] === id) {
            delete map[aid];
            changed = true;
        }
    }
    if (changed) localStorage.setItem(ABILITY_FOLDER_MAP_KEY, JSON.stringify(map));
}

export function getAbilityFolderMap() {
    return readJson(ABILITY_FOLDER_MAP_KEY, {});
}

export function setAbilityFolder(abilityId, folderId) {
    const map = getAbilityFolderMap();
    if (folderId) {
        map[abilityId] = folderId;
    } else {
        delete map[abilityId];
    }
    localStorage.setItem(ABILITY_FOLDER_MAP_KEY, JSON.stringify(map));
}

export function getAbilityFolderId(abilityId) {
    const map = getAbilityFolderMap();
    return map[abilityId] || null;
}

// --- Folders (Mobs) ---

export function getMobFolders() {
    return readJson(MOB_FOLDERS_KEY, []);
}

export function createMobFolder(name, tint) {
    const folders = getMobFolders();
    const folder = { id: crypto.randomUUID(), name: name.trim(), tint: tint || nextTint(folders) };
    folders.push(folder);
    localStorage.setItem(MOB_FOLDERS_KEY, JSON.stringify(folders));
    return folder;
}

export function renameMobFolder(id, name, tint) {
    const folders = getMobFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
        if (name !== undefined) folder.name = name.trim();
        if (tint !== undefined) folder.tint = tint;
        localStorage.setItem(MOB_FOLDERS_KEY, JSON.stringify(folders));
    }
}

export function deleteMobFolder(id) {
    const folders = getMobFolders().filter(f => f.id !== id);
    localStorage.setItem(MOB_FOLDERS_KEY, JSON.stringify(folders));
    const map = getMobFolderMap();
    let changed = false;
    for (const mid of Object.keys(map)) {
        if (map[mid] === id) {
            delete map[mid];
            changed = true;
        }
    }
    if (changed) localStorage.setItem(MOB_FOLDER_MAP_KEY, JSON.stringify(map));
}

export function getMobFolderMap() {
    return readJson(MOB_FOLDER_MAP_KEY, {});
}

export function setMobFolder(mobId, folderId) {
    const map = getMobFolderMap();
    if (folderId) {
        map[mobId] = folderId;
    } else {
        delete map[mobId];
    }
    localStorage.setItem(MOB_FOLDER_MAP_KEY, JSON.stringify(map));
}

export function getMobFolderId(mobId) {
    const map = getMobFolderMap();
    return map[mobId] || null;
}
