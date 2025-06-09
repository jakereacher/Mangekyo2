/**
 * New Offer Service
 * Handles all offer-related operations
 */
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

  // Find the best product offer (highest discount)
  let bestProductOffer = null;
  if (productOffers.length > 0) {
    // Use a sample price to compare discounts
    const samplePrice = product.price || 1000;

    // Start with the first offer
    bestProductOffer = productOffers[0];
    let maxDiscount = bestProductOffer.calculateDiscount(samplePrice);

    // Compare with other offers
    for (let i = 1; i < productOffers.length; i++) {
      const currentOffer = productOffers[i];
      const currentDiscount = currentOffer.calculateDiscount(samplePrice);

      if (currentDiscount > maxDiscount) {
        maxDiscount = currentDiscount;
        bestProductOffer = currentOffer;
      }
    }
  }

  // Find the best category offer (highest discount)
  let bestCategoryOffer = null;
  if (categoryOffers.length > 0) {
    // Use a sample price to compare discounts
    const samplePrice = product.price || 1000;

    // Start with the first offer
    bestCategoryOffer = categoryOffers[0];
    let maxDiscount = bestCategoryOffer.calculateDiscount(samplePrice);

    // Compare with other offers
    for (let i = 1; i < categoryOffers.length; i++) {
      const currentOffer = categoryOffers[i];
      const currentDiscount = currentOffer.calculateDiscount(samplePrice);

      if (currentDiscount > maxDiscount) {
        maxDiscount = currentDiscount;
        bestCategoryOffer = currentOffer;
      }
    }
  }

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

  // If no offers at all, return no offer
  if (productOffers.length === 0 && categoryOffers.length === 0) {
    return {
      hasOffer: false,
      discountAmount: 0,
      finalPrice: price,
      offer: null
    };
  }

  // Calculate best product offer discount
  let bestProductOffer = null;
  let maxProductDiscount = 0;

  if (productOffers.length > 0) {
    bestProductOffer = productOffers[0];
    maxProductDiscount = bestProductOffer.calculateDiscount(price);
  }

  // Calculate best category offer discount
  let bestCategoryOffer = null;
  let maxCategoryDiscount = 0;

  if (categoryOffers.length > 0) {
    bestCategoryOffer = categoryOffers[0];
    maxCategoryDiscount = bestCategoryOffer.calculateDiscount(price);
  }

  // Determine the best offer (product or category)
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
      appliedOffer: offerResult.offer,
      offerType: offerResult.offer ? offerResult.offer.type : null
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

  // Update product with offer details
  await product.updateOfferDetails();

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

  // Update category with offer details
  await category.updateOfferDetails();

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

  // Clear offer details from product
  product.offer = null;
  product.productOffer = false;
  product.offerPercentage = 0;
  product.offerType = null;
  product.offerEndDate = null;
  await product.save();

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

  // Clear offer details from category
  category.offer = null;
  category.categoryOffer = 0;
  category.offerType = null;
  category.offerEndDate = null;
  await category.save();

  // Update all products in this category
  const products = await Product.find({ category: categoryId });
  for (const product of products) {
    await product.updateOfferDetails();
  }

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
