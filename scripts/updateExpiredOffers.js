/**
 * Script to update all products and categories to remove expired offers
 * Run this script to ensure all products and categories have expired offers removed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    updateExpiredOffers();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function updateExpiredOffers() {
  try {
    console.log('Starting expired offers update...');
    const now = new Date();
    
    // Find all expired offers
    const expiredOffers = await Offer.find({
      endDate: { $lt: now }
    });
    
    console.log(`Found ${expiredOffers.length} expired offers`);
    
    // Deactivate expired offers
    for (const offer of expiredOffers) {
      if (offer.isActive) {
        offer.isActive = false;
        await offer.save();
        console.log(`Deactivated expired offer: ${offer.name} (${offer._id})`);
      }
    }
    
    // Get all expired offer IDs
    const expiredOfferIds = expiredOffers.map(offer => offer._id);
    
    // Update products with expired offers
    const productsWithExpiredOffers = await Product.find({
      offer: { $in: expiredOfferIds }
    });
    
    console.log(`Found ${productsWithExpiredOffers.length} products with expired offers`);
    
    for (const product of productsWithExpiredOffers) {
      product.offer = null;
      product.productOffer = false;
      product.offerPercentage = 0;
      product.offerEndDate = null;
      await product.save();
      console.log(`Removed expired offer from product: ${product.productName} (${product._id})`);
    }
    
    // Update categories with expired offers
    const categoriesWithExpiredOffers = await Category.find({
      offer: { $in: expiredOfferIds }
    });
    
    console.log(`Found ${categoriesWithExpiredOffers.length} categories with expired offers`);
    
    for (const category of categoriesWithExpiredOffers) {
      category.offer = null;
      await category.save();
      console.log(`Removed expired offer from category: ${category.name} (${category._id})`);
    }
    
    console.log('Expired offers update completed successfully!');
    
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error updating expired offers:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}
