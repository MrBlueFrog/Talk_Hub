# Talk Hub

A simple Node.js/Express forum with Google login, user profiles, posts, comments, likes, search, and sorting.

---

## Setup Instructions

### 1. Requirements

- Node.js (v18+ recommended)
- npm
- MySQL Server
- [Optional] OpenSSL (for HTTPS certificates)

---

### 2. Clone the Repository

```sh
git clone <your-repo-url>
cd Talk_Hub
```

---

### 3. Install Dependencies

```sh
npm install
```

---

### 4. Database Setup

- Import the provided `talk_hub_db.sql` file into your MySQL server using phpMyAdmin or the MySQL CLI.

---

### 5. Environment Variables

- Copy `.env.example` to `.env` and fill in your credentials:
  ```sh
  cp .env.example .env
  ```
- Set your Google OAuth credentials and session secret.
- Set your MySQL credentials.

---

### 6. HTTPS Certificates

- Generate self-signed certificates for local development:
  ```sh
  openssl req -nodes -new -x509 -keyout server.key -out server.cert
  ```
- Place `server.key` and `server.cert` in the project root.

---

### 7. Start the Server

```sh
node server.js
```
or
```sh
npm start
```

Visit [https://localhost:3000](https://localhost:3000) in your browser.

---

## Features

- Google OAuth login
- User profiles
- Create, search, and sort posts
- Comments with replies and likes
- Like system for posts and comments
- Responsive, modern UI

---

## Troubleshooting

- If you see database errors, check your `.env` DB credentials and that the database is imported.
- If HTTPS fails, check your certificate files.
- For Google login, make sure your OAuth credentials and redirect URI match your `.env` and Google Cloud Console.

---

## License

MIT