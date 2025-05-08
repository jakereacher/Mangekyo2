const mongoose = require('mongoose');
const Offer = require('../models/offerSchema');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const offerService = require('../services/offerService');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/mangeyko')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Test function to create a product offer
async function createProductOffer() {
  try {
    // Get a product to apply the offer to
    const product = await Product.findOne({ isBlocked: false }).sort({ createdAt: -1 });
    
    if (!product) {
      console.log('No products found');
      return;
    }
    
    console.log(`Selected product: ${product.productName}`);
    
    // Create a product offer
    const offer = new Offer({
      name: 'Test Product Offer',
      description: 'Test product offer with 10% discount',
      type: 'product',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableProducts: [product._id]
    });
    
    await offer.save();
    console.log('Product offer created:', offer);
    
    // Apply the offer to the product
    await offerService.applyProductOffer(product._id, offer._id);
    console.log('Offer applied to product');
    
    // Test calculating the best offer price
    const originalPrice = product.salePrice;
    const offerResult = await offerService.getBestOfferForProduct(product._id, originalPrice);
    
    console.log('Original price:', originalPrice);
    console.log('Discounted price:', offerResult.finalPrice);
    console.log('Discount amount:', offerResult.discountAmount);
    
    return offer;
  } catch (error) {
    console.error('Error creating product offer:', error);
  }
}

// Test function to create a category offer
async function createCategoryOffer() {
  try {
    // Get a category to apply the offer to
    const category = await Category.findOne({ isListed: true }).sort({ createdAt: -1 });
    
    if (!category) {
      console.log('No categories found');
      return;
    }
    
    console.log(`Selected category: ${category.name}`);
    
    // Create a category offer
    const offer = new Offer({
      name: 'Test Category Offer',
      description: 'Test category offer with 15% discount',
      type: 'category',
      discountType: 'percentage',
      discountValue: 15,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableCategories: [category._id]
    });
    
    await offer.save();
    console.log('Category offer created:', offer);
    
    // Apply the offer to the category
    await offerService.applyCategoryOffer(category._id, offer._id);
    console.log('Offer applied to category');
    
    // Test calculating the best offer price for a product in this category
    const product = await Product.findOne({ category: category._id, isBlocked: false });
    
    if (product) {
      const originalPrice = product.salePrice;
      const offerResult = await offerService.getBestOfferForProduct(product._id, originalPrice);
      
      console.log('Product:', product.productName);
      console.log('Original price:', originalPrice);
      console.log('Discounted price:', offerResult.finalPrice);
      console.log('Discount amount:', offerResult.discountAmount);
    }
    
    return offer;
  } catch (error) {
    console.error('Error creating category offer:', error);
  }
}

// Test function to test offer conflict resolution
async function testOfferConflict() {
  try {
    // Get a product to apply offers to
    const product = await Product.findOne({ isBlocked: false }).populate('category').sort({ createdAt: -1 });
    
    if (!product) {
      console.log('No products found');
      return;
    }
    
    console.log(`Selected product: ${product.productName}`);
    console.log(`Category: ${product.category.name}`);
    
    // Create a product offer (10%)
    const productOffer = new Offer({
      name: 'Test Product Offer',
      description: 'Test product offer with 10% discount',
      type: 'product',
      discountType: 'percentage',
      discountValue: 10,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableProducts: [product._id]
    });
    
    await productOffer.save();
    await offerService.applyProductOffer(product._id, productOffer._id);
    console.log('Product offer created and applied');
    
    // Create a category offer (15%)
    const categoryOffer = new Offer({
      name: 'Test Category Offer',
      description: 'Test category offer with 15% discount',
      type: 'category',
      discountType: 'percentage',
      discountValue: 15,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      applicableCategories: [product.category._id]
    });
    
    await categoryOffer.save();
    await offerService.applyCategoryOffer(product.category._id, categoryOffer._id);
    console.log('Category offer created and applied');
    
    // Test calculating the best offer price
    const originalPrice = product.salePrice;
    const offerResult = await offerService.getBestOfferForProduct(product._id, originalPrice);
    
    console.log('Original price:', originalPrice);
    console.log('Best offer price:', offerResult.finalPrice);
    console.log('Best discount amount:', offerResult.discountAmount);
    console.log('Best offer type:', offerResult.offer.type);
    console.log('Best offer value:', offerResult.offer.discountValue + '%');
    
    return { productOffer, categoryOffer, offerResult };
  } catch (error) {
    console.error('Error testing offer conflict:', error);
  }
}

// Run the tests
async function runTests() {
  try {
    console.log('=== Testing Product Offer ===');
    await createProductOffer();
    
    console.log('\n=== Testing Category Offer ===');
    await createCategoryOffer();
    
    console.log('\n=== Testing Offer Conflict Resolution ===');
    await testOfferConflict();
    
    console.log('\nAll tests completed');
    process.exit(0);
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();
