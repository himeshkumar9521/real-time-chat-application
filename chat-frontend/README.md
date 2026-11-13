# Chatter — Glassmorphism frontend

Responsive React + Vite chat client with a translucent glassmorphism theme.

## Run locally

1. Use Node.js 20.19+ (required by Vite 8).
2. Copy `.env.example` to `.env` and set `VITE_API_URL` to your backend origin (default `http://localhost:5000`).
3. Run `npm install`, then `npm run dev`.
4. Set backend `CLIENT_URL` to your frontend origin (usually `http://localhost:5173`).

## Included fixes

- The app checks `/api/user/me` after restoring a saved login, so a stale local username cannot be shown as the currently authenticated account.
- The private-chat dialog identifies the signed-in username and prevents selecting that same username.
- The backend emits `rooms:updated` to all members when a new private or group room is created; connected clients refresh their room list immediately.
- Room membership lookup is case-insensitive, avoiding missed rooms caused by username capitalization differences.

## Backend update required

Use the accompanying updated backend archive as well as this frontend. It adds `GET /api/user/me`, Socket.IO per-user notification rooms, and the room-created notifications. Restart the backend after replacing its source files.

## Email verification

Email verification uses `/verify-email?token=...` in the frontend and `/api/user/email-verify` on the backend. Configure the backend email link/client URL for your frontend origin.

## Username rename behavior

Changing a username updates only that account's username references in room memberships, creator metadata, and the account's own historical message sender labels. Existing group and private room names are not rebuilt from usernames and remain unchanged. The frontend refreshes its room list after a successful rename so the updated member labels appear without a page reload.


## Room lifecycle
- Any member can delete a private conversation; it is removed for both participants.
- A group member's Delete/Leave action removes only that member from the group.
- When two members remain, the group is converted into a private conversation. If one person would remain, the room is removed because a one-person private chat is not useful.
- Group creation requires at least three members, including the creator.
