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

      // Process each expired offer
      for (const offer of expiredOffers) {
        // Deactivate the offer
        offer.isActive = false;
        await offer.save();

        console.log(`Deactivated expired offer: ${offer.name} (${offer._id})`);

        // Handle product offers
        if (offer.type === 'product') {
          // Get all products with this offer
          const products = await Product.find({ offer: offer._id });

          // Remove offer references from products
          for (const product of products) {
            product.offer = null;
            product.productOffer = false;
            product.offerPercentage = 0;
            product.offerEndDate = null;
            await product.save();

            console.log(`Removed offer reference from product: ${product.productName} (${product._id})`);
          }
        }

        // Handle category offers
        if (offer.type === 'category') {
          // Get all categories with this offer
          const categories = await Category.find({ offer: offer._id });

          // Remove offer references from categories
          for (const category of categories) {
            category.offer = null;
            await category.save();

            console.log(`Removed offer reference from category: ${category.name} (${category._id})`);

            // Update all products in this category
            const products = await Product.find({ category: category._id });
            for (const product of products) {
              // Only update if this was the applied offer
              if (product.offer && product.offer.toString() === offer._id.toString()) {
                product.offer = null;
                product.productOffer = false;
                product.offerPercentage = 0;
                product.offerEndDate = null;
                await product.save();

                console.log(`Removed category offer reference from product: ${product.productName} (${product._id})`);
              }
            }
          }
        }
      }

      console.log(`Completed offer expiration check. Deactivated ${expiredOffers.length} offers.`);
    } catch (error) {
      // Error in offer expiration cron job - silently continue
    }
  });

  console.log('Offer expiration cron job scheduled');
};

module.exports = {
  initOfferCronJobs
};
