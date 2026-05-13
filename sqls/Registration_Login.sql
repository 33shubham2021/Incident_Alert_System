create database alert_system;

use alert_system;

CREATE TABLE user (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alert (
    id INT AUTO_INCREMENT PRIMARY KEY,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    alert_type ENUM('TRAFFIC', 'CLIMATE', 'CLOSURE', 'ACCIDENT') NOT NULL,
    description VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscription (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mobile_number VARCHAR(20) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    distance INT NOT NULL DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mobile_number) REFERENCES user(mobile_number) ON DELETE CASCADE,
    UNIQUE KEY uq_sub (mobile_number, latitude, longitude)
);

