class User {
  constructor({ user_id = null, name, email, mobile_number, password, created_at = null }) {
    this.userId = user_id;
    this.name = name;
    this.email = email;
    this.mobileNumber = mobile_number;
    this.password = password;
    this.createdAt = created_at;
  }
}

module.exports = User;
