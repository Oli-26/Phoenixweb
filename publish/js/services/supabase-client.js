import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2';

let clientPromise = null;

export function isConfigured() {
    return SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('PASTE_');
}

// `detectSessionInUrl` must only run in the popup, which is the window that receives
// the OAuth redirect. In the app window it would try to consume a code that isn't there.
export function getClient({ detectSessionInUrl = false } = {}) {
    if (!clientPromise) {
        clientPromise = import(SUPABASE_ESM).then(({ createClient }) =>
            createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    flowType: 'pkce',
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl
                }
            })
        );
    }
    return clientPromise;
}
