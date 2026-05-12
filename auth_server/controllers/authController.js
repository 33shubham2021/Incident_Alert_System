const bcrypt = require('bcryptjs');
const User = require('../models/User');
const userRepository = require('../repositories/userRepository');
const tokenGenerationService = require('../services/tokenGenerationService');

const SALT_ROUNDS = 10;

const register = async (req, res) => {
  try {
    const { name, email, mobile_number, password } = req.body;

    if (!name || !email || !mobile_number || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existing = await userRepository.findByMobileNumber(mobile_number);
    if (existing) {
      return res.status(409).json({ message: 'Mobile number is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newUser = new User({ name, email, mobile_number, password: hashedPassword });
    await userRepository.createUser(newUser);

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

const login = async (req, res) => {
  try {
    console.log(req.body)

    const { mobile_number, password } = req.body;

    if (!mobile_number || !password) {
      return res.status(400).json({ message: 'Mobile number and password are required.' });
    }

    const user = await userRepository.findByMobileNumber(mobile_number);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = tokenGenerationService.generateToken({
      userId: user.userId,
      mobileNumber: user.mobileNumber,
    });

    return res.status(200).json({ token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { register, login };
