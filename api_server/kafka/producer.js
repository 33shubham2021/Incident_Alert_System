const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'api-server',
  brokers: [(process.env.KAFKA_BROKER || 'localhost:9092')],
});

const producer = kafka.producer();
let isConnected = false;

const connect = async () => {
  if (!isConnected) {
    await producer.connect();
    isConnected = true;
    console.log('[Kafka Producer] Connected to broker:', process.env.KAFKA_BROKER);
  }
};

const publishAlert = async (alert) => {
  const topic = process.env.KAFKA_TOPIC || 'alert_subscriptions';
  const message = JSON.stringify(alert);
  console.log(`[Kafka Producer] Publishing alert id=${alert.id} type=${alert.alertType} to topic="${topic}"`);
  await producer.send({
    topic,
    messages: [{ value: message }],
  });
  console.log(`[Kafka Producer] Alert id=${alert.id} published successfully`);
};

const disconnect = async () => {
  if (isConnected) {
    await producer.disconnect();
    isConnected = false;
    console.log('[Kafka Producer] Disconnected');
  }
};

module.exports = { connect, publishAlert, disconnect };
