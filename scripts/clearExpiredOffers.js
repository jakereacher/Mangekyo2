/**
 * Script to immediately clear all expired offers from products and categories
 * Run this script to fix any products that still show expired offers
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
    clearExpiredOffers();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

async function clearExpiredOffers() {
  try {
    console.log('Starting expired offers cleanup...');
    const now = new Date();
    
    // 1. Find all expired offers (regardless of active status)
    const expiredOffers = await Offer.find({
      endDate: { $lt: now }
    });
    
    console.log(`Found ${expiredOffers.length} expired offers`);
    
    // 2. Deactivate all expired offers
    for (const offer of expiredOffers) {
      if (offer.isActive) {
        offer.isActive = false;
        await offer.save();
        console.log(`Deactivated expired offer: ${offer.name} (${offer._id})`);
      }
    }
    
    // 3. Get all expired offer IDs
    const expiredOfferIds = expiredOffers.map(offer => offer._id);
    
    // 4. Find all products with any offer (expired or not)
    const allProductsWithOffers = await Product.find({
      productOffer: true
    });
    
    console.log(`Found ${allProductsWithOffers.length} products with offers`);
    
    // 5. Check each product and update if needed
    let productsUpdated = 0;
    
    for (const product of allProductsWithOffers) {
      // Check if product has an expired offer
      const hasExpiredOffer = product.offer && expiredOfferIds.some(id => id.equals(product.offer));
      
      // Check if offer end date is in the past
      const isOfferExpired = product.offerEndDate && product.offerEndDate < now;
      
      if (hasExpiredOffer || isOfferExpired) {
        // Clear offer details
        product.offer = null;
        product.productOffer = false;
        product.offerPercentage = 0;
        product.offerEndDate = null;
        await product.save();
        
        productsUpdated++;
        console.log(`Cleared expired offer from product: ${product.productName} (${product._id})`);
      } else {
        // Double-check with the offer service
        await product.updateOfferDetails();
      }
    }
    
    // 6. Find all categories with expired offers
    const categoriesWithExpiredOffers = await Category.find({
      offer: { $in: expiredOfferIds }
    });
    
    console.log(`Found ${categoriesWithExpiredOffers.length} categories with expired offers`);
    
    // 7. Clear offer references from categories
    for (const category of categoriesWithExpiredOffers) {
      category.offer = null;
      await category.save();
      console.log(`Cleared expired offer from category: ${category.name} (${category._id})`);
    }
    
    console.log(`
    Expired offers cleanup completed:
    - ${expiredOffers.length} expired offers deactivated
    - ${productsUpdated} products updated to remove expired offers
    - ${categoriesWithExpiredOffers.length} categories updated to remove expired offers
    `);
    
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing expired offers:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}
