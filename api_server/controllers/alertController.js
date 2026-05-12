const alertRepository = require('../repositories/alertRepository');

const DEFAULT_WINDOW_MINUTES = 60;

const getAlerts = async (req, res) => {
  console.log("Inside the controller")
  try {
    const minutes = parseInt(req.query.minutes, 10) || DEFAULT_WINDOW_MINUTES;

    if (isNaN(minutes) || minutes <= 0) {
      return res.status(400).json({ message: 'Query parameter "minutes" must be a positive integer.' });
    }

    const alerts = await alertRepository.getAllAlerts(minutes);

    return res.status(200).json({
      window_minutes: minutes,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('getAlerts error:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = { getAlerts };
