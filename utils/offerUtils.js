const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

/**
 * Get all valid offers for a product
 * @param {Object} product - Product object with populated category
 * @returns {Object} Object containing valid product and category offers
 */
const getValidOffersForProduct = async (product) => {
  if (!product) return { productOffers: [], categoryOffers: [] };

  const now = new Date();

  // Get product offers
  let productOffers = [];

  // Get all product offers, sorted by creation date (newest first)
  const allProductOffers = await Offer.find({
    type: 'product',
    applicableProducts: product._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ createdAt: -1 }); // Sort by creation date, newest first

  // Only take the latest (first) product offer
  if (allProductOffers.length > 0) {
    productOffers = [allProductOffers[0]];
  }

  // If product has a direct offer reference but it's not the latest, update it
  if (product.offer) {
    const currentOffer = await Offer.findById(product.offer);

    // If the current offer is expired or inactive, clear it
    if (currentOffer && (currentOffer.endDate < now || !currentOffer.isActive)) {
      console.log(`Clearing expired offer from product ${product._id}: Offer ${currentOffer._id} expired on ${currentOffer.endDate}`);
      await Product.findByIdAndUpdate(product._id, {
        $set: {
          offer: null,
          productOffer: false,
          offerPercentage: 0,
          offerEndDate: null
        }
      });
    }
    // If there's a newer offer available, update the product's offer reference
    else if (productOffers.length > 0 && currentOffer &&
             productOffers[0]._id.toString() !== currentOffer._id.toString()) {
      console.log(`Updating product ${product._id} with newer offer: ${productOffers[0]._id}`);
      await Product.findByIdAndUpdate(product._id, {
        $set: {
          offer: productOffers[0]._id,
          productOffer: true
        }
      });
    }
  }

  // Get category offers
  let categoryOffers = [];
  if (product.category) {
    const categoryId = typeof product.category === 'object' ? product.category._id : product.category;

    // Get all category offers, sorted by creation date (newest first)
    const allCategoryOffers = await Offer.find({
      type: 'category',
      applicableCategories: categoryId,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ createdAt: -1 }); // Sort by creation date, newest first

    // Only take the latest (first) category offer
    if (allCategoryOffers.length > 0) {
      categoryOffers = [allCategoryOffers[0]];
    }

    // If category has a direct offer reference but it's not the latest, update it
    if (typeof product.category === 'object' && product.category.offer) {
      const category = await Category.findById(categoryId).populate('offer');

      // If the current offer is expired or inactive, clear it
      if (category && category.offer &&
          (category.offer.endDate < now || !category.offer.isActive)) {
        console.log(`Clearing expired offer from category ${category._id}: Offer ${category.offer._id} expired on ${category.offer.endDate}`);
        await Category.findByIdAndUpdate(category._id, {
          $set: { offer: null }
        });
      }
      // If there's a newer offer available, update the category's offer reference
      else if (categoryOffers.length > 0 && category && category.offer &&
               categoryOffers[0]._id.toString() !== category.offer._id.toString()) {
        console.log(`Updating category ${category._id} with newer offer: ${categoryOffers[0]._id}`);
        await Category.findByIdAndUpdate(category._id, {
          $set: { offer: categoryOffers[0]._id }
        });
      }
    }
  }

  return {
    productOffers,
    categoryOffers
  };
};

/**
 * Calculate the best offer price for a product
 * @param {Object} product - Product object
 * @returns {Object} Object with offer details
 */
const calculateBestOfferPrice = async (product) => {
  if (!product) {
    return {
      hasOffer: false,
      originalPrice: 0,
      finalPrice: 0,
      discountAmount: 0,
      discountPercentage: 0,
      offer: null
    };
  }

  const originalPrice = product.price || product.salePrice || product.regularPrice;
  const now = new Date();

  // Get all valid offers for the product
  const { productOffers, categoryOffers } = await getValidOffersForProduct(product);

  // If no offers at all, return no offer
  if (productOffers.length === 0 && categoryOffers.length === 0) {
    return {
      hasOffer: false,
      originalPrice,
      finalPrice: originalPrice,
      discountAmount: 0,
      discountPercentage: 0,
      offer: null
    };
  }

  // Find the best product offer (if any)
  let bestProductOffer = null;
  let maxProductDiscount = 0;

  for (const offer of productOffers) {
    // Double-check offer validity before calculating discount
    if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
      console.log(`Skipping expired or inactive product offer: ${offer.name} (${offer._id})`);
      continue;
    }

    const discountAmount = offer.calculateDiscount(originalPrice);

    if (discountAmount > maxProductDiscount) {
      maxProductDiscount = discountAmount;
      bestProductOffer = offer;
    }
  }

  // Find the best category offer (if any)
  let bestCategoryOffer = null;
  let maxCategoryDiscount = 0;

  for (const offer of categoryOffers) {
    // Double-check offer validity before calculating discount
    if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
      console.log(`Skipping expired or inactive category offer: ${offer.name} (${offer._id})`);
      continue;
    }

    const discountAmount = offer.calculateDiscount(originalPrice);

    if (discountAmount > maxCategoryDiscount) {
      maxCategoryDiscount = discountAmount;
      bestCategoryOffer = offer;
    }
  }

  // Determine the final best offer based on the requirements:
  // 1. If both product and category offers exist, use the one with greater discount
  // 2. If discounts are equal, prefer the newest offer (which is already sorted by createdAt)
  let bestOffer = null;
  let maxDiscount = 0;

  if (bestProductOffer && bestCategoryOffer) {
    // Both types of offers exist, compare discounts
    if (maxProductDiscount > maxCategoryDiscount) {
      // Product offer has greater discount, use it
      bestOffer = bestProductOffer;
      maxDiscount = maxProductDiscount;
    } else {
      // Category offer has greater or equal discount, use it
      bestOffer = bestCategoryOffer;
      maxDiscount = maxCategoryDiscount;
    }
  } else if (bestProductOffer) {
    // Only product offer exists
    bestOffer = bestProductOffer;
    maxDiscount = maxProductDiscount;
  } else if (bestCategoryOffer) {
    // Only category offer exists
    bestOffer = bestCategoryOffer;
    maxDiscount = maxCategoryDiscount;
  }

  const finalPrice = originalPrice - maxDiscount;
  const discountPercentage = originalPrice > 0 ? (maxDiscount / originalPrice) * 100 : 0;

  return {
    hasOffer: !!bestOffer,
    originalPrice,
    finalPrice,
    discountAmount: maxDiscount,
    discountPercentage,
    offer: bestOffer
  };
};

/**
 * Apply offers to a list of products
 * @param {Array} products - Array of product objects
 * @returns {Array} Array of products with offer prices
 */
const applyOffersToProducts = async (products) => {
  if (!products || !Array.isArray(products)) return [];

  const productsWithOffers = [];

  for (const product of products) {
    const offerResult = await calculateBestOfferPrice(product);

    productsWithOffers.push({
      ...product.toObject ? product.toObject() : product,
      hasOffer: offerResult.hasOffer,
      offerPrice: offerResult.finalPrice,
      discountAmount: offerResult.discountAmount,
      discountPercentage: offerResult.discountPercentage,
      appliedOffer: offerResult.offer
    });
  }

  return productsWithOffers;
};

module.exports = {
  getValidOffersForProduct,
  calculateBestOfferPrice,
  applyOffersToProducts
};
