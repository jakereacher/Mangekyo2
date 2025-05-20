const cron = require('node-cron');
const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

/**
 * Cron job to handle offer expiration
 * - Deactivates expired offers
 * - Removes offer references from products and categories
 * - Runs every hour
 */
const initOfferCronJobs = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      console.log(`[${now.toISOString()}] Running offer expiration check...`);

      // Find expired offers that are still active
      const expiredOffers = await Offer.find({
        endDate: { $lt: now },
        isActive: true
      });

      if (expiredOffers.length === 0) {
        console.log('No expired offers found');
        return;
      }

      console.log(`Found ${expiredOffers.length} expired offers to deactivate`);

      // Deactivate expired offers
      const offerIds = expiredOffers.map(offer => offer._id);
      await Offer.updateMany(
        { _id: { $in: offerIds } },
        { $set: { isActive: false } }
      );

      // Remove offer references from products
      const productsUpdated = await Product.updateMany(
        { offer: { $in: offerIds } },
        { 
          $set: { 
            offer: null,
            productOffer: false,
            offerPercentage: 0,
            offerType: null,
            offerEndDate: null
          } 
        }
      );

      // Remove offer references from categories
      const categoriesUpdated = await Category.updateMany(
        { offer: { $in: offerIds } },
        { 
          $set: { 
            offer: null,
            categoryOffer: 0,
            offerType: null,
            offerEndDate: null
          } 
        }
      );

      console.log(`Updated ${productsUpdated.modifiedCount} products and ${categoriesUpdated.modifiedCount} categories to remove expired offers`);
    } catch (error) {
      console.error('Error in offer expiration cron job:', error);
    }
  });

  console.log('Offer expiration cron job scheduled');
};

module.exports = {
  initOfferCronJobs
};
