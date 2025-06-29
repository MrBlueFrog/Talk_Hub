const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
require('dotenv').config();

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Show public profile by username
router.get('/:username', async (req, res) => {
  const [rows] = await db.promise().query(
    'SELECT username, beschreibung FROM users WHERE username = ?', [req.params.username]
  );
  if (!rows.length) {
    return res.status(404).render('user_not_found', { username: req.params.username });
  }
  res.render('profile_details', { profil: rows[0] });
});

module.exports = router;