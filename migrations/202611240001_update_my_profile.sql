-- Allow authenticated users to update their own full name.
-- Users cannot modify their role through this function.
-- Verified in CSUPAK-TEST.

BEGIN;

CREATE FUNCTION public.update_my_profile(
    p_full_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_full_name text := pg_catalog.btrim(p_full_name);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF v_full_name IS NULL
        OR pg_catalog.char_length(v_full_name) < 2
        OR pg_catalog.char_length(v_full_name) > 100
    THEN
        RAISE EXCEPTION
            'Full name must contain 2 to 100 characters'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET full_name = v_full_name
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    RETURN v_full_name;
END;
$$;

REVOKE ALL
ON FUNCTION public.update_my_profile(text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.update_my_profile(text)
TO authenticated;

COMMIT;