# Adding Queries to the Stitch Loop API

## How a request reaches the database

Every piece of data in the app comes from a SQL query that lives in an API route. The app never talks to MySQL directly. When a screen needs data, this happens:

1. The app calls the API, for example `api('/listings')` in `market.jsx`. That sends an HTTP request to the Express server.
2. Express matches the request to a route, such as `router.get('/')` in `routes/listings.js`.
3. The route runs a SQL query with `pool.query(sql, [values])`. `mysql2` sends it to MySQL.
4. MySQL runs the query and returns rows. `mysql2` turns each row into a JavaScript object.
5. The route sends the rows back with `res.json(rows)`, and the screen renders them.

So adding a feature usually means two things: write the SQL in a route, then call that route from a screen.

## Where things live

Each route file groups the endpoints for one part of the app. New queries go in the file that matches their feature.

| File | What it holds |
| --- | --- |
| `src/index.js` | Starts the server, connects each route file to a URL prefix, and turns database errors into readable responses |
| `src/db.js` | The connection `pool` and the `withTransaction` helper |
| `src/middleware/auth.js` | `requireAuth`, which checks the login token and sets `req.userId` |
| `src/routes/auth.js` | Register and log in (`/auth/...`) |
| `src/routes/items.js` | Wardrobe items and Bottom of the Closet (`/items/...`) |
| `src/routes/outfits.js` | Outfit photos and their tagged items (`/outfits/...`) |
| `src/routes/feed.js` | Following feed, likes, saves (`/feed`, `/posts/...`) |
| `src/routes/listings.js` | Marketplace, listing, purchasing (`/listings/...`) |
| `src/routes/users.js` | Stats, notifications, follows (`/users/...`) |
| `schema.sql` | Every table, trigger, view and the purchase procedure |

The prefix comes from `index.js`. A route written as `router.get('/bottom-of-closet')` inside `items.js` is reached at `/items/bottom-of-closet`.

## Adding a read route, step by step

This example adds an item detail endpoint, `GET /items/:id`, that returns one item with its wear stats, photos and tags. Every new read route follows the same four steps.

### 1. Write and test the query in Workbench first

Get the SQL right with real values before touching any JavaScript. Debugging SQL is much easier in Workbench than through the API.

```sql
SELECT i.item_id, i.item_name, i.brand, i.category, i.color, i.size,
       i.notes, i.purchase_price,
       s.wear_count, s.cost_per_wear, s.last_worn_on
FROM items i
JOIN item_wear_stats s ON s.item_id = i.item_id
WHERE i.item_id = 2 AND i.user_id = 2;
```

### 2. Swap the real values for `?` placeholders

Each value that comes from the request becomes a `?`. The values go in an array, in the same order as the `?` marks.

```sql
WHERE i.item_id = ? AND i.user_id = ?
```

### 3. Add the route to the matching file

Items belong in `routes/items.js`:

