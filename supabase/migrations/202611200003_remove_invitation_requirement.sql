-- Disable invitation-code enforcement for new GitMessage accounts.
-- Existing users, profiles, and invitation records are left untouched.
DO $$
DECLARE
  trigger_row record;
BEGIN
  FOR trigger_row IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND p.proname = 'enforce_invitation_on_signup'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON auth.users', trigger_row.tgname);
  END LOOP;
END
$$;
