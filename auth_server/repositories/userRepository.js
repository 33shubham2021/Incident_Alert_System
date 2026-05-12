const pool = require('../config/db');
const User = require('../models/User');

const findByMobileNumber = async (mobileNumber) => {
  const [rows] = await pool.execute(
    'SELECT * FROM user WHERE mobile_number = ?',
    [mobileNumber]
  );
  if (rows.length === 0) return undefined;
  return new User(rows[0]);
};

const createUser = async (user) => {
  const [result] = await pool.execute(
    'INSERT INTO user (name, email, mobile_number, password) VALUES (?, ?, ?, ?)',
    [user.name, user.email, user.mobileNumber, user.password]
  );
  return result.insertId;
};

module.exports = { findByMobileNumber, createUser };
