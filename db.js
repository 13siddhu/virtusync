// db.js
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'authentication',
  password: '2@Siddhu',
  port: 5432,
});

export default pool;
