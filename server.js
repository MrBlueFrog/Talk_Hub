const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const https = require('https');
const fs = require('fs');
const profilRouter = require('./routes/profile');
const postsRouter = require('./routes/posts');
const userRouter = require('./routes/user');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',         
    database: 'talk_hub_db'  
});

db.connect(err => {
    if (err) {
        console.error('MySQL-Verbindungsfehler:', err);
    } else {
        console.log('MySQL verbunden!');
    }
});

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Static Files
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

// Session Setup (vor passport initialisieren)
app.use(session({
    secret: process.env.SESSION_SECRET || 'geheimesessionpasswort',
    resave: false,
    saveUninitialized: true
}));

// Passport initialisieren
app.use(passport.initialize());
app.use(passport.session());

// Passport Google Strategy konfigurieren
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI
  },
  function(accessToken, refreshToken, profile, done) {
    console.log('GoogleStrategy callback called!');
    console.log('Google profile:', profile);

    db.query(
      'SELECT * FROM users WHERE google_id = ?',
      [profile.id],
      (err, results) => {
        if (err) {
          console.error('DB error on SELECT:', err);
          return done(err);
        }

        if (results.length > 0) {
          console.log('User exists in DB:', results[0]);
          return done(null, results[0]);
        } else {
          console.log('User not found, inserting into DB...');
          db.query(
            'INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)',
            [profile.id, profile.emails[0].value, profile.displayName],
            (err, result) => {
              if (err) {
                console.error('DB error on INSERT:', err);
                return done(err);
              }
              console.log('User inserted with ID:', result.insertId);
              const newUser = {
                id: result.insertId,
                google_id: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName
              };
              return done(null, newUser);
            }
          );
        }
      }
    );
  }
));

// User serialisieren/deserialisieren
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Google Auth Routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Registration (force account chooser)
app.get('/auth/google/register', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Erfolgreich eingeloggt
    res.redirect('/');
  }
);

app.get('/', async (req, res) => {
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
    res.render('index', { user: req.user, posts, search, sort });
});

// Profil-Route
app.use('/profile', profilRouter);

// Post-Route
app.use('/posts', postsRouter);

// User-Route
app.use('/user', userRouter);

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

const sslOptions = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};

https.createServer(sslOptions, app).listen(port, () => {
  console.log(`HTTPS Server läuft auf https://localhost:${port}`);
});


