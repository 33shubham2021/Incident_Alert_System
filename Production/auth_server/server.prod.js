// Production server.js – replaces auth_server/server.js at Docker build time.
// Only change from dev: adds https://test.rohitaman.com to ALLOWED_ORIGINS.

require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const cors = require('cors');

const app = express();

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5500',
  'https://test.rohitaman.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json());

app.use('/auth', authRoutes);

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});

module.exports = app;
