import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /outfits  -> my outfit history
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT outfit_id, photo_url, worn_on
     FROM outfits
     WHERE user_id = ?
     ORDER BY worn_on DESC`,
    [req.userId]
  );
  res.json(rows);
});

// POST /outfits
// { photo_url, worn_on: 'YYYY-MM-DD', item_ids: [], share: true|false, caption }
router.post('/', async (req, res) => {
  const { photo_url, worn_on, item_ids = [], share = false, caption = null } = req.body;
  if (!photo_url || !worn_on) {
    return res.status(400).json({ error: 'A photo and the date worn are required' });
  }

  const outfitId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO outfits (user_id, photo_url, worn_on) VALUES (?, ?, ?)',
      [req.userId, photo_url, worn_on]
    );
    const id = result.insertId;

    // trg_outfit_items_owner rejects items this user doesn't own,
    // which rolls back the whole outfit
    for (const itemId of item_ids) {
      await conn.query('INSERT INTO outfit_items (outfit_id, item_id) VALUES (?, ?)', [id, itemId]);
    }

    if (share) {
      await conn.query('INSERT INTO posts (outfit_id, caption) VALUES (?, ?)', [id, caption]);
    }
    return id;
  });

  res.status(201).json({ outfit_id: outfitId });
});

export default router;
