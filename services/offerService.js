const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

/**
 * Get all valid offers (not expired and active)
 */
const getAllValidOffers = async () => {
  const now = new Date();
  return await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
};

/**
 * Get valid offers by type
 * @param {String} type - Offer type (product, category, referral)
 */
const getValidOffersByType = async (type) => {
  const now = new Date();
  return await Offer.find({
    type,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
};

/**
 * Get valid offers for a specific product
 * @param {String} productId - Product ID
 * @returns {Object} Object containing valid product and category offers
 */
const getValidOffersForProduct = async (productId) => {
  const now = new Date();

  // Get the product with its category
  const product = await Product.findById(productId).populate('category');
  if (!product) {
    return { productOffers: [], categoryOffers: [] };
  }

  // Get direct product offers
  const productOffers = await Offer.find({
    type: 'product',
    applicableProducts: productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ createdAt: -1 }); // Sort by creation date, newest first

  // Double-check each product offer to ensure it's not expired
  const validProductOffers = productOffers.filter(offer => {
    return offer.isActive && offer.startDate <= now && offer.endDate >= now;
  });

  // Get category offers for the product's category
  let categoryOffers = [];
  if (product.category && product.category._id) {
    categoryOffers = await Offer.find({
      type: 'category',
      applicableCategories: product.category._id,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ createdAt: -1 }); // Sort by creation date, newest first
  }

  // Double-check each category offer to ensure it's not expired
  const validCategoryOffers = categoryOffers.filter(offer => {
    return offer.isActive && offer.startDate <= now && offer.endDate >= now;
  });

  // If we have multiple product offers, find the one with the highest discount
  // If discounts are equal, take the newest one (already sorted by createdAt)
  let bestProductOffer = null;
  if (validProductOffers.length > 0) {
    // Start with the newest offer (first in the array)
    bestProductOffer = validProductOffers[0];

    // Calculate its discount for a sample price of 1000 (for comparison)
    const samplePrice = 1000;
    let maxDiscount = bestProductOffer.calculateDiscount(samplePrice);

    // Compare with other offers
    for (let i = 1; i < validProductOffers.length; i++) {
      const currentOffer = validProductOffers[i];
      const currentDiscount = currentOffer.calculateDiscount(samplePrice);

      // If this offer gives a higher discount, use it instead
      if (currentDiscount > maxDiscount) {
        maxDiscount = currentDiscount;
        bestProductOffer = currentOffer;
      }
    }
  }

  // Same for category offers
  let bestCategoryOffer = null;
  if (validCategoryOffers.length > 0) {
    // Start with the newest offer (first in the array)
    bestCategoryOffer = validCategoryOffers[0];

    // Calculate its discount for a sample price of 1000 (for comparison)
    const samplePrice = 1000;
    let maxDiscount = bestCategoryOffer.calculateDiscount(samplePrice);

    // Compare with other offers
    for (let i = 1; i < validCategoryOffers.length; i++) {
      const currentOffer = validCategoryOffers[i];
      const currentDiscount = currentOffer.calculateDiscount(samplePrice);

      // If this offer gives a higher discount, use it instead
      if (currentDiscount > maxDiscount) {
        maxDiscount = currentDiscount;
        bestCategoryOffer = currentOffer;
      }
    }
  }

  // Return the best offers of each type
  return {
    productOffers: bestProductOffer ? [bestProductOffer] : [],
    categoryOffers: bestCategoryOffer ? [bestCategoryOffer] : []
  };
};

/**
 * Get the best offer for a product
 * @param {String} productId - Product ID
 * @param {Number} price - Product price
 */
const getBestOfferForProduct = async (productId, price) => {
  const { productOffers, categoryOffers } = await getValidOffersForProduct(productId);
  const now = new Date();

  // If no offers at all, return no offer
  if (productOffers.length === 0 && categoryOffers.length === 0) {
    return {
      hasOffer: false,
      discountAmount: 0,
      finalPrice: price,
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

    const discountAmount = offer.calculateDiscount(price);

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

    const discountAmount = offer.calculateDiscount(price);

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
    } else if (maxProductDiscount < maxCategoryDiscount) {
      // Category offer has greater discount, use it
      bestOffer = bestCategoryOffer;
      maxDiscount = maxCategoryDiscount;
    } else {
      // Discounts are equal, use the newer one (already sorted by createdAt, newest first)
      // Compare creation dates to determine which is newer
      if (bestProductOffer.createdAt >= bestCategoryOffer.createdAt) {
        bestOffer = bestProductOffer;
        maxDiscount = maxProductDiscount;
      } else {
        bestOffer = bestCategoryOffer;
        maxDiscount = maxCategoryDiscount;
      }
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

  return {
    hasOffer: !!bestOffer,
    discountAmount: Math.round(maxDiscount),
    finalPrice: Math.round(price - maxDiscount),
    offer: bestOffer
  };
};

/**
 * Apply offers to a list of products
 * @param {Array} products - List of products
 */
const applyOffersToProducts = async (products) => {
  const productsWithOffers = [];

  for (const product of products) {
    const price = product.price;
    const offerResult = await getBestOfferForProduct(product._id, price);

    productsWithOffers.push({
      ...product.toObject ? product.toObject() : product,
      offerPrice: Math.round(offerResult.finalPrice),
      discountAmount: Math.round(offerResult.discountAmount),
      hasOffer: offerResult.hasOffer,
      appliedOffer: offerResult.offer
    });
  }

  return productsWithOffers;
};

/**
 * Apply product offer
 * @param {String} productId - Product ID
 * @param {String} offerId - Offer ID
 */
const applyProductOffer = async (productId, offerId) => {
  // Validate product and offer
  const product = await Product.findById(productId);
  const offer = await Offer.findById(offerId);

  if (!product || !offer || offer.type !== 'product') {
    return false;
  }

  // Update offer's applicable products
  await Offer.findByIdAndUpdate(offerId, {
    $addToSet: { applicableProducts: productId }
  });

  // Update product's offer reference
  await Product.findByIdAndUpdate(productId, {
    offer: offerId,
    productOffer: true
  });

  return true;
};

/**
 * Apply category offer
 * @param {String} categoryId - Category ID
 * @param {String} offerId - Offer ID
 */
const applyCategoryOffer = async (categoryId, offerId) => {
  // Validate category and offer
  const category = await Category.findById(categoryId);
  const offer = await Offer.findById(offerId);

  if (!category || !offer || offer.type !== 'category') {
    return false;
  }

  // Update offer's applicable categories
  await Offer.findByIdAndUpdate(offerId, {
    $addToSet: { applicableCategories: categoryId }
  });

  // Update category's offer reference
  await Category.findByIdAndUpdate(categoryId, {
    offer: offerId
  });

  return true;
};

/**
 * Remove product offer
 * @param {String} productId - Product ID
 */
const removeProductOffer = async (productId) => {
  const product = await Product.findById(productId).populate('offer');

  if (!product || !product.offer) {
    return false;
  }

  // Remove product from offer's applicable products
  await Offer.findByIdAndUpdate(product.offer._id, {
    $pull: { applicableProducts: productId }
  });

  // Remove offer reference from product
  await Product.findByIdAndUpdate(productId, {
    offer: null,
    productOffer: false
  });

  return true;
};

/**
 * Remove category offer
 * @param {String} categoryId - Category ID
 */
const removeCategoryOffer = async (categoryId) => {
  const category = await Category.findById(categoryId).populate('offer');

  if (!category || !category.offer) {
    return false;
  }

  // Remove category from offer's applicable categories
  await Offer.findByIdAndUpdate(category.offer._id, {
    $pull: { applicableCategories: categoryId }
  });

  // Remove offer reference from category
  await Category.findByIdAndUpdate(categoryId, {
    offer: null
  });

  return true;
};

module.exports = {
  getAllValidOffers,
  getValidOffersByType,
  getValidOffersForProduct,
  getBestOfferForProduct,
  applyOffersToProducts,
  applyProductOffer,
  applyCategoryOffer,
  removeProductOffer,
  removeCategoryOffer
};
