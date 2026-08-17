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

export async function listPublic({ sort = 'new' } = {}) {
    if (!isConfigured()) return [];

    const client = await getClient();
    let query = client
        .from('designs')
        .select('id, kind, local_id, name, world, data, created_at, vote_count')
        .eq('visibility', 'public')
        .eq('moderation_status', 'approved')
        .eq('hidden', false);

    query = sort === 'top'
        ? query.order('vote_count', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });

    const { data, error } = await query.limit(200);

    if (error) throw error;
    return (data || []).map(toLocalShape).filter(Boolean);
}

// Individual votes are private, so this only ever returns the caller's own.
export async function loadMyVotes() {
    if (!isPublishingAvailable()) return new Set();

    const client = await getClient();
    const { data, error } = await client
        .from('design_votes')
        .select('design_id')
        .eq('voter', getUser().id);

    if (error) throw error;
    return new Set((data || []).map(row => row.design_id));
}

// Returns the design's new vote count.
export async function setVote(designId, voted) {
    const client = await getClient();

    if (voted) {
        const { error } = await client
            .from('design_votes')
            .insert({ design_id: designId, voter: getUser().id });
        if (error && error.code !== '23505') throw error;   // 23505: already voted
    } else {
        const { error } = await client
            .from('design_votes')
            .delete()
            .eq('design_id', designId)
            .eq('voter', getUser().id);
        if (error) throw error;
    }

    const { data, error: readError } = await client
        .from('designs')
        .select('vote_count')
        .eq('id', designId)
        .single();

    if (readError) throw readError;
    return data.vote_count;
}

export async function reportDesign(designId, reason) {
    const client = await getClient();
    const { error } = await client
        .from('design_reports')
        .insert({ design_id: designId, reporter: getUser().id, reason });

    if (error && error.code !== '23505') throw error;       // 23505: already reported
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

// Anything with reports outstanding, hidden or not — admin only by RLS.
export async function listReported() {
    const client = await getClient();
    const { data, error } = await client
        .from('designs')
        .select('id, kind, local_id, name, world, data, created_at, hidden, report_count')
        .gt('report_count', 0)
        .order('report_count', { ascending: false });

    if (error) throw error;

    const entries = (data || []).map(toLocalShape).filter(Boolean);
    if (entries.length === 0) return entries;

    const { data: reasons, error: reasonError } = await client
        .from('design_reports')
        .select('design_id, reason, created_at')
        .in('design_id', entries.map(e => e.row.id));

    if (reasonError) throw reasonError;

    for (const entry of entries) {
        entry.reports = (reasons || []).filter(r => r.design_id === entry.row.id);
    }
    return entries;
}

export async function setHidden(id, hidden) {
    const client = await getClient();
    const { error } = await client.from('designs').update({ hidden }).eq('id', id);
    if (error) throw error;
}

// Clears the report queue for a design an admin has judged fine.
export async function clearReports(id) {
    const client = await getClient();
    const { error } = await client.from('design_reports').delete().eq('design_id', id);
    if (error) throw error;
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
