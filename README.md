# Memory Capsule

*Our little memory space.* A private memory journal for two people: photos, videos, stories, and milestones, kept behind row level security.

## What's built

- Sign up, email verification, sign in, sign out, forgot and reset password
- Onboarding: display name, shared space with a name and start date
- Add your lover by username: search for someone, send a request, and they accept or decline (like a friend request). Accepting joins them to your space (`0006_lover_requests.sql`)
- Two-member limit and one-space-per-person rule enforced in the database
- Dashboard: live days-together counter, memory of the day, recent memories, next anniversary
- Memories: create, edit, favorite, view, delete; photo and video upload to private storage
- Gallery: search, category filter, favorites, newest or oldest, paginated
- Bucket list: a shared list of dreams and goals. Tick them off together, optionally linking the memory that marks the moment. The partner is notified (`0009_bucket_reactions_comments.sql`)
- Reactions and comments on memories: six reaction types, one per person each, and comments (not editable; authors can delete their own). Both update live, and the partner is notified of new comments (`0009_bucket_reactions_comments.sql`)
- Messages: Messenger-style private chat for the two people in a space: chat list with profile picture, username, latest message and unread badge; realtime messages; date and time stamps; online status and typing indicator (Supabase Presence, no extra tables); Sending / Sent / Delivered / Seen; emoji picker; search for people and messages; delete conversation (clears it for you only); unsend; responsive two-pane layout on tablet and desktop, list and chat screens on phones (`0005_messages.sql`, `0011_message_status_and_delete_conversation.sql`)
- Row level security on every table, private storage buckets, and no service-role key in the browser

## Not yet built

Albums, calendar, timeline, love letters, time capsules, notifications, and the settings page are part of the full brief and still need implementing. The schema for them is not in the migrations yet.

## Who can use the app

Only two accounts may use this space: `rectojustine84@gmail.com` and `gucelamary21@gmail.com`. Every other address is refused at sign-in, sign-up, and password reset, with a message explaining why.

This is enforced in two places:

- **The app** (`src/lib/access.ts`) checks the list before any request is sent, and signs out any other session.
- **The database** (`supabase/migrations/0007_allowed_emails.sql`) refuses to create or change an account to an address outside the `allowed_emails` table.

To change who can join, update both places. Accounts that already exist with other addresses are not deleted by the migration. Remove them under **Authentication → Users** in the Supabase dashboard.

## Stack

React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form with Zod, Framer Motion, Font Awesome, and Supabase (Auth, Postgres, Storage).

## 1. Install

```bash
npm install
cp .env.example .env.local
```

## 2. Create the Supabase project

1. Create a project at https://supabase.com.
2. In **Project Settings → API**, copy the project URL and the `anon` public key into `.env.local`:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

   Never put the `service_role` key in this project.

3. Apply the migrations, in order. Either paste each file into **SQL Editor** and run it, or use the CLI:

   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```

   `0001_core_schema.sql` creates the tables, triggers, RLS policies, and RPC functions. `0002_storage.sql` creates the private buckets and their access policies. `0005_messages.sql` adds chat: RLS so only the two members can read a conversation, senders limited to sending as themselves, a guard trigger so the sender can only unsend and the recipient can only mark as read, and no client-side deletes.

4. Configure **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173` for local development, then your Vercel URL in production.
   - Redirect URLs: add `http://localhost:5173/**` and `https://your-app.vercel.app/**`.

5. Under **Authentication → Providers → Email**, keep "Confirm email" enabled so new accounts verify their address.

## 3. Run locally

```bash
npm run dev
```

Open http://localhost:5173. Sign up with two email addresses to test the add-lover flow: set a username on each account, create the space with the first account, search the second account's username, send the request, and accept it while signed in as the second account.

## 4. Test the security rules

After the migrations, confirm that an account outside a space cannot read its content. In the SQL editor, impersonate a user and query a memory from a space they don't belong to. The query should return no rows.

## 5. Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel, import the repository. The framework preset is **Vite**; the default build command `npm run build` and output directory `dist` are correct.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**.
4. `vercel.json` rewrites all paths to `index.html` so deep links such as `/memories/:id` work on refresh.
5. Add the production URL to the Supabase redirect URLs (step 2.4).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build for production |
| `npm run typecheck` | Type-check only |
| `npm run preview` | Preview the production build |
