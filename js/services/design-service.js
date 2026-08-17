import { getClient, isConfigured } from './supabase-client.js';
import { getUser } from './auth-service.js';
import { sanitizeAbility, sanitizeMob } from '../utils/sanitize.js';

// Publish state for the signed-in user, keyed `${kind}:${localId}`. Populated by
// loadMyDesigns() so the library can render buttons synchronously.
let myDesigns = new Map();
let admin = false;

function key(kind, localId) {
    return `${kind}:${localId}`;
}

export function isPublishingAvailable() {
    return isConfigured() && !!getUser();
}

export function isAdmin() {
    return admin;
}

export function getPublishState(kind, localId) {
    return myDesigns.get(key(kind, localId)) || null;
}

export async function loadMyDesigns() {
    myDesigns = new Map();
    admin = false;
    if (!isPublishingAvailable()) return myDesigns;

    const client = await getClient();
    const [designs, profile] = await Promise.all([
        // RLS also exposes other people's approved designs, and their local_id can
        // collide with one of ours — so scope this to the owner explicitly.
        client.from('designs')
            .select('id, kind, local_id, visibility, moderation_status, moderation_reason, hidden')
            .eq('owner', getUser().id),
        client.from('profiles').select('is_admin, trust').eq('id', getUser().id).maybeSingle()
    ]);

    if (designs.error) throw designs.error;
    for (const row of designs.data || []) {
        myDesigns.set(key(row.kind, row.local_id), row);
    }
    admin = !!profile.data?.is_admin;
    return myDesigns;
}

export async function publishAbility(ability) {
    return upsertDesign({
        kind: 'ability',
        local_id: ability.id,
        name: ability.data.abilityName || 'Untitled ability',
        world: null,
        data: ability.data
    });
}

export async function publishMob(mob, world) {
    return upsertDesign({
        kind: 'mob',
        local_id: mob.id,
        name: mob.data.name || 'Untitled mob',
        world: world || mob.world || null,
        data: mob.data
    });
}

async function upsertDesign(fields) {
    const client = await getClient();
    const { data, error } = await client
        .from('designs')
        .upsert({ ...fields, owner: getUser().id, visibility: 'public' }, { onConflict: 'owner,kind,local_id' })
        .select('id, kind, local_id, visibility, moderation_status, moderation_reason, hidden')
        .single();

    if (error) throw error;
    myDesigns.set(key(data.kind, data.local_id), data);
    return data;
}

export async function unpublish(kind, localId) {
    const existing = getPublishState(kind, localId);
    if (!existing) return;

    const client = await getClient();
    const { data, error } = await client
        .from('designs')
        .update({ visibility: 'private' })
        .eq('id', existing.id)
        .select('id, kind, local_id, visibility, moderation_status, moderation_reason, hidden')
        .single();

    if (error) throw error;
    myDesigns.set(key(kind, localId), data);
    return data;
}

// --- Community (public, readable signed-out) ---

export async function listPublic() {
    if (!isConfigured()) return [];

    const client = await getClient();
    const { data, error } = await client
        .from('designs')
        .select('id, kind, local_id, name, world, data, created_at')
        .eq('visibility', 'public')
        .eq('moderation_status', 'approved')
        .eq('hidden', false)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) throw error;
    return (data || []).map(toLocalShape).filter(Boolean);
}

// --- Review queue (admin) ---

export async function listPending() {
    const client = await getClient();
    const { data, error } = await client
        .from('designs')
        .select('*')
        .eq('visibility', 'public')
        .eq('moderation_status', 'pending')
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(toLocalShape).filter(Boolean);
}

export async function moderate(id, status, reason) {
    const client = await getClient();
    const { error } = await client
        .from('designs')
        .update({ moderation_status: status, moderation_reason: reason || null })
        .eq('id', id);

    if (error) throw error;
}

// Rows from another account are untrusted input, exactly like an imported file —
// rebuild them through the same sanitizer before anything renders them.
function toLocalShape(row) {
    const item = row.kind === 'ability'
        ? sanitizeAbility({ id: row.local_id, data: row.data })
        : sanitizeMob({ id: row.local_id, world: row.world, data: row.data });

    if (!item) return null;
    return { row, kind: row.kind, item };
}
