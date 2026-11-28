# Stitch Loop

A wardrobe and secondhand marketplace app for our database design class. Users log their clothes, post outfits tagged with the items they wore, follow each other, and buy items from each other.

This guide gets you from a fresh clone to a working setup, then walks through a test that proves every part is connected.

## How the pieces fit together

```
Phone (Expo Go)  →  Express API  →  MySQL database on Railway
                    (api/ folder)    (shared by the whole team)
```

- `api/` is the Express server. It runs on your laptop during development.
- `mobile/` is the Expo app. It runs on your phone through the Expo Go app.
- The database lives on Railway. There is **one shared database** for the whole team, so you don't create your own Railway project.
- Your laptop reaches the database through a tunnel opened by the Railway CLI. The database has no public address, which keeps it private and avoids extra charges.

## What to install first

On your computer (not inside the repo):

- [Node.js](https://nodejs.org) (version 20 or newer). Check with `node -v`.
- Git, plus access to our GitHub repo.
- [MySQL Workbench](https://dev.mysql.com/downloads/workbench/), for looking at the data.
- The Railway CLI: `npm install -g @railway/cli` (or `brew install railway` on a Mac).

On your phone:

- **Expo Go**, from the App Store or Google Play. Keep it updated, because it only runs the latest Expo version.

You also need a Railway account. The invite link was already sent, but here it is again if needed: https://railway.com/invite/Y51QNn7ay26

## Setup (one time)

### 1. Clone and install
Clone the Github repo however you know how to. Then make sure to run npm install in the api folder and the mobile folder of the repo to get all the necessary packages.

```bash
git clone <our-repo-url>
cd stitchloopapp

cd api && npm install && cd ..
cd mobile && npm install && cd ..
```

Run `npm install` inside each folder. Running it from the repo root installs nothing useful.

### 2. Link the Railway CLI to our project
MAKE SURE YOU'VE JOINED THE PROJECT WITH THE INVITE LINK

From the repo root:

```bash
railway login     # opens your browser to sign in
railway link      # pick the Stitch Loop project
```

### 3. Create your .env files

Each folder has a `.env.example`. Copy it to `.env` and fill it in. These files are hidden because their names start with a dot; use `ls -a` to see them, or Cmd + Shift + . in Finder.

```bash
cp api/.env.example api/.env
cp mobile/.env.example mobile/.env
```

**`api/.env`:**

```
DATABASE_URL=mysql://root:PASSWORD@127.0.0.1:33061/railway
JWT_SECRET=ask-a-teammate
PORT=3000
```

- Get the `PASSWORD` from the tunnel output in the next section.
- Everyone must use the **same** `JWT_SECRET`. It is currently in our CS3200 Notes document under IMPORTANT. Otherwise message Maggie for the secret. Never post it in the repo or a public chat.

**`mobile/.env`:**

```
EXPO_PUBLIC_API_URL=http://YOUR-LAPTOP-IP:3000
```

Find your laptop's IP with `ipconfig getifaddr en0` (Mac). Use that number, never `localhost`, because `localhost` on your phone means the phone itself.

Never commit either `.env` file. Run `git status` before committing and make sure no `.env` appears. It should currently be configured to ignore .env in git commits.

## Every time you work on the project

You'll want three terminal windows open, all starting from the repo root.

**Terminal 1: the database tunnel**

```bash
railway connect MySQL --tunnel-only --port 33061
```

This prints the connection details (host, port, user, password) and holds the tunnel open. Leave this window running. Closing it or pressing Ctrl+C closes the tunnel, and the API loses its database connection.

**Terminal 2: the API**

```bash
cd api
npm run dev
```

You should see `API listening on port 3000`. Server errors appear here, so check this window first when something goes wrong.

**Terminal 3: the app**

```bash
cd mobile
npx expo start
```

Scan the QR code with your phone's camera (iPhone) or from inside Expo Go (Android). Your phone and laptop must be on the same Wi-Fi.

If you edit `mobile/.env`, stop Expo and start it again. If the old value still seems stuck, run `npx expo start -c` to clear the cache.

## Connecting MySQL Workbench

With the tunnel open, create a new connection in Workbench:

- Hostname: `127.0.0.1`
- Port: `33061`
- Username: `root`
- Password: the one the tunnel printed (click "Store in Keychain")
- Default Schema: `railway`

Workbench will warn that the server version (8.4) is newer than it was tested with. Click **Continue Anyway**; everything we need works fine.

## Testing that everything works

Work through these in order. Each step tests one more piece.

### Step 1: The database has our schema

In Workbench:

```sql
SHOW FULL TABLES;
SHOW TRIGGERS;
SHOW PROCEDURE STATUS WHERE Db = 'railway';
```

You should see 15 base tables and 2 views, 3 triggers, and the `purchase_listing` procedure.

### Step 2: The API is running

```bash
curl http://localhost:3000/health
```

Expected: `{"ok":true}`.

### Step 3: Create your own test users

The database is shared, so use your own name in the emails to avoid clashing with teammates' test users:

```bash
curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"username":"yourname_seller","email":"yourname_seller@test.com","password":"pass123"}'

curl -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"username":"yourname_buyer","email":"yourname_buyer@test.com","password":"pass123"}'
```

Each returns a `token` and a `userId`. If you get `"That already exists"`, that username or email is taken; pick another.

### Step 4: Log in as the seller and list an item

To avoid mixing up tokens, get the seller's token from a fresh login and check the `userId`:

```bash
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"yourname_seller@test.com","password":"pass123"}'
```

Copy the token from the response, then:

```bash
SELLER=paste-the-seller-token-here

curl -X POST http://localhost:3000/items -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SELLER" \
  -d '{"item_name":"Test Dress","purchase_price":15}'
```

This returns `{"item_id":N}`. Use **that** number in the next command:

```bash
curl -X POST http://localhost:3000/listings -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SELLER" -d '{"item_id":N,"price":10}'
```

Expected: `{"listing_id":...}`. If you get "You can only list items you own", the `item_id` is wrong or the token belongs to a different user.

A `%` at the end of curl output is just your terminal noting a missing newline, not an error.

### Step 5: Phone can reach the API

Open Safari (or Chrome) on your phone and go to `http://YOUR-LAPTOP-IP:3000/health`.

- `{"ok":true}`: good, continue.
- The page never loads: the Wi-Fi is blocking phone-to-laptop connections, which is common on school networks. Try your phone's hotspot or home Wi-Fi. See Troubleshooting.

### Step 6: Buy the item in the app

1. In the app, log in as **`yourname_buyer@test.com`**.
2. Open the community tab (the people icon).
3. Your test item should appear. Tap it and confirm the purchase.

The market hides your own listings, so if you log in as the seller, the item won't show. That's intentional.

### Step 7: Check the purchase in the database

In Workbench:

```sql
SELECT * FROM transactions ORDER BY transaction_id DESC LIMIT 5;
SELECT item_id, user_id, purchase_price FROM items ORDER BY item_id DESC LIMIT 5;
SELECT * FROM notifications ORDER BY notification_id DESC LIMIT 5;
```

You should see a new transaction, the item's `user_id` now set to your buyer's id with `purchase_price` 10, and two new notifications (one for each user).

### Step 8: The database rejects a double purchase

Log in as the buyer with curl to get their token, then try to buy the same listing again:

```bash
curl -X POST http://localhost:3000/listings/LISTING_ID/purchase \
  -H "Authorization: Bearer BUYER_TOKEN"
```

Expected: `{"error":"Listing is no longer available"}`. This comes from the `purchase_listing` stored procedure, so it proves the database itself is protecting the data.

If all eight steps pass, your setup is fully working.

## Troubleshooting

**`Cannot find package 'dotenv'` (or any package)**: you haven't run `npm install` in that folder. Run it inside `api/` or `mobile/`, not the repo root.

**Workbench can't connect to `mysql.railway.internal`**: that's Railway's private address, which only works for services inside Railway. Use `127.0.0.1` and port `33061` with the tunnel open.

**The tunnel command fails**: update the CLI with `npm install -g @railway/cli`, then run `railway login` and `railway link` again. You may also need an SSH key added to your Railway account.

**API says "Server error"**: the real error is printed in Terminal 2. Most often, the tunnel was closed.

**App shows "Could not load the market"**: the phone can't reach the API. Check that the tunnel and API are running, that `mobile/.env` has your current laptop IP (it can change when you switch networks), that you restarted Expo after editing it, and that Step 5 passes.

**Your IP starts with `100.64`**: some campus and apartment networks use these addresses and block phone-to-laptop connections. Use a hotspot or another Wi-Fi network.

**Market is empty when it shouldn't be**: you're probably logged in as the item's owner. Check in Workbench that the listing's `user_id` is a different user, and that its `status` is `active`.

## Working on a shared database

Everyone's test data lands in the same database, so:

- Use your own name in test usernames and emails.
- Don't delete or edit other people's test data.
- **Don't re-run `api/schema.sql` without telling the team.** It drops and recreates every table, which wipes everyone's data.
- If you change the schema, update `api/schema.sql` in the repo so it stays the single source of truth, and tell the team before running it.

To remove your own bad test data, delete listings before items (MySQL won't delete an item that still has a listing):

```sql
DELETE FROM listings WHERE listing_id = 1;
DELETE FROM items WHERE item_id = 1;
```