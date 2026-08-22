#!/usr/bin/env node
// One-off: push the bundled data/*.json into the public.catalog table.
// Safe to re-run — rows are upserted on id.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=... \
//   node scripts/seed-catalog.mjs [--dry-run]
//
// The service_role key bypasses RLS, which is why this runs from a shell and
// never from the browser. Do not commit it.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = 100;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!url || (!key && !dryRun)) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service_role, not anon).');
    process.exit(1);
}

const MOB_FILES = {
    barbarus: 'data/barbarus-mobs.json',
    rifts: 'data/rifts-mobs.json',
    city: 'data/city-mobs.json'
};

// The exported files carry a UTF-8 BOM, which JSON.parse rejects.
async function readItems(relative) {
    const text = (await readFile(join(ROOT, relative), 'utf8')).replace(/^﻿/, '');
    return JSON.parse(text).dataItems || [];
}

function abilityRow(item) {
    const name = (item.data?.abilityName || '').trim();
    if (!item.id || !name) return null;
    return { id: item.id, kind: 'ability', world: null, name: name.slice(0, 200), data: item.data, published: true };
}

function mobRow(item, world) {
    const name = (item.data?.name || '').trim();
    if (!item.id || !name) return null;
    return { id: item.id, kind: 'mob', world, name: name.slice(0, 200), data: item.data, published: true };
}

async function push(rows) {
    const res = await fetch(`${url}/rest/v1/catalog?on_conflict=id`, {
        method: 'POST',
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(rows)
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

const rows = [];

for (const item of await readItems('data/abilities.json')) {
    const row = abilityRow(item);
    if (row) rows.push(row); else console.warn('Skipped ability without id/name:', item.id);
}

for (const [world, file] of Object.entries(MOB_FILES)) {
    for (const item of await readItems(file)) {
        const row = mobRow(item, world);
        if (row) rows.push(row); else console.warn(`Skipped mob without id/name in ${world}:`, item.id);
    }
}

const duplicates = rows.length - new Set(rows.map(r => r.id)).size;
if (duplicates > 0) {
    console.error(`${duplicates} duplicate id(s) across the source files — fix those before seeding.`);
    process.exit(1);
}

console.log(`${rows.length} rows ready (${rows.filter(r => r.kind === 'ability').length} abilities, ${rows.filter(r => r.kind === 'mob').length} mobs).`);

if (dryRun) {
    console.log('Dry run — nothing sent.');
    process.exit(0);
}

for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await push(batch);
    console.log(`  pushed ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}

console.log('Done.');
