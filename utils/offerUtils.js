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
    if (offer && offer.isActive && offer.startDate <= now && offer.endDate >= now) {
      productOffers.push(offer);
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
  
  // Get all valid offers for the product
  const offers = await getValidOffersForProduct(product);
  
  if (offers.length === 0) {
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
  
  for (const offer of offers) {
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
