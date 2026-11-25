# Stitch Loop

A school project for a database design class: a wardrobe app where users log their clothes, photograph outfits and tag the items they wore, track cost-per-wear, follow other users' outfit posts, and buy secondhand items from each other in a marketplace. The database design is the graded centerpiece, so favor clear, explainable SQL over clever abstractions.

## Repo layout

- `api/` Express 5 REST API (Node, ES modules), deployed on Railway
- `api/schema.sql` the full MySQL 8 schema: tables, triggers, views, the purchase procedure
- `mobile/` Expo app (Expo Router, JavaScript `.jsx` files), run in Expo Go
- `mobile/src/app/` screens (Expo Router's routes folder; nothing but routes goes here); `mobile/src/lib/` shared helpers

## Commands

- API: `cd api && npm install && npm run dev` (port 3000, `node --watch`)
- App: `cd mobile && npx expo start` (scan the QR code with Expo Go; use `--tunnel` on networks that block device-to-device traffic)
- Schema: run `api/schema.sql` in MySQL Workbench or the `mysql` CLI against Railway's public connection. It drops and recreates everything, so it's safe to re-run but wipes data. It uses `DELIMITER`, so it can't be run through `mysql2`.

## Environment

- `api/.env`: `DATABASE_URL` (Railway `MYSQL_PUBLIC_URL` locally; `${{MySQL.MYSQL_URL}}` private URL on Railway), `JWT_SECRET`, `PORT` (Railway sets it in production)
- `mobile/.env`: `EXPO_PUBLIC_API_URL` (Railway API domain, or the laptop's LAN IP like `http://192.168.x.x:3000`, never `localhost`), `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (unsigned preset)
- Never commit `.env` files; keep `.env.example` files up to date when adding variables. Restart Expo after editing `mobile/.env`.

## Architecture

- Phone (Expo Go) -> Express API on Railway -> MySQL on Railway over the private network
- Images are uploaded from the phone straight to Cloudinary (`mobile/src/lib/upload.js`); only the returned URL is stored in MySQL. Never store image data in the database.
- Auth: bcryptjs password hashes, JWT in an `Authorization: Bearer` header, token kept in `expo-secure-store`. `requireAuth` middleware sets `req.userId`.
- The app must keep working in Expo Go: don't add libraries that need custom native code or a development build.

## API conventions

- Raw SQL with `mysql2/promise` and `?` placeholders only, never string-built queries. No ORM: showing the SQL is the point of the class.
- Multi-statement writes go through `withTransaction(conn => ...)` in `api/src/db.js`.
- Express 5 forwards async errors to the handler in `api/src/index.js`, which maps `SQLSTATE 45000` (our triggers and procedure) to 400 with `err.sqlMessage`, `ER_DUP_ENTRY` to 409.
- Enforce business rules in the database where reasonable (constraints, triggers), and keep route handlers thin.

## Data model decisions (keep these unless asked to change them)

- `items.user_id` is the CURRENT owner and changes when an item is bought. Because of that, `listings.user_id` (seller at listing time) and `transactions.seller_id` / `buyer_id` are intentionally stored, not redundant.
- An item is "for sale" when it has an active listing. There is no `items.status` column. A generated column `listings.active_item_id` with a unique index allows only one active listing per item.
- Purchases happen only through the stored procedure `CALL purchase_listing(listing_id, buyer_id)`: it locks the listing (`FOR UPDATE`), validates, logs the transaction, marks the listing sold, transfers ownership (sets `purchase_price` to the sale price and `acquired_at` to now), and notifies both users, all atomically. `transactions.listing_id` is UNIQUE.
- Cost-per-wear and "Bottom of the Closet" come from the views `item_wear_stats` and `bottom_of_closet`. Wear counts are derived from `outfit_items` joined to `outfits`, only counting the current owner's wears since `acquired_at`. Never store a wear count.
- `posts` has no `user_id`; the author comes from `posts.outfit_id -> outfits.user_id`. An outfit is posted at most once.
- Triggers enforce: no self-follows, outfits can only be tagged with items the user owns, users can only list items they own. (Self-follow is a trigger, not a CHECK, because MySQL disallows CHECK on columns with `ON DELETE CASCADE`.)
- Money is `DECIMAL(10,2)`; the pool uses `decimalNumbers: true` so prices arrive as JS numbers.
- Commerce tables (`listings`, `transactions`) use RESTRICT on delete so sales history can't be erased.

## Scope

In scope: accounts, wardrobe (items with photos, tags, notes, purchase price), outfits (one photo + tagged items + date worn), a following feed (one-directional follows), likes and saves, listings and the marketplace, simulated purchases, notifications, the stats screen, Bottom of the Closet.

Out of scope, don't build unless asked: scrapbook/decorated outfits, offers, trades, donations, mutual follows or friend requests, real payments or storing card numbers, NFC (would need a development build).

## Open questions

- What price an item gets when auto-listed from Bottom of the Closet (`listings.price` is NOT NULL). Auto-listing itself would run as a scheduled job in Express, not a MySQL event.
