// Supabase project for couple mode. The publishable key is public by design: row-level security guards the data.
// Leave both empty to turn couple mode off.
export const SUPABASE_URL = 'https://bmghacmswvmrhfiwddie.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0pvVWy_P4eb72PicAt5aLg_dzz16KtL';
// Web Push (9pm reminder): public half of the VAPID pair. The private half is in Supabase Vault (vapid_keys).
export const VAPID_PUBLIC = 'BMEltk09AYnjXN8DA_XkCNgs1OHEXC27GaaLHcKXSIPl6M6ktWwBe4zguewPzx_xnlzwHpE3QmSHGrCweVQbYXE';
// Accounts that see the settings admin switch (test mode: everything unlocked, no daily limits, play not saved).
export const ADMIN_IDS = ['7965ea9f-ead8-46b4-971f-7abf9fabc698']; // 도균님
