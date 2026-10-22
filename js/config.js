// =====================================================================
//  AKASH SHOP C1 · Inventory Tracker — settings
//  Fill in the two Supabase values (Project Settings → API in Supabase).
//  The "anon" / "publishable" key is meant to be public: the database
//  only answers to signed-in staff, so it is safe to put here.
// =====================================================================

export const CONFIG = {
  SUPABASE_URL: 'https://zrjnmziqepikdnhlqccy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_c0jf8YzwtPTGixLhgSlAQA_gfna_z-E',

  // Money format
  CURRENCY: 'GBP',      // e.g. 'GBP', 'USD', 'EUR', 'INR', 'PKR', 'AED'
  LOCALE: 'en-GB',      // e.g. 'en-GB', 'en-US', 'en-IN'

  // Security
  REMEMBER_LOGIN: false,   // false = must sign in again after closing the browser tab
  IDLE_LOGOUT_MINUTES: 30, // sign out automatically after this long with no activity (0 = never)

  // Default low-stock alert level for new items
  DEFAULT_LOW_STOCK: 5,
};
