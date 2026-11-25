const supabaseUrl = "https://muantngdsqojekqvrzpt.supabase.co";
const supabaseKey = "sb_publishable_Cks4Vwh8qOLaTZdmLIIo8Q_NNdjrbcl";

const supabaseClient = document.currentScript?.hasAttribute("data-supabase-config-only") ? null : window.supabase.createClient(
    supabaseUrl,
    supabaseKey
);
