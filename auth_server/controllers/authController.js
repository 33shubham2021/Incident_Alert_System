const bcrypt = require('bcryptjs');
const User = require('../models/User');
const userRepository = require('../repositories/userRepository');
const tokenGenerationService = require('../services/tokenGenerationService');

const SALT_ROUNDS = 10;

const register = async (req, res) => {
  try {
    const { name, email, mobile_number, password } = req.body;
    console.log(`[AuthCtrl] Register attempt for mobile=${mobile_number} email=${email}`);

    if (!name || !email || !mobile_number || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existing = await userRepository.findByMobileNumber(mobile_number);
    if (existing) {
      console.log(`[AuthCtrl] Register blocked — mobile=${mobile_number} already registered`);
      return res.status(409).json({ message: 'Mobile number is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = new User({ name, email, mobile_number, password: hashedPassword });
    const userId = await userRepository.createUser(newUser);

    console.log(`[AuthCtrl] User registered successfully id=${userId} mobile=${mobile_number}`);
    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('[AuthCtrl] Register error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

const login = async (req, res) => {
  try {
    const { mobile_number, password } = req.body;
    console.log(`[AuthCtrl] Login attempt for mobile=${mobile_number}`);

    if (!mobile_number || !password) {
      return res.status(400).json({ message: 'Mobile number and password are required.' });
    }

    const user = await userRepository.findByMobileNumber(mobile_number);
    if (!user) {
      console.log(`[AuthCtrl] Login failed — user not found for mobile=${mobile_number}`);
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    console.log(`[AuthCtrl] User found id=${user.userId}, comparing password...`);
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log(`[AuthCtrl] Login failed — incorrect password for mobile=${mobile_number}`);
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Include name, email, mobileNumber in JWT so the dashboard can display user info without an extra API call
    const token = tokenGenerationService.generateToken({
      userId: user.userId,
      mobileNumber: user.mobileNumber,
      name: user.name,
      email: user.email,
    });

    console.log(`[AuthCtrl] Login successful for mobile=${mobile_number} userId=${user.userId}`);
    return res.status(200).json({ token });
  } catch (error) {
    console.error('[AuthCtrl] Login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { register, login };
