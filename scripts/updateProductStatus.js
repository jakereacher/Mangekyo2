// Script to update all product statuses based on their quantity
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/productSchema');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    updateProductStatuses();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

async function updateProductStatuses() {
  try {
    console.log('Starting product status update...');

    // Find all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to check`);

    let updatedCount = 0;
    let noChangeCount = 0;

    // Update each product's status based on quantity
    for (const product of products) {
      const oldStatus = product.status;
      const newStatus = product.quantity > 0 ? 'Available' : 'Out of Stock';

      if (oldStatus !== newStatus) {
        product.status = newStatus;
        await product.save();
        updatedCount++;
        console.log(`Updated product "${product.productName}" (${product._id}): ${oldStatus} -> ${newStatus} (Quantity: ${product.quantity})`);
      } else {
        noChangeCount++;
      }
    }

    console.log('\nUpdate summary:');
    console.log(`- Total products checked: ${products.length}`);
    console.log(`- Products updated: ${updatedCount}`);
    console.log(`- Products already correct: ${noChangeCount}`);
    console.log('\nProduct status update completed successfully!');

    // Close the MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    mongoose.connection.close();
    process.exit(1);
  }
}
