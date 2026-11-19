# GitMessage 4.0.0

A Windows desktop messaging client built with Electron, React, Vite and Supabase. The 4.0 rebuild replaces the previous interface with an Apple-inspired Liquid Glass visual system.

## Included

- Supabase email/password sign-in and account creation.
- Conversation list loaded from `public.conversations`.
- Create a named conversation record from the app.
- Load and send text messages through `public.messages`.
- Realtime message inserts, message history and conversation search.
- Multiline message composer, account preferences, sign-out and light/dark appearance switch.
- Windows x64 NSIS installer built by GitHub Actions.

## Important limitations

Creating a conversation currently creates a named conversation record for the signed-in user; it does not search for people, invite participants, or create a direct/group chat membership. That requires the actual participant table and Row Level Security rules for this Supabase project to be confirmed.

File attachments, voice/video calls, read receipts, push notifications, automatic updates and end-to-end encryption are not implemented. Those controls are intentionally not shown as working features.

The UI assumes these columns:
- `public.conversations(id,title,is_group,created_by,updated_at)`
- `public.messages(id,conversation_id,sender_id,body,created_at)`

The database schema and RLS policies have not been introspected from this repository. If conversation creation or messaging returns a Supabase permission/schema error, the relevant table policies or column names must be corrected before the feature can work.

## Local setup

1. Install Node.js 22 LTS.
2. Create `.env.local` from `.env.example`.
3. Set `VITE_SUPABASE_URL` to `https://pvoywcvyhfuszalczycm.supabase.co`.
4. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to your existing Supabase publishable key.
5. In Command Prompt run:

```cmd
npm install
npm run dev
```

## Windows installer

The GitHub Actions workflow builds the installer on pushes to `main` and can also be run manually from Actions. It requires the repository Actions secret `VITE_SUPABASE_PUBLISHABLE_KEY` containing the Supabase publishable key.

Only the publishable key belongs in the desktop client. Never put a Supabase service-role key in the repository or client.
