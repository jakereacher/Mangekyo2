const Razorpay = require('razorpay');

// Initialize Razorpay with your key_id and key_secret
// Using Razorpay test keys - replace with your actual keys in production
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_KvqIvPkTWM4NFT'
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || 'Rl9Uf8Ry9Tz0Yx1Wv2Vu3Ut'

// Validate Razorpay keys
// if (!razorpayKeyId || razorpayKeyId === 'rzp_test_YOUR_KEY_ID') {
//   console.warn('Warning: Using default Razorpay test key ID. Set RAZORPAY_KEY_ID environment variable for production.');
// }

// if (!razorpayKeySecret || razorpayKeySecret === 'YOUR_KEY_SECRET') {
//   console.warn('Warning: Using default Razorpay test key secret. Set RAZORPAY_KEY_SECRET environment variable for production.');
// }

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: razorpayKeyId,
  key_secret: razorpayKeySecret,
});

// Test the Razorpay instance
try {
  console.log('Initializing Razorpay with key ID:', razorpayKeyId);
} catch (error) {
  console.error('Error initializing Razorpay:', error);
}

module.exports = {
  razorpay,
  razorpayKeyId,
  razorpayKeySecret
};