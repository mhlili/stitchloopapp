import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import outfitRoutes from './routes/outfits.js';
import feedRoutes from './routes/feed.js';
import listingRoutes from './routes/listings.js';
import userRoutes from './routes/users.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/items', itemRoutes);
app.use('/outfits', outfitRoutes);
app.use('/', feedRoutes);        // /feed, /posts/:id/like, /posts/:id/save
app.use('/listings', listingRoutes);
app.use('/users', userRoutes);

// Express 5 forwards errors from async route handlers here automatically.
app.use((err, req, res, next) => {
  // SIGNAL SQLSTATE '45000' from our triggers and purchase_listing procedure
  if (err.sqlState === '45000') {
    return res.status(400).json({ error: err.sqlMessage });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'That already exists' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'Something this refers to does not exist' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on port ${port}`));
