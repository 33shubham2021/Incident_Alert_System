const pool = require('../config/db');
const Subscription = require('../models/Subscription');

const createSubscription = async (subscription) => {
  console.log(`[SubscriptionRepo] Inserting subscription for mobile=${subscription.mobileNumber} lat=${subscription.latitude} lon=${subscription.longitude} dist=${subscription.distance}km`);
  const [result] = await pool.execute(
    'INSERT INTO subscription (mobile_number, latitude, longitude, distance) VALUES (?, ?, ?, ?)',
    [subscription.mobileNumber, subscription.latitude, subscription.longitude, subscription.distance]
  );
  console.log(`[SubscriptionRepo] Subscription inserted with id=${result.insertId}`);
  return result.insertId;
};

const getSubscriptionsByMobile = async (mobileNumber) => {
  console.log(`[SubscriptionRepo] Fetching subscriptions for mobile=${mobileNumber}`);
  const [rows] = await pool.execute(
    'SELECT * FROM subscription WHERE mobile_number = ? ORDER BY created_at DESC',
    [mobileNumber]
  );
  console.log(`[SubscriptionRepo] Found ${rows.length} subscription(s) for mobile=${mobileNumber}`);
  return rows.map((row) => new Subscription(row));
};

const deleteSubscription = async (mobileNumber, latitude, longitude) => {
  console.log(`[SubscriptionRepo] Deleting subscription mobile=${mobileNumber} lat=${latitude} lon=${longitude}`);
  const [result] = await pool.execute(
    'DELETE FROM subscription WHERE mobile_number = ? AND latitude = ? AND longitude = ?',
    [mobileNumber, latitude, longitude]
  );
  console.log(`[SubscriptionRepo] Deleted ${result.affectedRows} row(s)`);
  return result.affectedRows;
};

const subscriptionExists = async (mobileNumber, latitude, longitude) => {
  const [rows] = await pool.execute(
    'SELECT id FROM subscription WHERE mobile_number = ? AND latitude = ? AND longitude = ?',
    [mobileNumber, latitude, longitude]
  );
  return rows.length > 0;
};

module.exports = { createSubscription, getSubscriptionsByMobile, deleteSubscription, subscriptionExists };
