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
 */
const getValidOffersForProduct = async (productId) => {
  const now = new Date();

  // Get the product with its category
  const product = await Product.findById(productId).populate('category');
  if (!product) {
    return [];
  }

  // Get direct product offers
  const productOffers = await Offer.find({
    type: 'product',
    applicableProducts: productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  // Get category offers for the product's category
  const categoryOffers = await Offer.find({
    type: 'category',
    applicableCategories: product.category._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  return [...productOffers, ...categoryOffers];
};

/**
 * Get the best offer for a product
 * @param {String} productId - Product ID
 * @param {Number} price - Product price
 */
const getBestOfferForProduct = async (productId, price) => {
  const offers = await getValidOffersForProduct(productId);

  if (offers.length === 0) {
    return {
      hasOffer: false,
      discountAmount: 0,
      finalPrice: price,
      offer: null
    };
  }

  // Calculate discount for each offer and find the best one
  let bestOffer = null;
  let maxDiscount = 0;

  for (const offer of offers) {
    const discountAmount = offer.calculateDiscount(price);

    if (discountAmount > maxDiscount) {
      maxDiscount = discountAmount;
      bestOffer = offer;
    }
  }

  return {
    hasOffer: !!bestOffer,
    discountAmount: maxDiscount,
    finalPrice: price - maxDiscount,
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
      offerPrice: offerResult.finalPrice,
      discountAmount: offerResult.discountAmount,
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
