class Alert {
  constructor({ id = null, latitude, longitude, alert_type, description = null, created_at = null }) {
    this.id = id;
    this.latitude = latitude;
    this.longitude = longitude;
    this.alertType = alert_type;
    this.description = description;
    this.createdAt = created_at;
  }
}

module.exports = Alert;
