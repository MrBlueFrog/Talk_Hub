const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'talk_hub_db'
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