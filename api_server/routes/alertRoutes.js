const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const subscriptionController = require('../controllers/subscriptionController');

// Alert routes
router.get('/alerts', alertController.getAlerts);

// Subscription routes
router.post('/add-subscription', subscriptionController.addSubscription);
router.get('/get-subscriptions', subscriptionController.getSubscriptions);
router.get('/get-user', subscriptionController.getUser);
router.delete('/delete-subscription', subscriptionController.deleteSubscription);
router.post('/dummy-test', subscriptionController.dummyTest);

module.exports = router;
