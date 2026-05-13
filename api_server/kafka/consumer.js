const { Kafka } = require('kafkajs');
const redisRepository = require('../repositories/redisRepository');
const smsService = require('../services/smsService');

const kafka = new Kafka({
  clientId: `${process.env.KAFKA_CLIENT_ID || 'api-server'}-consumer`,
  brokers: [(process.env.KAFKA_BROKER || 'localhost:9092')],
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'alert-consumer-group',
});

// Max radius (km) to search for subscriptions; individual subscription distance is checked after
const MAX_GEO_SEARCH_RADIUS_KM = 500;

const processAlert = async (alert) => {
  console.log(`[Kafka Consumer] Processing alert id=${alert.id} type=${alert.alertType} lat=${alert.latitude} lon=${alert.longitude}`);

  const nearbyResults = await redisRepository.getNearbySubscriptions(
    alert.latitude,
    alert.longitude,
    MAX_GEO_SEARCH_RADIUS_KM
  );

  console.log(`[Kafka Consumer] Found ${nearbyResults.length} candidate subscription(s) within ${MAX_GEO_SEARCH_RADIUS_KM}km`);

  if (nearbyResults.length === 0) return;

  // Resolve distance preference for each subscription and deduplicate mobile numbers
  const mobileNumbers = new Set();

  for (const result of nearbyResults) {
    const { member, distanceKm } = result;
    const subscriptionDistance = await redisRepository.getSubscriptionDistance(member);

    console.log(`[Kafka Consumer] Subscription "${member}" is ${distanceKm.toFixed(2)}km away, configured distance=${subscriptionDistance}km`);

    if (distanceKm <= subscriptionDistance) {
      const mobileNumber = redisRepository.parseMobileFromMember(member);
      if (mobileNumber) {
        mobileNumbers.add(mobileNumber);
        console.log(`[Kafka Consumer] Mobile ${mobileNumber} qualifies for alert id=${alert.id}`);
      }
    }
  }

  console.log(`[Kafka Consumer] Sending SMS to ${mobileNumbers.size} subscriber(s) for alert id=${alert.id}`);

  for (const mobile of mobileNumbers) {
    const message = `[AlertMap] ${alert.alertType} ALERT: ${alert.description} (near your subscribed location)`;
    await smsService.sendSms(mobile, message);
  }
};

const start = async () => {
  const topic = process.env.KAFKA_TOPIC || 'alert_subscriptions';

  await consumer.connect();
  console.log('[Kafka Consumer] Connected to broker:', process.env.KAFKA_BROKER);

  await consumer.subscribe({ topic, fromBeginning: false });
  console.log(`[Kafka Consumer] Subscribed to topic="${topic}"`);

  await consumer.run({
    eachMessage: async ({ topic: t, partition, message }) => {
      const rawValue = message.value?.toString();
      if (!rawValue) {
        console.warn('[Kafka Consumer] Received empty message, skipping');
        return;
      }

      let alert;
      try {
        alert = JSON.parse(rawValue);
        console.log(`[Kafka Consumer] Received message from topic="${t}" partition=${partition} alert id=${alert.id}`);
      } catch (err) {
        console.error('[Kafka Consumer] Failed to parse message:', err.message, '| raw:', rawValue);
        return;
      }

      try {
        await processAlert(alert);
      } catch (err) {
        console.error(`[Kafka Consumer] Error processing alert id=${alert?.id}:`, err.message);
      }
    },
  });
};

const disconnect = async () => {
  await consumer.disconnect();
  console.log('[Kafka Consumer] Disconnected');
};

module.exports = { start, disconnect };
