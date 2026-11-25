import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /items  -> my wardrobe, with cost-per-wear from the item_wear_stats view
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.item_id, s.item_name, s.purchase_price, s.wear_count, s.cost_per_wear,
            (SELECT img.image_url FROM item_images img
              WHERE img.item_id = s.item_id
              ORDER BY img.sort_order LIMIT 1) AS image_url,
            EXISTS (SELECT 1 FROM listings l
                     WHERE l.item_id = s.item_id AND l.status = 'active') AS is_listed
     FROM item_wear_stats s
     WHERE s.user_id = ?
     ORDER BY s.item_id DESC`,
    [req.userId]
  );
  res.json(rows);
});

// GET /items/bottom-of-closet  -> the warning screen
router.get('/bottom-of-closet', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM bottom_of_closet
     WHERE user_id = ?
     ORDER BY days_until_auto_list ASC`,
    [req.userId]
  );
  res.json(rows);
});

// POST /items
// { item_name, brand, category, color, size, notes, purchase_price, image_urls: [], tags: [] }
router.post('/', async (req, res) => {
  const {
    item_name, brand, category, color, size, notes, purchase_price,
    image_urls = [], tags = [],
  } = req.body;
  if (!item_name) return res.status(400).json({ error: 'Item name is required' });

  const itemId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      `INSERT INTO items (user_id, item_name, brand, category, color, size, notes, purchase_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, item_name, brand, category, color, size, notes, purchase_price]
    );
    const id = result.insertId;

    for (const [i, url] of image_urls.entries()) {
      await conn.query(
        'INSERT INTO item_images (item_id, image_url, sort_order) VALUES (?, ?, ?)',
        [id, url, i]
      );
    }

    for (const name of tags) {
      // Insert the tag if it's new; either way LAST_INSERT_ID() gives us its id
      const [tag] = await conn.query(
        `INSERT INTO tags (tag_name) VALUES (?)
         ON DUPLICATE KEY UPDATE tag_id = LAST_INSERT_ID(tag_id)`,
        [name.trim().toLowerCase()]
      );
      await conn.query('INSERT IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', [id, tag.insertId]);
    }
    return id;
  });

  res.status(201).json({ item_id: itemId });
});

export default router;
