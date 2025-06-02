/**
 * Script to synchronize product status with quantity
 * Run this script to ensure all products have the correct status based on their quantity
 */

const mongoose = require('mongoose');
const Product = require('../models/productSchema');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    runSync();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function runSync() {
  try {
    console.log('Starting product status synchronization...');

    const products = await Product.find();
    let updatedCount = 0;

    for (const product of products) {
      const correctStatus = product.quantity > 0 ? "Available" : "Out of Stock";

      if (product.status !== correctStatus) {
        console.log(`Updating product ${product._id} (${product.productName}) status from "${product.status}" to "${correctStatus}"`);
        product.status = correctStatus;
        await product.save();
        updatedCount++;
      }
    }

    console.log(`Synchronization complete!`);
    console.log(`Updated ${updatedCount} out of ${products.length} products`);

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    await mongoose.connection.close();
    process.exit(1);
  }
}
