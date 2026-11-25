import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // return DECIMAL columns (prices) as JS numbers
  dateStrings: true,    // return DATE/DATETIME as strings instead of JS Date objects
});

// Runs several queries as one SQL transaction on a single connection.
// If anything throws, every change is rolled back.
export async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
