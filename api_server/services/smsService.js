/**
 * SMS Service — stub implementation.
 * Replace the console.log inside sendSms with the actual provider call
 * (e.g. Twilio, MSG91, AWS SNS) when the service is integrated.
 */

const sendSms = async (mobileNumber, message) => {
  // TODO: integrate real SMS provider here and remove the log below
  console.log(`[SmsService] SMS sent out to ${mobileNumber} with message: "${message}"`);
};

module.exports = { sendSms };
