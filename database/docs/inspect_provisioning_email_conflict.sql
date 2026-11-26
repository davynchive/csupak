-- Run privately in the dashboard SQL Editor. Replace only the placeholder
-- with the affected address (escape any single quote by doubling it).
-- The result contains counts only. Clear the query text after use.
WITH input AS (
    SELECT pg_catalog.lower(pg_catalog.btrim('replace-locally@example.invalid')) AS email
)
SELECT
    (SELECT count(*) FROM auth.users AS u
     WHERE pg_catalog.lower(pg_catalog.btrim(u.email)) = input.email) AS current_auth_emails,
    (SELECT count(*) FROM auth.users AS u
     WHERE pg_catalog.lower(pg_catalog.btrim(u.email_change)) = input.email) AS pending_auth_email_changes,
    (SELECT count(*) FROM auth.identities AS i
     WHERE pg_catalog.lower(pg_catalog.btrim(i.email)) = input.email) AS linked_identity_emails,
    (SELECT count(*) FROM csupak_private.account_provisioning AS p
     WHERE p.email = input.email AND p.onboarding_completed_at IS NULL) AS unfinished_provisioning,
    (SELECT count(*) FROM csupak_private.account_provisioning AS p
     WHERE p.email = input.email AND p.onboarding_completed_at IS NOT NULL) AS completed_provisioning,
    (SELECT count(*) FROM csupak_private.account_provisioning AS p
     WHERE p.email = input.email AND p.onboarding_completed_at IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM auth.users AS u WHERE u.id = p.target_user_id AND u.deleted_at IS NULL
     )) AS completed_without_live_auth_user
FROM input;
