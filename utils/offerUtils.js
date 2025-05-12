const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

/**
 * Get all valid offers for a product
 * @param {Object} product - Product object with populated category
 * @returns {Array} Array of valid offers for the product
 */
const getValidOffersForProduct = async (product) => {
  if (!product) return [];

  const now = new Date();

  // Get product offers
  let productOffers = [];
  if (product.offer) {
    const offer = await Offer.findById(product.offer);
    // Double-check offer validity
    if (offer && offer.isActive && offer.startDate <= now && offer.endDate >= now) {
      productOffers.push(offer);
    } else if (offer && (offer.endDate < now || !offer.isActive)) {
      // If offer is expired or inactive, clear it from the product
      console.log(`Clearing expired offer from product ${product._id}: Offer ${offer._id} expired on ${offer.endDate}`);
      await Product.findByIdAndUpdate(product._id, {
        $set: {
          offer: null,
          productOffer: false,
          offerPercentage: 0,
          offerEndDate: null
        }
      });
    }
  }

  // Get category offers
  let categoryOffers = [];
  if (product.category && product.category.offer) {
    const categoryId = typeof product.category === 'object' ? product.category._id : product.category;
    const category = await Category.findById(categoryId).populate('offer');

    if (category && category.offer &&
        category.offer.isActive &&
        category.offer.startDate <= now &&
        category.offer.endDate >= now) {
      categoryOffers.push(category.offer);
    } else if (category && category.offer &&
              (category.offer.endDate < now || !category.offer.isActive)) {
      // If category offer is expired or inactive, clear it from the category
      console.log(`Clearing expired offer from category ${category._id}: Offer ${category.offer._id} expired on ${category.offer.endDate}`);
      await Category.findByIdAndUpdate(category._id, {
        $set: { offer: null }
      });
    }
  }

  return [...productOffers, ...categoryOffers];
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

  const originalPrice = product.salePrice || product.regularPrice;
  const now = new Date();

  // Get all valid offers for the product
  const offers = await getValidOffersForProduct(product);

  // Double-check each offer to ensure it's not expired
  const validOffers = offers.filter(offer => {
    return offer.isActive && offer.startDate <= now && offer.endDate >= now;
  });

  if (validOffers.length === 0) {
    return {
      hasOffer: false,
      originalPrice,
      finalPrice: originalPrice,
      discountAmount: 0,
      discountPercentage: 0,
      offer: null
    };
  }

  // Calculate discount for each offer and find the best one
  let bestOffer = null;
  let maxDiscount = 0;

  for (const offer of validOffers) {
    const discountAmount = offer.calculateDiscount(originalPrice);

    if (discountAmount > maxDiscount) {
      maxDiscount = discountAmount;
      bestOffer = offer;
    }
  }

  const finalPrice = originalPrice - maxDiscount;
  const discountPercentage = (maxDiscount / originalPrice) * 100;

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
