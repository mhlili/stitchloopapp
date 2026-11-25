import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// POST /auth/register  { username, email, password }
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // A user and their settings row are created together or not at all
  const userId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );
    await conn.query('INSERT INTO user_settings (user_id) VALUES (?)', [result.insertId]);
    return result.insertId;
  });

  res.status(201).json({ token: signToken(userId), userId });
});

// POST /auth/login  { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    'SELECT user_id, password_hash FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  res.json({ token: signToken(user.user_id), userId: user.user_id });
});

export default router;
