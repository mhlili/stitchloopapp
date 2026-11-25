import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /listings  -> the marketplace (everyone's active listings except mine)
router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.listing_id, l.price, l.listed_at,
            i.item_id, i.item_name, i.brand, i.size,
            u.username AS seller,
            (SELECT img.image_url FROM item_images img
              WHERE img.item_id = i.item_id
              ORDER BY img.sort_order LIMIT 1) AS image_url
     FROM listings l
     JOIN items i ON i.item_id = l.item_id
     JOIN users u ON u.user_id = l.user_id
     WHERE l.status = 'active' AND l.user_id <> ?
     ORDER BY l.listed_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

// POST /listings  { item_id, price }
// trg_listings_owner rejects items I don't own; the unique index rejects double-listing
router.post('/', async (req, res) => {
  const { item_id, price } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO listings (item_id, user_id, price) VALUES (?, ?, ?)',
      [item_id, req.userId, price]
    );
    res.status(201).json({ listing_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This item is already listed' });
    }
    throw err;
  }
});

// DELETE /listings/:id  -> take my listing down
router.delete('/:id', async (req, res) => {
  const [result] = await pool.query(
    `UPDATE listings SET status = 'cancelled'
     WHERE listing_id = ? AND user_id = ? AND status = 'active'`,
    [req.params.id, req.userId]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'No active listing of yours with that id' });
  }
  res.status(204).end();
});

// POST /listings/:id/purchase  -> the whole purchase runs inside the stored procedure
router.post('/:id/purchase', async (req, res) => {
  await pool.query('CALL purchase_listing(?, ?)', [req.params.id, req.userId]);
  res.json({ ok: true });
});

export default router;
