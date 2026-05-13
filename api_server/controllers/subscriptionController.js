const Subscription = require('../models/Subscription');
const Alert = require('../models/Alert');
const subscriptionRepository = require('../repositories/subscriptionRepository');
const userRepository = require('../repositories/userRepository');
const alertRepository = require('../repositories/alertRepository');
const redisRepository = require('../repositories/redisRepository');
const kafkaProducer = require('../kafka/producer');

const DEFAULT_DISTANCE_KM = 50;

// POST /api/add-subscription
const addSubscription = async (req, res) => {
  try {
    const { latitude, longitude, mobile_number, distance } = req.body;
    console.log(`[SubscriptionCtrl] addSubscription request: mobile=${mobile_number} lat=${latitude} lon=${longitude} dist=${distance}`);

    if (!latitude || !longitude || !mobile_number) {
      return res.status(400).json({ message: 'latitude, longitude, and mobile_number are required.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const distKm = parseInt(distance, 10) || DEFAULT_DISTANCE_KM;

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ message: 'latitude and longitude must be valid numbers.' });
    }

    // Check if user exists
    const user = await userRepository.findByMobileNumber(mobile_number);
    if (!user) {
      return res.status(404).json({ message: `No user found with mobile_number: ${mobile_number}` });
    }

    // Check for duplicate subscription
    const exists = await subscriptionRepository.subscriptionExists(mobile_number, lat, lon);
    if (exists) {
      return res.status(409).json({ message: 'Subscription for this location already exists.' });
    }

    // Persist in MySQL
    const subscription = new Subscription({ mobile_number, latitude: lat, longitude: lon, distance: distKm });
    const insertId = await subscriptionRepository.createSubscription(subscription);

    // Store in Redis geo index
    await redisRepository.addSubscription(lat, lon, mobile_number, distKm);

    console.log(`[SubscriptionCtrl] Subscription created id=${insertId} for mobile=${mobile_number}`);
    return res.status(201).json({
      message: 'Subscription added successfully.',
      subscription: { id: insertId, mobile_number, latitude: lat, longitude: lon, distance: distKm },
    });
  } catch (error) {
    console.error('[SubscriptionCtrl] addSubscription error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// GET /api/get-subscriptions?mobile_number=xxx
const getSubscriptions = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    console.log(`[SubscriptionCtrl] getSubscriptions request: mobile=${mobile_number}`);

    if (!mobile_number) {
      return res.status(400).json({ message: 'mobile_number query parameter is required.' });
    }

    const subscriptions = await subscriptionRepository.getSubscriptionsByMobile(mobile_number);

    return res.status(200).json({
      mobile_number,
      count: subscriptions.length,
      subscriptions,
    });
  } catch (error) {
    console.error('[SubscriptionCtrl] getSubscriptions error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// GET /api/get-user?mobile_number=xxx
const getUser = async (req, res) => {
  try {
    const { mobile_number } = req.query;
    console.log(`[SubscriptionCtrl] getUser request: mobile=${mobile_number}`);

    if (!mobile_number) {
      return res.status(400).json({ message: 'mobile_number query parameter is required.' });
    }

    const user = await userRepository.findByMobileNumber(mobile_number);
    if (!user) {
      return res.status(404).json({ message: `User not found for mobile_number: ${mobile_number}` });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('[SubscriptionCtrl] getUser error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// DELETE /api/delete-subscription
const deleteSubscription = async (req, res) => {
  try {
    const { latitude, longitude, mobile_number } = req.body;
    console.log(`[SubscriptionCtrl] deleteSubscription request: mobile=${mobile_number} lat=${latitude} lon=${longitude}`);

    if (!latitude || !longitude || !mobile_number) {
      return res.status(400).json({ message: 'latitude, longitude, and mobile_number are required.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    // Remove from MySQL
    const affectedRows = await subscriptionRepository.deleteSubscription(mobile_number, lat, lon);
    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Subscription not found.' });
    }

    // Remove from Redis geo index
    await redisRepository.removeSubscription(lat, lon, mobile_number);

    console.log(`[SubscriptionCtrl] Subscription deleted for mobile=${mobile_number} lat=${lat} lon=${lon}`);
    return res.status(200).json({ message: 'Subscription deleted successfully.' });
  } catch (error) {
    console.error('[SubscriptionCtrl] deleteSubscription error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// POST /api/dummy-test
const dummyTest = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    console.log(`[SubscriptionCtrl] dummyTest request: lat=${latitude} lon=${longitude}`);

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'latitude and longitude are required.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ message: 'latitude and longitude must be valid numbers.' });
    }

    const ALERT_TYPES = ['TRAFFIC', 'CLIMATE', 'CLOSURE', 'ACCIDENT'];
    const alertType = ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)];

    const dummyAlert = new Alert({
      latitude: lat,
      longitude: lon,
      alert_type: alertType,
      description: `[TEST] Dummy ${alertType} alert generated for testing subscription notifications.`,
    });

    // Persist to MySQL
    const insertId = await alertRepository.createAlert(dummyAlert);
    dummyAlert.id = insertId;

    console.log(`[SubscriptionCtrl] Dummy alert inserted with id=${insertId} type=${alertType}`);

    // Publish to Kafka
    await kafkaProducer.publishAlert(dummyAlert);

    return res.status(201).json({
      message: 'Dummy alert created and published to Kafka.',
      alert: { id: insertId, latitude: lat, longitude: lon, alertType, description: dummyAlert.description },
    });
  } catch (error) {
    console.error('[SubscriptionCtrl] dummyTest error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { addSubscription, getSubscriptions, getUser, deleteSubscription, dummyTest };
