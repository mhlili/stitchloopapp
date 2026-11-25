import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /users/me/stats  -> the Stats screen
router.get('/me/stats', async (req, res) => {
  const [[cpw]] = await pool.query(
    `SELECT ROUND(AVG(cost_per_wear), 2) AS avg_cost_per_wear
     FROM item_wear_stats
     WHERE user_id = ? AND cost_per_wear IS NOT NULL`,
    [req.userId]
  );
  const [[sold]] = await pool.query(
    `SELECT COUNT(*) AS items_sold
     FROM transactions
     WHERE seller_id = ? AND purchased_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [req.userId]
  );
  res.json({ ...cpw, ...sold });
});

// GET /users/me/notifications
router.get('/me/notifications', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT notification_id, notification_type, message, is_read, created_at
     FROM notifications WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json(rows);
});

// POST /users/:id/follow, DELETE /users/:id/follow
// trg_follows_no_self blocks following yourself
router.post('/:id/follow', async (req, res) => {
  await pool.query(
    // ON DUPLICATE KEY (not INSERT IGNORE) so the trigger's self-follow error still comes through
    `INSERT INTO follows (follower_id, following_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE follower_id = follower_id`,
    [req.userId, req.params.id]
  );
  res.status(204).end();
});
router.delete('/:id/follow', async (req, res) => {
  await pool.query(
    'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
    [req.userId, req.params.id]
  );
  res.status(204).end();
});

export default router;
