/**
 * Utility functions for generating and managing order numbers
 */
const Order = require('../models/orderSchema');

/**
 * Generate a formatted order number in the format MK-YYYYMMDD-XXXX
 * @returns {Promise<string>} The generated order number
 */
async function generateOrderNumber() {
  try {
    // Get current date in YYYYMMDD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;
    
    // Find the highest sequence number for today
    const prefix = `MK-${dateString}-`;
    const latestOrder = await Order.findOne({
      orderNumber: { $regex: `^${prefix}` }
    }).sort({ orderNumber: -1 });
    
    let sequenceNumber = 1;
    
    if (latestOrder && latestOrder.orderNumber) {
      // Extract the sequence number from the latest order
      const latestSequence = latestOrder.orderNumber.split('-')[2];
      sequenceNumber = parseInt(latestSequence, 10) + 1;
    }
    
    // Format the sequence number with leading zeros
    const formattedSequence = String(sequenceNumber).padStart(4, '0');
    
    // Combine to create the final order number
    return `${prefix}${formattedSequence}`;
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback to a timestamp-based number if there's an error
    const timestamp = Date.now().toString().slice(-8);
    return `MK-ERR-${timestamp}`;
  }
}

module.exports = {
  generateOrderNumber
};
