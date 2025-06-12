const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// Static Files
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));

// Session Setup
app.use(session({
    secret: 'geheimesessionpasswort',
    resave: false,
    saveUninitialized: true
}));

// MySQL Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',         // dein Passwort hier
    database: 'talk_hub_db'  // der Name deiner Datenbank
});

db.connect(err => {
    if (err) {
        console.error('MySQL-Verbindungsfehler:', err);
    } else {
        console.log('MySQL verbunden!');
    }
});

// Beispiel-Route
app.get('/', (req, res) => {
    res.render('index');  // sucht nach views/index.ejs
});

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
});