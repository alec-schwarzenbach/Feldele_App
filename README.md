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

With no Firebase config the app runs in **demo mode**. Data is stored only in that browser, and you can sign in as Alec (owner), Maria, Thomas or Günther (car keeper) with the password `demo`.

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
- **Waiting for approval**: everyone who signs up. They see nothing until the owner approves them under Profile → Members.

Firebase enforces these rules too ([firestore.rules](firestore.rules), [storage.rules](storage.rules)), so they hold even outside the app.

## Connect the real backend (Firebase)

Firebase project: `feldele`.

1. Firebase console → **Build → Authentication → Get started** → enable **Email/Password**.
2. **Build → Firestore Database → Create database** (production mode, location `eur3` or a Europe region).
3. **Build → Storage → Get started** (photo uploads; needs the pay-as-you-go *Blaze* plan, usually €0 at this size; set a budget alert).
4. **Project settings → General → Your apps → Add app → Web (`</>`)**. Copy `apiKey` and `appId` into `.env.local` (see `.env.example`).
5. Deploy the security rules:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage
   ```
   (Or paste `firestore.rules` and `storage.rules` into the Rules tabs in the console.)
6. Restart `npm run dev` and create your account in the app. Then in **Firestore → profiles → (your document)** change `role` from `pending` to `owner`. After that you approve everyone else in the app.
7. Hosting (Vercel): add the same `VITE_FIREBASE_*` variables in the Vercel project settings, and add the Vercel domain under **Authentication → Settings → Authorized domains**.

$1

- `src/lib/api.ts`: backend interface. `localApi.ts` is the demo backend and `firebaseApi.ts` the real one.
- `src/lib/rules.ts`: cancellation rule, room and car clashes, cost split (`buildYearReport`).
- `src/pages/*`: one file per screen.
- `src/index.css`: all styling (mobile-first, light and dark).
