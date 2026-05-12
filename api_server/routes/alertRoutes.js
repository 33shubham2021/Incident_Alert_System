const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');

router.get('/alerts', alertController.getAlerts);

module.exports = router;
