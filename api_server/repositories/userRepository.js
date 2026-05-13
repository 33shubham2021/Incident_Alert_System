const pool = require('../config/db');

const findByMobileNumber = async (mobileNumber) => {
  console.log(`[UserRepo] Looking up user with mobile_number=${mobileNumber}`);
  const [rows] = await pool.execute(
    'SELECT user_id, name, email, mobile_number, created_at FROM user WHERE mobile_number = ?',
    [mobileNumber]
  );
  if (rows.length === 0) {
    console.log(`[UserRepo] No user found for mobile_number=${mobileNumber}`);
    return null;
  }
  console.log(`[UserRepo] Found user id=${rows[0].user_id} name="${rows[0].name}"`);
  return rows[0];
};

module.exports = { findByMobileNumber };
