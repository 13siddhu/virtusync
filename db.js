// db.js
import pkg from 'pg';
import env from "dotenv";

const { Pool } = pkg;
env.config();

const pool = new pg.client({
  user: process.env.PG,
  host: 'localhost',
  database: 'authentication',
  password: '2@Siddhu',
  port: 5432,
});

export default pool;
