let abilities = [];

export async function loadAbilities() {
    if (abilities.length > 0) return;

    try {
        const response = await fetch('data/abilities.json');
        if (response.ok) {
            const data = await response.json();
            if (data.dataItems) {
                abilities = data.dataItems;
            }
        }
    } catch (e) {
        console.error('Failed to load abilities:', e);
        abilities = [];
    }
}

export function getAllAbilities() {
    return abilities;
}

export function searchAbilities(searchTerm, selectedTags) {
    let results = abilities;

    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        results = results.filter(a =>
            a.data.abilityName.toLowerCase().includes(term) ||
            a.data.abilityDescription.toLowerCase().includes(term)
        );
    }

    if (selectedTags && selectedTags.length > 0) {
        results = results.filter(a =>
            selectedTags.every(tag => a.data.tags.includes(tag))
        );
    }

    return results;
}

export function getAllTags() {
    const tagSet = new Set();
    for (const a of abilities) {
        for (const tag of a.data.tags) {
            tagSet.add(tag);
        }
    }
    return [...tagSet].sort();
}

export function getAbilityById(id) {
    return abilities.find(a => a.id === id) || null;
}

export function hasLevel(data, level) {
    const desc = getLevelDescription(data, level);
    return desc && desc !== '' && desc !== 'N/A';
}

export function getLevelDescription(data, level) {
    return data[`level${level}Description`] || '';
}

export function getLevelCost(data, level) {
    return data[`level${level}Cost`] || '';
}

export function isPassive(data, level) {
    const cost = getLevelCost(data, level);
    return cost.toLowerCase() === 'passive';
}
