import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /feed  -> posts from people I follow
router.get('/feed', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.post_id, p.caption, p.created_at,
            o.outfit_id, o.photo_url, o.worn_on,
            u.user_id, u.username, u.profile_photo_url,
            (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id) AS like_count,
            EXISTS (SELECT 1 FROM post_likes pl
                     WHERE pl.post_id = p.post_id AND pl.user_id = ?) AS liked_by_me,
            EXISTS (SELECT 1 FROM post_saves ps
                     WHERE ps.post_id = p.post_id AND ps.user_id = ?) AS saved_by_me
     FROM posts p
     JOIN outfits o ON o.outfit_id = p.outfit_id
     JOIN follows f ON f.following_id = o.user_id
     JOIN users u   ON u.user_id = o.user_id
     WHERE f.follower_id = ?
     ORDER BY p.created_at DESC
     LIMIT 50`,
    [req.userId, req.userId, req.userId]
  );
  res.json(rows);
});

// GET /posts/:id/items  -> the items tagged in a post's outfit, and whether each is for sale
router.get('/posts/:id/items', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT i.item_id, i.item_name, l.listing_id, l.price
     FROM posts p
     JOIN outfit_items oi ON oi.outfit_id = p.outfit_id
     JOIN items i         ON i.item_id = oi.item_id
     LEFT JOIN listings l ON l.item_id = i.item_id AND l.status = 'active'
     WHERE p.post_id = ?`,
    [req.params.id]
  );
  res.json(rows);
});

// Like / unlike, save / unsave
router.post('/posts/:id/like', async (req, res) => {
  await pool.query('INSERT IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)', [req.userId, req.params.id]);
  res.status(204).end();
});
router.delete('/posts/:id/like', async (req, res) => {
  await pool.query('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?', [req.userId, req.params.id]);
  res.status(204).end();
});
router.post('/posts/:id/save', async (req, res) => {
  await pool.query('INSERT IGNORE INTO post_saves (user_id, post_id) VALUES (?, ?)', [req.userId, req.params.id]);
  res.status(204).end();
});
router.delete('/posts/:id/save', async (req, res) => {
  await pool.query('DELETE FROM post_saves WHERE user_id = ? AND post_id = ?', [req.userId, req.params.id]);
  res.status(204).end();
});

export default router;
