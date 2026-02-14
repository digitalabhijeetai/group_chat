# Community Hub - Invite-Only Discussion App

## Overview
A community discussion application with invite-only access, OTP-based authentication, real-time chat with WebSocket, admin controls, file sharing, and blocked keywords moderation.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter routing
- **Backend**: Express.js + PostgreSQL (Drizzle ORM) + WebSocket (ws)
- **Auth**: Phone OTP-based login via WhatsApp (WATI API), admin phone: 7030809030
- **File Storage**: Multer for image/PDF uploads, served from /uploads directory
- **Sessions**: 6-hour auto-expiry via express-session cookie maxAge
- **CSV Parsing**: papaparse for CSV member imports

## Key Features
- OTP login (4-digit) - no public signup, invite only
- Real-time chat with WebSocket
- Dark/light mode toggle (persisted in localStorage)
- @mentions and full emoji picker (emoji-picker-react)
- Clickable links in messages and pinned messages
- Admin: pin/delete messages, bulk select & delete messages, disable chat, restrict members, delete members, edit phone numbers
- Disappearing messages (admin sets auto-delete timer: 1h to 30 days, pinned messages exempt)
- Admin panel: bulk add members (name + phone only), edit member profiles
- CSV member import (name + phone columns)
- File sharing (images and PDFs) with admin toggle to disable for members
- Phone number filter (admin toggle, auto-blocks member messages containing phone numbers)
- Message reactions with full emoji picker
- Online member count (WebSocket-based tracking)
- Blocked keywords system (admin manages list, messages auto-rejected)
- Sticky pinned messages (visible on all screens, collapsible)
- Sub-admin role system (primary admin can promote/demote)
- Member profile: profile picture upload, project stats tracking (values in INR ₹)
- Leaderboard: top 50 members by total project value in INR (₹)
- Responsive design for mobile and desktop
- 6-hour session auto-logout

## Role System
- **admin**: Primary admin (phone: 7030809030). Full control, can promote/demote sub-admins.
- **sub-admin**: Has all admin rights EXCEPT: cannot modify/restrict/delete primary admin or their messages.
- **member**: Regular member with chat access only.
- Auth context: `isAdmin` = true for both admin and sub-admin. `isPrimaryAdmin` = true only for primary admin.

## Project Structure
- `shared/schema.ts` - Drizzle schema (members, messages, reactions, chatSettings, blockedKeywords, projectUpdates, communitySettings, notifications)
- `server/routes.ts` - All API endpoints + WebSocket + online tracking
- `server/storage.ts` - Database operations via Drizzle
- `server/seed.ts` - Seed data for initial load
- `client/src/pages/login.tsx` - OTP login page
- `client/src/pages/chat.tsx` - Main chat interface with sticky pinned messages, online count, notification bell, reply support
- `client/src/pages/admin.tsx` - Admin panel (members tab + blocked keywords tab + CSV import + sub-admin management)
- `client/src/pages/profile.tsx` - Member profile page (profile picture, project stats, update history)
- `client/src/pages/leaderboard.tsx` - Top 50 leaderboard by earnings
- `client/src/components/chat-message.tsx` - Individual message component with clickable links, reply context display, reply button
- `client/src/components/chat-input.tsx` - Message input with emoji/file/mention
- `client/src/components/theme-provider.tsx` - Dark/light mode context provider
- `client/src/lib/auth.tsx` - Auth context provider (isAdmin, isPrimaryAdmin)
- `client/src/lib/websocket.tsx` - WebSocket context provider

## API Routes
- POST /api/auth/request-otp - Request OTP for phone
- POST /api/auth/verify-otp - Verify OTP and login
- GET /api/auth/me - Get current session member
- POST /api/auth/logout - Logout
- GET /api/online-count - Get online member count
- GET /api/members - List all members (filtered for non-admin)
- PATCH /api/members/:id - Update member (admin/sub-admin, sub-admin cannot edit primary admin)
- DELETE /api/members/:id - Delete member (admin/sub-admin, cannot delete primary admin)
- POST /api/members/bulk - Bulk add members (admin/sub-admin)
- POST /api/members/csv-import - Import members from CSV file (admin/sub-admin)
- POST /api/members/profile-picture - Upload profile picture (own profile)
- POST /api/members/update-projects - Update project stats with required link (own profile, increases only)
- GET /api/members/:id/project-updates - Get project update history
- POST /api/members/:id/restrict - Restrict member (admin/sub-admin, sub-admin cannot restrict primary admin)
- POST /api/members/:id/unrestrict - Lift restriction (admin/sub-admin)
- POST /api/members/:id/make-sub-admin - Promote to sub-admin (primary admin only)
- POST /api/members/:id/remove-sub-admin - Demote sub-admin (primary admin only)
- GET /api/leaderboard - Top 50 members by total project value
- GET /api/messages - Get all messages
- POST /api/messages - Send text message (blocked keyword check)
- POST /api/messages/upload - Upload file message
- POST /api/messages/:id/pin - Pin/unpin message (admin/sub-admin)
- DELETE /api/messages/:id - Delete message (admin/sub-admin, sub-admin cannot delete primary admin messages)
- GET /api/reactions - Get all reactions
- POST /api/reactions - Toggle reaction
- GET /api/chat-settings - Get chat settings
- POST /api/chat-settings/toggle - Toggle chat (admin/sub-admin)
- GET /api/community-settings - Get community settings (public, no auth)
- PATCH /api/community-settings - Update community name (admin/sub-admin)
- GET /api/blocked-keywords - List blocked keywords (admin/sub-admin)
- POST /api/blocked-keywords - Add blocked keyword (admin/sub-admin)
- PATCH /api/blocked-keywords/:id - Edit keyword (admin/sub-admin)
- DELETE /api/blocked-keywords/:id - Remove keyword (admin/sub-admin)
- GET /api/notifications - Get notifications for current user
- GET /api/notifications/unread-count - Get unread notification count
- POST /api/notifications/mark-read - Mark all notifications as read

## Test Credentials
- Admin phone: 7030809030
- Test member phone: 9890012345
- OTP: Sent via WhatsApp (WATI API), random 4-digit code, expires in 5 minutes

## Running
- `npm run dev` starts the app on port 5000
- `npm run db:push` pushes schema to DB

## User Preferences
- No email field in member profiles (name + phone only)
- Members added via admin bulk-add with name and phone
- Non-admin members see only id/name/role/isActive of other members
- Non-admin members cannot see member list sidebar
- Blocked keywords are case-insensitive
- Admin and sub-admin messages bypass keyword filtering
- Links in messages are clickable (open in new tab)
- Pinned messages are sticky at top of chat, collapsible
