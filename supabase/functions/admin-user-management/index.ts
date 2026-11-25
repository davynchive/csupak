import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    publishableKeys: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    allowedOrigins: Deno.env.get("ADMIN_USER_MANAGEMENT_ALLOWED_ORIGINS"),
    secretKeys: Deno.env.get("SUPABASE_SECRET_KEYS"),
    setupRedirect: Deno.env.get("ADMIN_USER_MANAGEMENT_SETUP_REDIRECT_URL"),
    resetRedirect: Deno.env.get("ADMIN_USER_MANAGEMENT_PASSWORD_RESET_REDIRECT_URL"),
}));
