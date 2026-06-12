const CHARACTER_LIST_KEY = 'phoenix_character_list';
const CHARACTER_PREFIX = 'phoenix_char_';

function getItem(key) {
    try {
        const json = localStorage.getItem(key);
        if (!json) return null;
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function setItem(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function removeItem(key) {
    localStorage.removeItem(key);
}

export function getCharacterList() {
    return getItem(CHARACTER_LIST_KEY) || [];
}

export function loadCharacter(characterId) {
    return getItem(`${CHARACTER_PREFIX}${characterId}`);
}

export function saveCharacter(character, characterId) {
    if (!characterId) {
        characterId = crypto.randomUUID();
    }

    const key = `${CHARACTER_PREFIX}${characterId}`;
    setItem(key, character);

    const characterList = getCharacterList();
    const existingIndex = characterList.findIndex(c => c.id === characterId);

    const metadata = {
        id: characterId,
        name: character.characterName || '',
        level: character.level || 0,
        race: character.race || '',
        concept: character.concept || '',
        lastModified: new Date().toISOString()
    };

    if (existingIndex !== -1) {
        characterList[existingIndex] = metadata;
    } else {
        characterList.push(metadata);
    }

    setItem(CHARACTER_LIST_KEY, characterList);
    return characterId;
}

export function deleteCharacter(characterId) {
    const characterList = getCharacterList();
    const filtered = characterList.filter(c => c.id !== characterId);
    setItem(CHARACTER_LIST_KEY, filtered);
    removeItem(`${CHARACTER_PREFIX}${characterId}`);
}

export function characterExists(characterName) {
    const characterList = getCharacterList();
    return characterList.some(c => c.name.toLowerCase() === characterName.toLowerCase());
}
