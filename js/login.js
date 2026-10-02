const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    loginMessage.textContent = "Logging in...";

    const loginResult = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (loginResult.error) {
        loginMessage.textContent = "Invalid email or password.";
        console.error(loginResult.error);
        return;
    }

    const user = loginResult.data.user;

    const profileResult = await supabaseClient
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();

    if (profileResult.error) {
        loginMessage.textContent = "Unable to load user profile.";
        console.error(profileResult.error);
        return;
    }

    console.log("Logged in user:", user);
    console.log("User profile:", profileResult.data);

    loginMessage.textContent =
        "Welcome, " + profileResult.data.full_name + "!";
});