```js
// GET /items/:id  -> one of my items, with photos and tags
router.get('/:id', async (req, res) => {
  const [[item]] = await pool.query(
    `SELECT i.item_id, i.item_name, i.brand, i.category, i.color, i.size,
            i.notes, i.purchase_price,
            s.wear_count, s.cost_per_wear, s.last_worn_on
     FROM items i
     JOIN item_wear_stats s ON s.item_id = i.item_id
     WHERE i.item_id = ? AND i.user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const [images] = await pool.query(
    'SELECT image_url FROM item_images WHERE item_id = ? ORDER BY sort_order',
    [req.params.id]
  );
  const [tags] = await pool.query(
    `SELECT t.tag_name FROM item_tags it
     JOIN tags t ON t.tag_id = it.tag_id
     WHERE it.item_id = ?`,
    [req.params.id]
  );

  res.json({
    ...item,
    images: images.map((r) => r.image_url),
    tags: tags.map((r) => r.tag_name),
  });
});
```

A few things in that code are worth knowing:

- **`const [rows] = await pool.query(...)`** is the standard shape. `pool.query` returns two things, the rows and column info, and the brackets keep only the rows.
- **`const [[item]]`** goes one level deeper and takes just the first row. Use it when the query returns one row or none.
- **`req.params.id`** is the `:id` from the URL. **`req.userId`** is the logged-in user, set by `requireAuth`.
- **Route order matters.** Put `/:id` below `/bottom-of-closet` in the file. Express checks routes top to bottom, and `/:id` matches any word, so it would capture `bottom-of-closet` as an id.

### 4. Save and test

`npm run dev` restarts the server automatically when you save. Test the route with curl (see Testing a new route below), then use it from a screen.

## Adding a write route

Writes follow the same steps as reads. The differences are what comes back from `pool.query` and when you need a transaction.

### Single-statement writes

This edits an item's info for the "edit info" button. `COALESCE(?, column)` keeps the current value when a field isn't sent.

```js
// PATCH /items/:id  { item_name?, brand?, notes?, ... }
router.patch('/:id', async (req, res) => {
  const { item_name, brand, category, color, size, notes, purchase_price } = req.body;
  const [result] = await pool.query(
    `UPDATE items SET
       item_name = COALESCE(?, item_name), brand = COALESCE(?, brand),
       category = COALESCE(?, category), color = COALESCE(?, color),
       size = COALESCE(?, size), notes = COALESCE(?, notes),
       purchase_price = COALESCE(?, purchase_price)
     WHERE item_id = ? AND user_id = ?`,
    [item_name, brand, category, color, size, notes, purchase_price,
     req.params.id, req.userId]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});
```

For writes, `const [result]` holds a summary instead of rows:

- **`result.insertId`** is the new row's id after an INSERT. Send it back so the app can use it.
- **`result.affectedRows`** is how many rows changed. Zero usually means the row doesn't exist or belongs to someone else, so return a 404.

The `AND user_id = ?` in the WHERE clause is what stops one user from editing another user's items. Every write to user-owned data needs it.

### Multi-statement writes need a transaction

When one action changes several rows that must all succeed together, wrap them in `withTransaction`. If any statement throws, every change is undone. This replaces an item's tags:

```js
// PUT /items/:id/tags  { tags: ['vintage', 'summer'] }
router.put('/:id/tags', async (req, res) => {
  await withTransaction(async (conn) => {
    const [[item]] = await conn.query(
      'SELECT item_id FROM items WHERE item_id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!item) throw Object.assign(new Error('Item not found'), { status: 404 });

    await conn.query('DELETE FROM item_tags WHERE item_id = ?', [req.params.id]);
    for (const name of req.body.tags || []) {
      const [tag] = await conn.query(
        `INSERT INTO tags (tag_name) VALUES (?)
         ON DUPLICATE KEY UPDATE tag_id = LAST_INSERT_ID(tag_id)`,
        [name.trim().toLowerCase()]
      );
      await conn.query('INSERT INTO item_tags (item_id, tag_id) VALUES (?, ?)',
        [req.params.id, tag.insertId]);
    }
  });
  res.status(204).end();
});
```

Inside `withTransaction`, always use `conn.query`, never `pool.query`. `pool.query` runs on a different connection, outside the transaction, so it would not be rolled back.

The error handler in `index.js` doesn't yet read `err.status`, so the 404 above would come back as a 500. Add `if (err.status) return res.status(err.status).json({ error: err.message });` at the top of the handler to make thrown statuses work everywhere.

## Rules for every query

1. **Always use `?` placeholders.** Never build SQL by pasting values into the string, like `` `WHERE username = '${name}'` ``. That allows SQL injection, where a user types SQL into a form field and it runs. `mysql2` escapes placeholder values safely.
2. **Take the user's id from `req.userId`, never from the request body.** The body is whatever the app sends, so anyone could claim to be another user. `req.userId` comes from the verified login token.
3. **Scope user-owned data with `AND user_id = ?`.** This applies to every read and write of items, outfits, listings and settings.
4. **Write raw SQL, no ORM.** The SQL is what our class grades, so keep it visible in the route files.
5. **Use `withTransaction` and `conn.query` when one action changes more than one row.**
6. **Let database errors reach the error handler.** In Express 5, an error thrown in an `async` route goes to the handler in `index.js` automatically, so routes don't need try/catch. Only catch an error when you want a more specific message, like the "already listed" check in `listings.js`.
7. **Never use `SELECT *` in a route.** List the columns the screen needs. Otherwise new columns, including `password_hash`, can leak into responses.

The error handler already turns these database errors into readable responses:

| Database error | Response | Typical cause |
| --- | --- | --- |
| SQLSTATE `45000` | 400 with the trigger or procedure's message | A rule in a trigger or `purchase_listing` was broken |
| `ER_DUP_ENTRY` | 409 "That already exists" | A UNIQUE or primary key would be duplicated |
| `ER_NO_REFERENCED_ROW_2` | 400 | A foreign key points at a row that doesn't exist |
| Anything else | 500 "Server error" | Check the API terminal for the real error |

## When the logic belongs in the database

Most queries belong in a route. Some logic is better saved in MySQL itself, which also shows off database features in our writeup.

| Use a... | When | Example we already have |
| --- | --- | --- |
| Query in a route | The logic is used by one endpoint | The marketplace SELECT in `listings.js` |
| View | Several routes need the same calculated data | `item_wear_stats`, used by the wardrobe, stats and Bottom of the Closet |
| Trigger | A rule must hold no matter which route writes the data | `trg_listings_owner` blocks listing items you don't own |
| Stored procedure | Several statements must run together with locking and validation | `purchase_listing` |

A route can select from a view exactly like a table: `SELECT ... FROM item_wear_stats WHERE user_id = ?`.

### Changing the schema

`api/schema.sql` is the single source of truth, so every schema change goes in that file. But re-running the whole file drops every table and wipes the team's shared data. For an additive change, run only the new statement in Workbench, then add the same statement to `schema.sql`:

- **A new view:** `CREATE OR REPLACE VIEW ...`
- **A new column:** `ALTER TABLE items ADD COLUMN ...`, and add the column to its `CREATE TABLE` in `schema.sql` too
- **A new table:** its `CREATE TABLE`, plus a matching `DROP TABLE IF EXISTS` in the reset block at the top of `schema.sql`

Tell the team in the group chat before changing the schema, and commit `schema.sql` in the same commit as the route that needs the change. Triggers and procedures need the `DELIMITER $$` lines around them when you run them in Workbench, as in `schema.sql`.

## Calling the route from the app

Screens call the API through `api()` in `mobile/lib/api.js`. It adds the login token, sends JSON, and throws an `Error` with the API's message when the request fails.

```js
import { api } from '../../lib/api';

// Read
const item = await api(`/items/${itemId}`);

// Write
await api(`/items/${itemId}`, { method: 'PATCH', body: { notes: 'Runs small' } });
```

A screen usually loads data when it opens and shows an alert if something fails. `market.jsx` is the working example to copy:

```js
const [item, setItem] = useState(null);

useFocusEffect(useCallback(() => {
  api(`/items/${itemId}`)
    .then(setItem)
    .catch((err) => Alert.alert('Could not load this item', err.message));
}, [itemId]));
```

The `err.message` is the `error` text the API sent. A broken trigger rule, like "You can only list items you own", shows up in the alert word for word.

## Testing a new route

Test every route with curl before building its screen. That way, if the screen breaks, you know the problem is in the app. You need the tunnel and `npm run dev` running, as in the README.

Get a token for one of your test users:

```bash
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"yourname_seller@test.com","password":"pass123"}'
TOKEN=paste-the-token-here
```

Then call your route:

```bash
# A read
curl http://localhost:3000/items/2 -H "Authorization: Bearer $TOKEN"

# A write
curl -X PATCH http://localhost:3000/items/2 -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" -d '{"notes":"Runs small"}'
```

After a write, check the change in Workbench with a quick SELECT. Also test the failure cases: an id that doesn't exist, and another user's id. Both should return an error, not someone else's data.

### Checklist for a new route

- [ ] The query works in Workbench with real values
- [ ] Every request value is a `?` placeholder
- [ ] The user id comes from `req.userId`
- [ ] User-owned data is scoped with `AND user_id = ?`
- [ ] Multi-row writes use `withTransaction` and `conn.query`
- [ ] The route returns a 404 when nothing matched
- [ ] Tested with curl, including another user's id
- [ ] Any schema change is in `schema.sql` and the team knows

### Routes that already exist

Check this list before adding a route; what you need may already be there. Every route except `/auth` and `/health` needs a login token.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/auth/register` | Create a user and their settings row |
| POST | `/auth/login` | Log in and get a token |
| GET | `/items` | My wardrobe with wear counts and cost per wear |
| GET | `/items/bottom-of-closet` | My unworn items and days until auto-listing |
| POST | `/items` | Add an item with photos and tags |
| GET | `/outfits` | My outfit history |
| POST | `/outfits` | Add an outfit, tag its items, optionally post it |
| GET | `/feed` | Posts from people I follow, with like counts |
| GET | `/posts/:id/items` | The items tagged in a post and their prices if listed |
| POST / DELETE | `/posts/:id/like` | Like or unlike a post |
| POST / DELETE | `/posts/:id/save` | Save or unsave a post |
| GET | `/listings` | The marketplace, minus my own listings |
| POST | `/listings` | List one of my items |
| DELETE | `/listings/:id` | Take my listing down |
| POST | `/listings/:id/purchase` | Buy a listing (calls `purchase_listing`) |
| GET | `/users/me/stats` | Average cost per wear and items sold this month |
| GET | `/users/me/notifications` | My latest notifications |
| POST / DELETE | `/users/:id/follow` | Follow or unfollow a user |

The item detail, edit and tag routes in this guide are examples and aren't in the code yet. Whoever builds those screens should add them.
