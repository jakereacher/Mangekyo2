/**
 * Utility functions for generating and managing order numbers
 */
const Order = require('../models/orderSchema');

/**
 * Generate a shorter, sequential order number in the format MK-YYMMDD-XXX
 * @returns {Promise<string>} The generated order number
 */
async function generateOrderNumber() {
  try {
    // Get current date in YYMMDD format (shorter than YYYYMMDD)
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;

    // Find the highest sequence number for today
    const prefix = `MK${dateString}`;

    // Find the latest order with this prefix
    const latestOrder = await Order.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 });

    let sequenceNumber = 1;

    if (latestOrder && latestOrder.orderNumber) {
      // Extract the sequence number from the latest order
      // The format is MK230101001, so we extract the last 3 digits
      const latestSequence = latestOrder.orderNumber.substring(8);
      sequenceNumber = parseInt(latestSequence, 10) + 1;
    }

    // Format the sequence number with leading zeros (3 digits)
    const formattedSequence = String(sequenceNumber).padStart(3, '0');

    // Combine to create the final order number (e.g., MK230101001)
    return `${prefix}${formattedSequence}`;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback to a timestamp-based number if there's an error
    const timestamp = Date.now().toString().slice(-6);
    return `MK${timestamp}`;
  }
}

module.exports = {
  generateOrderNumber
};
