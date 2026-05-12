const pool = require('../config/db');
const Alert = require('../models/Alert');

const DEFAULT_WINDOW_MINUTES = 60;

const createAlert = async (alert) => {
  const [result] = await pool.execute(
    'INSERT INTO alert (latitude, longitude, alert_type, description) VALUES (?, ?, ?, ?)',
    [alert.latitude, alert.longitude, alert.alertType, alert.description]
  );
  return result.insertId;
};

const getAllAlerts = async (minutes = DEFAULT_WINDOW_MINUTES) => {
  const [rows] = await pool.execute(
    `SELECT * FROM alert WHERE created_at >= NOW() - INTERVAL ? MINUTE ORDER BY created_at DESC`,
    [minutes]
  );
  return rows.map((row) => new Alert(row));
};

module.exports = { createAlert, getAllAlerts };
