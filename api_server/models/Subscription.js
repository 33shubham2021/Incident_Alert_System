class Subscription {
  constructor({ id = null, mobile_number, latitude, longitude, distance = 50, created_at = null }) {
    this.id = id;
    this.mobileNumber = mobile_number;
    this.latitude = parseFloat(latitude);
    this.longitude = parseFloat(longitude);
    this.distance = parseInt(distance, 10);
    this.createdAt = created_at;
  }
}

module.exports = Subscription;
