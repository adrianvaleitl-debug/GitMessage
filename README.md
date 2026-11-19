# GitMessage 3.0.0 — clean rebuild

A fresh Electron + React + Vite + Supabase desktop client. The renderer can be previewed in a browser without launching Electron.

## Local setup

1. Install Node.js 22 LTS.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` to `https://pvoywcvyhfuszalczycm.supabase.co`.
4. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to your existing Supabase publishable key.
5. In Command Prompt, run:

```cmd
npm install
npm run dev
```

Open the Vite URL shown in the terminal. This tests the interface and Supabase login without requiring the Electron binary.

## Build the installer with GitHub Actions

1. In repository Settings → Secrets and variables → Actions, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
2. Open Actions → Build Windows installer → Run workflow.
3. Download the `GitMessage-Windows-Installer` artifact when the run succeeds.

The workflow uses a GitHub-hosted Windows runner to install Electron and create the NSIS installer.

## Supabase compatibility

The client expects `public.conversations(id,title,updated_at)` and `public.messages(id,conversation_id,sender_id,body,created_at)`, with suitable Row Level Security policies and Realtime enabled for `messages`. The database has not been introspected from this generated source package; verify those columns and policies before treating messaging as production-ready.

Only the Supabase publishable key belongs in the client. Never put a service-role key in `.env.local`.

## Current scope

Email/password sign-in and sign-up, conversation list, realtime text messages, dark glass UI, and Windows NSIS packaging. Group creation, invitations, attachments, voice/video calling, read receipts, push notifications, automatic updates, and end-to-end encryption are not implemented.
