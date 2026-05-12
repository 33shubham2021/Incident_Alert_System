require('dotenv').config();
const express = require('express');
const cors = require('cors');
const alertRoutes = require('./routes/alertRoutes');
const schedulerService = require('./services/schedulerService');

const app = express();

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5500',
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

app.use('/api', alertRoutes);

schedulerService.start();

const PORT = process.env.PORT || 5051;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

module.exports = app;
