# Ecomedic Squad — Phase 1 MVP Plan

A scientific research blog platform with authentication, user dashboard, and admin panel. Built on Lovable Cloud (Supabase) with the dark neon-gradient aesthetic from your reference image (deep navy/purple background, magenta→cyan gradients, glassmorphism cards).

## Phase 1 Scope (this plan)

This phase delivers the core working product. Phases 2 & 3 (listed at the bottom) cover the remaining features.

### 1. Auth
- **Login**: email/username + password
- **Sign up**: first name, last name, username, email, country (searchable dropdown of all countries), password, confirm password — all required, validated with Zod
- Sessions via Lovable Cloud (Supabase Auth)
- After login: users → `/dashboard`, admins → `/admin`
- Role stored in separate `user_roles` table (admin/user) — assigned manually in DB

### 2. User Dashboard (`/dashboard`)
- **Top bar**: Ecomedic logo (gradient text), AI semantic search bar, profile icon (top-right)
- **Horizontal scrollable category strip** below the top bar with tabs: **All / Drugs / Disease / Discovery** (when a tab is active, search is scoped to that tab's content)
- **Left collapsible sidebar (3-line toggle)**:
  - Search input at top (filters list as you type)
  - Full A–Z list of all research entries: number, name, issue
- **Main grid of blog cards** (glassmorphism, ~85% width container, responsive grid):
  - Header image, title, description preview, like count, comment count
  - Click → opens full research detail page
- **Profile menu** (top-right icon): full name, username, email (read-only), password, country, phone, avatar upload — Update button persists changes

### 3. Research Detail Page
- Full content rendering (HTML from rich editor)
- **Bottom interaction bar**:
  - Heart icon (left): outlined when not liked, filled red when liked
  - Comment input (center) with inline send button; **Enter = newline**, send button submits
  - Comments list below: newest first, each comment likeable with live count
  - Users see all comments, including their own

### 4. Admin Panel (`/admin`)
Top bar with AI search + profile icon. Tabs: **Overview / Users / Chat / Research / Add Research**

- **Overview**: placeholder cards for daily/weekly/monthly active, total likes/comments/users (real numbers, no chart yet — chart deferred to Phase 2)
- **Users**: grid of user cards (username, email, country) → click opens user detail (bio + likes/comments made)
- **Research**: same grid layout as user dashboard, with edit/delete on each card
- **Add Research**: two-section form
  - *Section 1 (Homepage visibility)*: header image upload, title, description, category (Drugs/Disease/Discovery), research section
  - *Section 2 (Inside view)*: title + **basic rich text editor** (TipTap with bold/italic/underline/headings/lists/colors/image upload via link only) — full Word-clone editor with drag-resize, video embed, code↔WYSIWYG toggle, and dual desktop/mobile editing is deferred to Phase 3

### 5. Database (Lovable Cloud)
- `profiles` (id→auth.users, first_name, last_name, username, country, phone, avatar_url)
- `user_roles` (user_id, role enum: admin/user) + `has_role()` security definer function
- `research` (id, title, description, header_image_url, category, section, content_html, created_at, author_id)
- `likes` (user_id, research_id)
- `comments` (id, user_id, research_id, parent_comment_id nullable, content, created_at)
- `comment_likes` (user_id, comment_id)
- Storage buckets: `avatars` (public), `research-images` (public)
- RLS: users read all published research/comments; write only their own likes/comments/profile; admins full access via `has_role()`

### 6. Design system
Dark theme matching your reference: deep navy background (`oklch(0.13 0.05 270)`), magenta→cyan gradient primary, glassmorphism cards (`backdrop-blur` + translucent borders), Inter font. All colors as semantic tokens in `index.css` + Tailwind config — no hardcoded colors in components.

### 7. Routes
```text
/                  → marketing landing (redirects to /dashboard if logged in)
/auth              → login + signup tabs
/dashboard         → user dashboard
/research/$id      → research detail
/admin             → admin layout (with nested tabs)
  /admin/overview
  /admin/users
  /admin/users/$id
  /admin/chat       (Phase 2)
  /admin/research
  /admin/research/new
  /admin/research/$id/edit
```

---

## Phase 2 (next, after MVP works)
- Real-time private chat (user ↔ admin) via Supabase Realtime, floating chat button bottom-right of dashboard
- Admin chat tab with user grid + reply panel
- Notification badge with unread tracking (clears on visit)
- Overview bar chart (7-day daily users, Sun→Sat)
- Drill-down pages for daily/weekly/monthly active users
- AI semantic search via Lovable AI (embeddings stored per research, search scoped by active tab)

## Phase 3 (final polish)
- Full Microsoft Word–style editor: code↔WYSIWYG toggle, image/video upload + drag-resize + drag-align, font family/size/color/background controls
- Separate desktop/mobile content variants with auto-sync editor
- Per-comment threading & replies UI

---

## Technical notes
- TanStack Start (already scaffolded) + Lovable Cloud + TipTap for rich text + `react-select` for searchable country dropdown + `world-countries` data + Zod for validation
- All AI calls (Phase 2 search) go through a server function using `LOVABLE_API_KEY` — never client-side
- Auth state via `onAuthStateChange` listener set up before `getSession()` to avoid race conditions
- Every route with a loader gets `errorComponent` + `notFoundComponent`; root gets global 404; router gets `defaultErrorComponent`

After you approve, I'll implement Phase 1 end-to-end. We'll then test together before moving to Phase 2.
