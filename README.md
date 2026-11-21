# GitMessage 4.0

**GitMessage is a real-time messaging app for the web and Windows.** It brings direct conversations, profiles, media sharing, server-based communities and one-to-one calling into a single interface, with the same Supabase-backed account across platforms.

## Features

- **Accounts:** create an account, sign in and manage your profile and display name.
- **Direct messaging:** create and manage conversations, send messages in real time, search chats and view message history.
- **Message experience:** messages stay in chronological order, consecutive messages from the same sender are grouped within five minutes when no one else has replied, and message context actions include copying and opening profiles.
- **Profiles:** profile pictures, display names, bios and public profile previews. Website links in bios are clickable.
- **Servers and channels:** create and access server spaces with text channels for organised community conversations.
- **Media:** share supported image and video attachments, with inline playback where supported.
- **Voice and video:** one-to-one calls using WebRTC. A call can still connect when local camera or microphone access is unavailable; local media is simply not transmitted until permission is granted.
- **Web and Windows:** use the responsive web app or install the Windows desktop app.
- **Automatic desktop updates:** the Windows app checks for stable releases, downloads updates in the background and offers to restart to install them.
- **Appearance:** light and dark themes and a responsive layout for smaller screens.

## Get GitMessage

- **Web app:** https://adrianvaleitl-debug.github.io/GitMessage/
- **Windows installer and release notes:** https://github.com/adrianvaleitl-debug/GitMessage/releases/latest
- **Source code:** https://github.com/adrianvaleitl-debug/GitMessage

The Windows installer is published through GitHub Releases. The desktop updater follows stable releases.

## Important notes

- Calls are currently one-to-one; group voice/video calling is not available.
- Calls use WebRTC and are not advertised as end-to-end encrypted.
- Camera and microphone access are optional for joining a call, but the corresponding local media will not be sent without permission.
- Supabase provides authentication, message storage and realtime updates. The app requires the configured Supabase project and its database/storage policies.
- Attachment support depends on the configured Supabase storage bucket and its allowed MIME types and size limits.

## Local development

1. Install Node.js 22 LTS.
2. Create `.env.local` from `.env.example`.
3. Set `VITE_SUPABASE_URL` to `https://pvoywcvyhfuszalczycm.supabase.co`.
4. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to your Supabase publishable key.
5. Run:

```cmd
npm install
npm run dev
```

To build the web app, run `npm run build`. The Windows installer is built by the GitHub Actions workflow and requires the repository Actions secret `VITE_SUPABASE_PUBLISHABLE_KEY`.

Only the Supabase publishable key belongs in the client. Never commit a service-role key.
