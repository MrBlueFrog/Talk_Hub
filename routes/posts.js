const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Auth middleware
function auth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  res.redirect('/');
}

// List all posts with search and sort
router.get('/', async (req, res) => {
  const search = req.query.search || '';
  const sort = req.query.sort || 'recent';

  let where = '';
  let params = [];
  if (search) {
    where = `WHERE (posts.title LIKE ? OR posts.content LIKE ? OR users.username LIKE ?)`;
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }

  let order = '';
  if (sort === 'likes') {
    order = 'ORDER BY likeCount DESC, posts.id DESC';
  } else {
    order = 'ORDER BY posts.id DESC';
  }

  const [posts] = await db.promise().query(
    `SELECT posts.id, posts.title, LEFT(posts.content, 120) AS summary, posts.erstellt_am, users.username,
      (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) AS likeCount
     FROM posts
     JOIN users ON posts.user_id = users.id
     ${where}
     ${order}
     LIMIT 50`,
    params
  );
  res.render('posts', { posts, user: req.user, search, sort });
});

// New post form
router.get('/neu', auth, (req, res) => {
  res.render('post_form', { user: req.user, msg: null });
});

// Create new post
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

// Show single post with comments, comment sorting
router.get('/:id', async (req, res) => {
  const sort = req.query.sort || 'recent';

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

  // Load comments with sorting
  let order = '';
  if (sort === 'likes') {
    order = 'ORDER BY commentLikeCount DESC, kommentare.erstellt_am ASC';
  } else {
    order = 'ORDER BY kommentare.erstellt_am ASC';
  }
  const [comments] = await db.promise().query(
    `SELECT kommentare.*, users.username,
      (SELECT COUNT(*) FROM comment_likes WHERE comment_likes.comment_id = kommentare.id) AS commentLikeCount
     FROM kommentare
     JOIN users ON kommentare.user_id = users.id
     WHERE post_id=?
     ${order}`,
    [req.params.id]
  );

  // For each comment: like count and user liked
  for (const comment of comments) {
    comment.likeCount = comment.commentLikeCount || 0;
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

  res.render('post_detail', { post: posts[0], comments, user: req.user, likeCount, userLiked, sort });
});

// Add comment (with optional parent_id for replies)
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

// Like post (AJAX support)
router.post('/:id/like', auth, async (req, res) => {
  await db.promise().query(
    'INSERT IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)',
    [req.user.id, req.params.id]
  );
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

// Unlike post (AJAX support)
router.post('/:id/unlike', auth, async (req, res) => {
  await db.promise().query(
    'DELETE FROM post_likes WHERE user_id = ? AND post_id = ?',
    [req.user.id, req.params.id]
  );
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

// Like comment (AJAX support)
router.post('/:postId/comment/:commentId/like', auth, async (req, res) => {
  await db.promise().query(
    'INSERT IGNORE INTO comment_likes (user_id, comment_id) VALUES (?, ?)',
    [req.user.id, req.params.commentId]
  );
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

// Unlike comment (AJAX support)
router.post('/:postId/comment/:commentId/unlike', auth, async (req, res) => {
  await db.promise().query(
    'DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?',
    [req.user.id, req.params.commentId]
  );
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