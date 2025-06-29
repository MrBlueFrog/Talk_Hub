const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const sanitizeHtml = require('sanitize-html');
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'talk_hub_db'
});

// Auth middleware
function auth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.redirect('/');
}

// Profil anzeigen
router.get('/', auth, async (req, res) => {
  const [rows] = await db.promise().query('SELECT username, beschreibung FROM users WHERE id=?', [req.user.id]);
  res.render('profile', { user: req.user, profil: rows[0], msg: null });
});

// Profil speichern
router.post('/', auth, async (req, res) => {
  // Sanitize input
  const username = sanitizeHtml(req.body.username, { allowedTags: [], allowedAttributes: {} }).trim();
  const beschreibung = sanitizeHtml(req.body.beschreibung, { allowedTags: [], allowedAttributes: {} }).trim();

  if (!username || username.length < 3) {
    return res.render('profile', { user: req.user, profil: { username, beschreibung }, msg: 'Benutzername zu kurz.' });
  }

  const [dupes] = await db.promise().query('SELECT id FROM users WHERE username=? AND id<>?', [username, req.user.id]);
  if (dupes.length) {
    return res.render('profile', { user: req.user, profil: { username, beschreibung }, msg: 'Benutzername bereits vergeben.' });
  }

  await db.promise().query(
    'UPDATE users SET username=?, beschreibung=? WHERE id=?',
    [username, beschreibung, req.user.id]
  );

  req.user.username = username;
  req.user.beschreibung = beschreibung;

  res.redirect('/profile');
});

module.exports = router;