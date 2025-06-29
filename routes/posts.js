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

// Alle Posts anzeigen (optional, if you want /posts)
router.get('/', async (req, res) => {
  const [posts] = await db.promise().query(
    `SELECT posts.id, posts.title, LEFT(posts.content, 120) AS summary, posts.erstellt_am, users.username,
       (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) AS likeCount
     FROM posts
     JOIN users ON posts.user_id = users.id
     ORDER BY posts.id DESC`
  );
  res.render('posts', { posts, user: req.user });
});

// Formular für neuen Post
router.get('/neu', auth, (req, res) => {
  res.render('post_form', { user: req.user, msg: null });
});

// Neuen Post speichern
router.post('/neu', auth, async (req, res) => {
  const title = sanitizeHtml(req.body.title, { allowedTags: [], allowedAttributes: {} }).trim();
  const content = sanitizeHtml(req.body.content, { allowedTags: [], allowedAttributes: {} }).trim();

  if (!title || !content) {
    return res.render('post_form', { user: req.user, msg: 'Titel und Inhalt dürfen nicht leer sein.' });
  }

  await db.promise().query(
    'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
    [req.user.id, title, content]
  );
  res.redirect('/');
});

// Einzelnen Post mit Kommentaren anzeigen
router.get('/:id', async (req, res) => {
  const [posts] = await db.promise().query(
    'SELECT posts.*, users.username FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id=?',
    [req.params.id]
  );
  if (!posts.length) return res.status(404).send('Post nicht gefunden.');

  // Like count for post
  const [likeCountRows] = await db.promise().query(
    'SELECT COUNT(*) AS likeCount FROM post_likes WHERE post_id = ?',
    [req.params.id]
  );
  const likeCount = likeCountRows[0].likeCount;

  // User liked post?
  let userLiked = false;
  if (req.user) {
    const [userLikeRows] = await db.promise().query(
      'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    userLiked = userLikeRows.length > 0;
  }

  // Load comments
  const [comments] = await db.promise().query(
    'SELECT kommentare.*, users.username FROM kommentare JOIN users ON kommentare.user_id = users.id WHERE post_id=? ORDER BY kommentare.erstellt_am ASC',
    [req.params.id]
  );

  // For each comment: like count and user liked
  for (const comment of comments) {
    // Like count
    const [likeRows] = await db.promise().query(
      'SELECT COUNT(*) AS likeCount FROM comment_likes WHERE comment_id = ?',
      [comment.id]
    );
    comment.likeCount = likeRows[0].likeCount;

    // User liked?
    if (req.user) {
      const [userLikeRows] = await db.promise().query(
        'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?',
        [comment.id, req.user.id]
      );
      comment.userLiked = userLikeRows.length > 0;
    } else {
      comment.userLiked = false;
    }
  }

  res.render('post_detail', { post: posts[0], comments, user: req.user, likeCount, userLiked });
});

// Kommentar hinzufügen (mit parent_id)
router.post('/:id/kommentieren', auth, async (req, res) => {
  const content = sanitizeHtml(req.body.content, { allowedTags: [], allowedAttributes: {} }).trim();
  const parent_id = req.body.parent_id || null;
  if (!content) return res.redirect(`/posts/${req.params.id}`);

  await db.promise().query(
    'INSERT INTO kommentare (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.id, content, parent_id]
  );
  res.redirect(`/posts/${req.params.id}`);
});

// Like hinzufügen (Post) - AJAX support
router.post('/:id/like', auth, async (req, res) => {
  await db.promise().query(
    'INSERT IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)',
    [req.user.id, req.params.id]
  );
  // Get new like count and status
  const [[{ likeCount }]] = await db.promise().query(
    'SELECT COUNT(*) AS likeCount FROM post_likes WHERE post_id = ?',
    [req.params.id]
  );
  const [[userLikedRow]] = await db.promise().query(
    'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.json({
      likeCount,
      userLiked: !!userLikedRow,
      nextUrl: `/posts/${req.params.id}/${userLikedRow ? 'unlike' : 'like'}`
    });
  }
  res.redirect(req.get('referer') || '/');
});

// Like entfernen (Post) - AJAX support
router.post('/:id/unlike', auth, async (req, res) => {
  await db.promise().query(
    'DELETE FROM post_likes WHERE user_id = ? AND post_id = ?',
    [req.user.id, req.params.id]
  );
  // Get new like count and status
  const [[{ likeCount }]] = await db.promise().query(
    'SELECT COUNT(*) AS likeCount FROM post_likes WHERE post_id = ?',
    [req.params.id]
  );
  const [[userLikedRow]] = await db.promise().query(
    'SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.json({
      likeCount,
      userLiked: !!userLikedRow,
      nextUrl: `/posts/${req.params.id}/${userLikedRow ? 'unlike' : 'like'}`
    });
  }
  res.redirect(req.get('referer') || '/');
});

// Like hinzufügen (Kommentar) - AJAX support
router.post('/:postId/comment/:commentId/like', auth, async (req, res) => {
  await db.promise().query(
    'INSERT IGNORE INTO comment_likes (user_id, comment_id) VALUES (?, ?)',
    [req.user.id, req.params.commentId]
  );
  // Get new like count and status
  const [[{ likeCount }]] = await db.promise().query(
    'SELECT COUNT(*) AS likeCount FROM comment_likes WHERE comment_id = ?',
    [req.params.commentId]
  );
  const [[userLikedRow]] = await db.promise().query(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?',
    [req.params.commentId, req.user.id]
  );
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.json({
      likeCount,
      userLiked: !!userLikedRow,
      nextUrl: `/posts/${req.params.postId}/comment/${req.params.commentId}/${userLikedRow ? 'unlike' : 'like'}`
    });
  }
  res.redirect(req.get('referer') || '/');
});

// Like entfernen (Kommentar) - AJAX support
router.post('/:postId/comment/:commentId/unlike', auth, async (req, res) => {
  await db.promise().query(
    'DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?',
    [req.user.id, req.params.commentId]
  );
  // Get new like count and status
  const [[{ likeCount }]] = await db.promise().query(
    'SELECT COUNT(*) AS likeCount FROM comment_likes WHERE comment_id = ?',
    [req.params.commentId]
  );
  const [[userLikedRow]] = await db.promise().query(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?',
    [req.params.commentId, req.user.id]
  );
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.json({
      likeCount,
      userLiked: !!userLikedRow,
      nextUrl: `/posts/${req.params.postId}/comment/${req.params.commentId}/${userLikedRow ? 'unlike' : 'like'}`
    });
  }
  res.redirect(req.get('referer') || '/');
});

module.exports = router;