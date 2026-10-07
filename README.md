# Lodge app

A phone app for our shared hunting lodge. It covers stays, the fishing map, the info board, the car calendar and the yearly cost split.

## Run it locally

```bash
npm install
npm run dev
```

- On this PC: http://localhost:5173
- On your phone (same Wi-Fi): the `Network:` address Vite prints, e.g. `http://192.168.x.x:5173`
- To put it on your home screen like an app: Safari → Share → "Add to Home Screen" (Android: Chrome menu → "Add to Home screen").

With no Supabase keys the app runs in **demo mode**. Data is stored only in that browser, and you can sign in as Alec (owner), Maria, Thomas or Günther (car keeper) with the password `demo`.

## Features

| Area | What it does |
|---|---|
| **Stays** | Book arrival/departure, number of people, rooms (with clash detection), an optional party/occasion. Free cancellation until N months before arrival (default 4). Later cancellations still count toward the cost split. |
| **Car** | Calendar of car bookings, which can be tied to a stay or made on their own. Every booking notifies the car keeper (Günther). |
| **Fishing** | Map of catches with species, length, weight, bait, photo and date. Filter by species. Tap the map or use GPS to set the spot. |
| **Board** | Tips, trips, reviews and restaurants with star ratings, photos and comments. Authors can edit and delete their own posts. |
| **Costs & usage (admins only)** | For each year: stays, nights, person-nights, parties hosted, share % and amount owed per member. Costs are split by person-nights (1 person × 1 night = 1). Download as CSV for Excel or Google Sheets. |
| **Settings (admin)** | Rooms, lodge name and location, free-cancellation months, currency. |

### Who sees what

- **Owner** (you): everything, and the only one who can make people admin or car keeper.
- **Admin**: everything except changing roles. Sees and edits rent, water, electricity and supplies, the cost per night and who owes what.
- **Member**: Home (upcoming stays and who's been there, without money), Stays (to book), Fishing, Car and Board.
- **Car keeper** (Günther): the only person who gets the car notifications. There can be only one.

The database enforces these rules too, so they hold even outside the app.

## Connect the real backend (Supabase)

1. Create a free project at https://supabase.com.
2. SQL Editor → New query → paste [supabase/schema.sql](supabase/schema.sql) → Run.
3. Project Settings → API: copy the URL and the anon key into a new file `.env.local` (see `.env.example`).
4. Restart `npm run dev`. Create your account in the app, then run in the SQL editor:
   ```sql
   update profiles set role = 'owner' where email = 'you@example.com';
   update profiles set role = 'car_keeper' where email = 'guenther@example.com';
   ```
5. Optional: Authentication → Providers → Email → turn off "Confirm email" so new members can sign in straight away.

## Code map

- `src/lib/api.ts`: backend interface. `localApi.ts` is the demo backend and `supabaseApi.ts` the real one.
- `src/lib/rules.ts`: cancellation rule, room and car clashes, cost split (`buildYearReport`).
- `src/pages/*`: one file per screen.
- `src/index.css`: all styling (mobile-first, light and dark).
