require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(express.json());

app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});

module.exports = app;