require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const cors = require("cors");

const app = express();

const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // Vite dev server
  'http://127.0.0.1:5173',
  'http://localhost:4173',   // Vite preview
  'http://127.0.0.1:5500',  // VS Code Live Server (legacy)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});

module.exports = app;