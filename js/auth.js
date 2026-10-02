async function getCurrentUser() {
    const result = await supabaseClient.auth.getUser();

    if (result.error) {
        console.error(result.error);
        return null;
    }

    return result.data.user;
}


async function getCurrentProfile() {
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    const result = await supabaseClient
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();

    if (result.error) {
        console.error(result.error);
        return null;
    }

    return result.data;
}


async function logout() {
    const result = await supabaseClient.auth.signOut();

    if (result.error) {
        console.error(result.error);
        return false;
    }

    window.location.href = "../index.html";

    return true;
}