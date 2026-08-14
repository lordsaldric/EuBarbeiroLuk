"use strict";

(function initializeSupabase() {
  if (!window.supabase || !window.APP_CONFIG) {
    throw new Error("Não foi possível iniciar a agenda online.");
  }

  window.appDatabase = window.supabase.createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "eu-barbeiro-luk-auth"
      }
    }
  );
})();
