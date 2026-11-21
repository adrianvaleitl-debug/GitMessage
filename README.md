# GitMessage 4.0 — Official Stable Release

<p align="center">
  <strong>One place for real-time conversations across web and Windows.</strong><br>
  <a href="https://adrianvaleitl-debug.github.io/GitMessage/">Open the web app</a> ·
  <a href="https://github.com/adrianvaleitl-debug/GitMessage/releases/latest">Download for Windows</a> ·
  <a href="https://adrianvaleitl-debug.github.io/Adrian-Vales-Projects/#gitmessage-launch">Launch announcement</a>
</p>

**GitMessage 4.0 is officially released.** The stable public release is available now. Sign in on the web or install the Windows desktop app and use the same account across both.

## What you can do

- **Accounts and profiles:** create an account, sign in, set a display name and profile picture, write a bio, preview your public profile and open clickable links in bios.
- **Real-time direct messaging:** start conversations, receive live updates, search chats and access message history.
- **Cleaner conversations:** messages are shown chronologically; consecutive messages from the same sender are grouped when sent within five minutes and no one else has replied.
- **Message actions:** use the message context menu to copy message text, view profiles and access relevant profile actions.
- **Servers and channels:** create server spaces and organise conversations into text channels.
- **Media sharing:** send supported image and video attachments, with inline viewing or playback where supported.
- **Voice and video:** make one-to-one voice and video calls using WebRTC. You can join even when camera or microphone access is unavailable; local media is only sent when permission is granted.
- **Web and Windows:** use the responsive browser app or install the Windows desktop app.
- **Automatic desktop updates:** the Windows app checks for stable releases, downloads updates in the background and prompts you to restart to install them.
- **Appearance and layout:** switch between light and dark themes and use layouts adapted for smaller screens.

## Get GitMessage

| Platform | Link |
| --- | --- |
| Web app | https://adrianvaleitl-debug.github.io/GitMessage/ |
| Latest Windows installer | https://github.com/adrianvaleitl-debug/GitMessage/releases/latest |
| Release notes and previous versions | https://github.com/adrianvaleitl-debug/GitMessage/releases |
| Adrian Vale project hub | https://adrianvaleitl-debug.github.io/Adrian-Vales-Projects/ |

## Important limitations

- Calling is currently one-to-one. Group voice/video calls are not available.
- Calls use WebRTC and are not advertised as end-to-end encrypted.
- Camera and microphone access are optional for joining, but local audio/video is not transmitted without permission.
- Attachment availability depends on the Supabase storage bucket's MIME-type policies and configured size limit.

## Technology

GitMessage is built with React, TypeScript, Vite and Electron, with Supabase providing authentication, data storage and realtime messaging.

## Run locally

1. Install Node.js 22 LTS.
2. Create `.env.local` from `.env.example`.
3. Set `VITE_SUPABASE_URL` to `https://pvoywcvyhfuszalczycm.supabase.co`.
4. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to your Supabase publishable key.
5. Run:

```bash
npm install
npm run dev
```

Build the web app with `npm run build`. The Windows installer is produced by GitHub Actions and requires the repository Actions secret `VITE_SUPABASE_PUBLISHABLE_KEY`.

Only the Supabase publishable key belongs in the client. Never commit a service-role key.
