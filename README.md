# Feldele

Feldele is a phone app for our shared hunting lodge. It covers stays, the fishing map, the info board, the car calendar and the yearly cost split.

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
| **Stays** | Book arrival/departure, number of people, rooms and an optional party/occasion. If the rooms are taken, you can book as **"maybe"**, which becomes confirmed automatically if the other stay is cancelled. |
| **Yearly priority** | The owner sets a rotation of families (repeats after the last). Every member of the priority family can take over dates another family booked; that stay becomes "maybe". They then have 4 weeks to cancel for free, after that it is binding. |
| **Cancelling** | Free unless someone else is affected: if someone is waiting ("maybe") for your rooms, it is free until 4 months before arrival, after that it counts toward your costs. "Maybe" stays are always free to cancel. |
| **Car** | Calendar of car bookings, tied to a stay or on their own. Every booking notifies the car owner, Günter Kobalt, and nobody else. |
| **Fishing** | Map of catches with species, length, weight, reason (starving / injured), bait, photo and date. Live GPS: the pin follows your position, or tap the map to set it by hand. |
| **Board** | Tips, trips, reviews and restaurants with star ratings, photos and comments. Authors can edit and delete their own posts. |
| **Costs & usage (admins only)** | For each year: what each family owes, with every member's stays, nights and person-nights. Costs are split by person-nights (1 person × 1 night = 1). Download as CSV for Excel or Google Sheets. |
| **Families** | Right after signing up, everyone must choose their family (or add it if it is missing) before they can use the app. Priority and costs are per family. Admins can rename families and move members between them. |
| **Settings (admin)** | Rooms, house name and location, free-cancellation months, currency. |

### Who sees what

- **Owner** (you): everything, and the only one who can make people admin or car keeper.
- **Admin**: everything except changing roles. Sees and edits rent, water, electricity and supplies, the cost per night and who owes what.
- **Member**: Home (upcoming stays and who's been there, without money), Stays (to book), Fishing, Car and Board.
- **Car owner** (Günter Kobalt): the only person who gets the car notifications. There can be only one.
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
