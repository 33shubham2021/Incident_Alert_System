// Production server.js – replaces api_server/server.js at Docker build time.
// Only change from dev: adds https://test.rohitaman.com to ALLOWED_ORIGINS.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const alertRoutes = require('./routes/alertRoutes');
const schedulerService = require('./services/schedulerService');
const { connectRedis } = require('./config/redisClient');
const kafkaProducer = require('./kafka/producer');
const kafkaConsumer = require('./kafka/consumer');

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

app.use('/api', alertRoutes);

async function bootstrap() {
  try {
    await connectRedis();
    console.log('[Server] Redis connection established');
  } catch (err) {
    console.error('[Server] Redis connection failed (continuing without Redis):', err.message);
  }

  try {
    await kafkaProducer.connect();
    console.log('[Server] Kafka producer ready');
  } catch (err) {
    console.error('[Server] Kafka producer connection failed (continuing without Kafka producer):', err.message);
  }

  try {
    await kafkaConsumer.start();
    console.log('[Server] Kafka consumer started');
  } catch (err) {
    console.error('[Server] Kafka consumer failed to start (continuing without Kafka consumer):', err.message);
  }

  schedulerService.start();

  const PORT = process.env.PORT || 5051;
  app.listen(PORT, () => {
    console.log(`[Server] API server running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal bootstrap error:', err);
  process.exit(1);
});

module.exports = app;
