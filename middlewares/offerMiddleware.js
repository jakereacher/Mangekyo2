/**
 * Middleware to check and update expired offers
 * This ensures that expired offers are not displayed to users
 */

const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const Offer = require('../models/offerSchema');

/**
 * Middleware to check and clear expired offers from products
 * This runs before rendering pages that display products with offers
 */
const checkExpiredOffers = async (req, res, next) => {
  try {
    const now = new Date();
    console.log(`[${now.toISOString()}] Checking for expired offers...`);

    // Find all expired offers
    const expiredOffers = await Offer.find({
      endDate: { $lt: now },
      isActive: true
    });

    if (expiredOffers.length > 0) {
      console.log(`Found ${expiredOffers.length} active offers that have expired`);
      
      // Deactivate all expired offers
      const offerIds = expiredOffers.map(offer => offer._id);
      await Offer.updateMany(
        { _id: { $in: offerIds } },
        { $set: { isActive: false } }
      );
      
      // Clear offer references from products
      const productsUpdated = await Product.updateMany(
        { offer: { $in: offerIds } },
        { 
          $set: { 
            offer: null,
            productOffer: false,
            offerPercentage: 0,
            offerEndDate: null
          } 
        }
      );
      
      // Clear offer references from categories
      const categoriesUpdated = await Category.updateMany(
        { offer: { $in: offerIds } },
        { $set: { offer: null } }
      );
      
      console.log(`Updated ${productsUpdated.modifiedCount} products and ${categoriesUpdated.modifiedCount} categories to remove expired offers`);
    } else {
      console.log('No expired active offers found');
    }
    
    next();
  } catch (error) {
    console.error('Error in checkExpiredOffers middleware:', error);
    // Continue to next middleware even if there's an error
    next();
  }
};

/**
 * Middleware to update product offer details before rendering
 * This ensures that products have the latest offer information
 */
const updateProductOffers = async (req, res, next) => {
  try {
    // This is a more intensive operation, so we'll only run it occasionally
    // We'll use a timestamp in the session to limit how often it runs
    const now = Date.now();
    const lastUpdate = req.session.lastOfferUpdate || 0;
    
    // Only run this every 5 minutes (300000 ms)
    if (now - lastUpdate > 300000) {
      console.log('Running full product offer update...');
      
      // Find all products with offers
      const productsWithOffers = await Product.find({
        productOffer: true
      });
      
      let updatedCount = 0;
      
      // Update each product's offer details
      for (const product of productsWithOffers) {
        const updated = await product.updateOfferDetails();
        if (updated) {
          updatedCount++;
        }
      }
      
      console.log(`Updated offer details for ${updatedCount} products`);
      
      // Update the timestamp in the session
      req.session.lastOfferUpdate = now;
    }
    
    next();
  } catch (error) {
    console.error('Error in updateProductOffers middleware:', error);
    // Continue to next middleware even if there's an error
    next();
  }
};

module.exports = {
  checkExpiredOffers,
  updateProductOffers
};
