/**
 * Script to fix products with null categories
 * This script finds products with null or invalid category references and fixes them
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    fixNullCategories();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

async function fixNullCategories() {
  try {
    console.log('Starting null category fix...');

    // Find all products
    const allProducts = await Product.find({});
    console.log(`Found ${allProducts.length} total products`);

    // Find products with null categories
    const productsWithNullCategories = await Product.find({
      $or: [
        { category: null },
        { category: { $exists: false } }
      ]
    });

    console.log(`Found ${productsWithNullCategories.length} products with null categories`);

    // Find products with invalid category references
    const productsWithCategories = await Product.find({
      category: { $ne: null, $exists: true }
    }).populate('category');

    const productsWithInvalidCategories = productsWithCategories.filter(product => !product.category);
    console.log(`Found ${productsWithInvalidCategories.length} products with invalid category references`);

    // Get or create a default category
    let defaultCategory = await Category.findOne({ name: 'Uncategorized' });
    if (!defaultCategory) {
      defaultCategory = new Category({
        name: 'Uncategorized',
        description: 'Default category for products without a valid category',
        isListed: true
      });
      await defaultCategory.save();
      console.log('Created default "Uncategorized" category');
    }

    // Fix products with null categories
    if (productsWithNullCategories.length > 0) {
      const result = await Product.updateMany(
        {
          $or: [
            { category: null },
            { category: { $exists: false } }
          ]
        },
        { $set: { category: defaultCategory._id } }
      );
      console.log(`Updated ${result.modifiedCount} products with null categories`);
    }

    // Fix products with invalid category references
    if (productsWithInvalidCategories.length > 0) {
      for (const product of productsWithInvalidCategories) {
        await Product.findByIdAndUpdate(product._id, {
          $set: { category: defaultCategory._id }
        });
        console.log(`Fixed invalid category reference for product: ${product.productName} (${product._id})`);
      }
    }

    console.log('Null category fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing null categories:', error);
    process.exit(1);
  }
}
