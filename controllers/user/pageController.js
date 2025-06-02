/**
 * Page Controller
 */

const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');

//=================================================================================================
// Update All Product Statuses
//=================================================================================================
// This function updates the status of all products.
// It updates the status of all products.
//=================================================================================================
async function updateAllProductStatuses() {
  try {
    const products = await Product.find({});

    for (const product of products) {
      if (product.quantity > 0 && product.status !== "Available") {
        product.status = "Available";
        await product.save();
      } else if (product.quantity <= 0 && product.status !== "Out of Stock") {
        product.status = "Out of Stock";
        await product.save();
      }
    }
  } catch (error) {
    console.error("Error updating product statuses:", error);
  }
}

//=================================================================================================
// Page Not Found
//=================================================================================================
// This function renders the page not found page.
// It renders the page not found page.
//=================================================================================================
const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

//=================================================================================================
// Load Home
//=================================================================================================
// This function loads the home page.
// It loads the home page.
//=================================================================================================
const loadHome = async (req, res) => {
  try {
    await updateAllProductStatuses();

    const userId = req.session.user;
    const userData = await User.findById(userId);
    const now = new Date();
    const offerService = require('../../services/newOfferService');

    const products = await Product.find({
      isBlocked: false
    })
    .populate('offer')
    .populate('category')
    .sort({ createdAt: -1 })
    .limit(8);

    for (const product of products) {
      if (product.offer && (product.offer.endDate < now || !product.offer.isActive)) {
        await Product.findByIdAndUpdate(product._id, {
          $set: {
            offer: null,
            productOffer: false,
            offerPercentage: 0,
            offerType: null,
            offerEndDate: null
          }
        });
        product.offer = null;
        product.productOffer = false;
        product.offerPercentage = 0;
        product.offerType = null;
        product.offerEndDate = null;
      }
    }

    const processedProducts = await Promise.all(products.map(async (product) => {
      const basePrice = product.price || 0;
      const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);
      const hasOffer = offerResult.hasOffer;
      const finalPrice = offerResult.finalPrice;
      const discountAmount = offerResult.discountAmount;
      const bestOffer = offerResult.offer;
      const discountPercentage = hasOffer ? (discountAmount / basePrice) * 100 : 0;

      let offerInfo = null;
      if (hasOffer && bestOffer) {
        offerInfo = {
          name: bestOffer.name,
          type: bestOffer.type,
          discountType: bestOffer.discountType,
          discountValue: bestOffer.discountValue,
          endDate: bestOffer.endDate,
          createdAt: bestOffer.createdAt
        };
      }

      return {
        ...product.toObject({ virtuals: true }),
        finalPrice,
        displayPrice: finalPrice,
        price: basePrice,
        hasOffer,
        discount: discountPercentage,
        discountAmount: discountAmount,
        discountType: bestOffer ? bestOffer.discountType : null,
        originalPrice: hasOffer ? basePrice : null,
        offerInfo: offerInfo
      };
    }));

    res.render("home", {
      user: userData,
      products: processedProducts
    });
  } catch (error) {
    console.log("Home not found", error);
    res.status(500).send("server error");
  }
};

//=================================================================================================
// Load Landing Page
//=================================================================================================
// This function loads the landing page.
// It loads the landing page.
//=================================================================================================
const loadLandingpage = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/home");
    }
    return res.render("landing");
  } catch (error) {
    console.log("Landing page not found", error);
    res.status(500).send("server error");
  }
};

//=================================================================================================
// Load Sign Up Page
//=================================================================================================
// This function loads the sign up page.
// It loads the sign up page.
//=================================================================================================
const loadSignUppage = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    console.log("signup not found");
    res.status(500).send("server error");
  }
};

//=================================================================================================
// Load Shop
//=================================================================================================
// This function loads the shop page.
// It loads the shop page.
//=================================================================================================
const loadShop = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const now = new Date();
    const offerService = require('../../services/newOfferService');
    const {
      search = '',
      sort = 'default',
      category = 'all',
      min_price = 0,
      max_price = 2000,
      page = 1
    } = req.query;

    let query = {
      isBlocked: false
      // Include all products regardless of status
    };

    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }


    if (category !== 'all') {
      let categoryArray = Array.isArray(category) ? category : category.split(',');
      const categories = await Category.find({
        name: { $in: categoryArray.map(cat => new RegExp(`^${cat}$`, 'i')) },
        isListed: true // Only listed categories
      });
      if (categories.length > 0) {
        query.category = { $in: categories.map(cat => cat._id) };
      } else {

        query.category = { $in: [] };
      }
    } else {

      const listedCategories = await Category.find({ isListed: true });
      query.category = { $in: listedCategories.map(cat => cat._id) };
    }

    if (min_price || max_price) {
      query.price = { $gte: parseFloat(min_price), $lte: parseFloat(max_price) };
    }

    let sortOption = {};
    switch (sort) {
      case 'price_asc': sortOption = { price: 1 }; break;
      case 'price_desc': sortOption = { price: -1 }; break;
      case 'name_asc': sortOption = { productName: 1 }; break;
      case 'name_desc': sortOption = { productName: -1 }; break;
      default: sortOption = { createdAt: -1 };
    }

    const perPage = 9;
    const skip = (page - 1) * perPage;


    const products = await Product.find(query)
      .populate('category')
      .populate('offer')
      .sort(sortOption)
      .skip(skip)
      .limit(perPage);

    // Update product statuses based on quantity and check for expired offers
    for (const product of products) {
      let needsUpdate = false;

      // Check quantity for status update
      if (product.quantity > 0 && product.status !== "Available") {
        product.status = "Available";
        needsUpdate = true;
      } else if (product.quantity <= 0 && product.status !== "Out of Stock") {
        product.status = "Out of Stock";
        needsUpdate = true;
      }

      // Check for expired offers
      if (product.offer && (product.offer.endDate < now || !product.offer.isActive)) {
        console.log(`Found expired offer on product ${product._id} during shop page load`);
        product.offer = null;
        product.productOffer = false;
        product.offerPercentage = 0;
        product.offerEndDate = null;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await product.save();
        console.log(`Updated product ${product.productName} (${product._id})`);
      }
    }

    const listedCategories = await Category.find({ isListed: true });
    const recommendedProducts = await Product.find({
      isBlocked: false,
      category: { $in: listedCategories.map(cat => cat._id) } // Only from listed categories
    })
      .populate('category')
      .populate('offer')
      .sort({ createdAt: -1 })
      .limit(4);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / perPage);

    const productData = await Promise.all(products.map(async (product) => {
      // Ensure price is available and not zero
      if (!product.price || product.price === 0) {
        console.log("Warning: Product has no price or price is zero:", product._id);
      }

      const basePrice = product.price || 0;

      // Get the best offer for this product (either product or category offer)
      const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

      // Extract offer information
      const hasOffer = offerResult.hasOffer;
      const finalPrice = offerResult.finalPrice;
      const discountAmount = offerResult.discountAmount;
      const bestOffer = offerResult.offer;

      // Calculate discount percentage
      const discountPercentage = hasOffer ? (discountAmount / basePrice) * 100 : 0;

      // Format offer information if available
      let offerInfo = null;
      if (hasOffer && bestOffer) {
        offerInfo = {
          name: bestOffer.name,
          type: bestOffer.type, // 'product' or 'category'
          discountType: bestOffer.discountType,
          discountValue: bestOffer.discountValue,
          endDate: bestOffer.endDate,
          createdAt: bestOffer.createdAt
        };
      }

      // Log the offer information for debugging
      console.log(`Shop product ${product.productName} (${product._id}) offer info:`, {
        hasOffer,
        offerType: offerInfo?.type,
        discountPercentage: discountPercentage.toFixed(2) + '%',
        originalPrice: basePrice,
        finalPrice
      });

      return {
        _id: product._id,
        name: product.productName,
        image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
        category: product.category?.name || 'Uncategorized',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        discountAmount: discountAmount,
        discountType: bestOffer ? bestOffer.discountType : null,
        hasOffer: hasOffer,
        offerInfo: offerInfo,
        offerName: hasOffer && bestOffer ? bestOffer.name : null,
        offerType: hasOffer && bestOffer ? bestOffer.type : null,
        quantity: product.quantity,
        isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
      };
    }));

    const recommendedProductData = await Promise.all(recommendedProducts.map(async (product) => {
      // Ensure price is available and not zero
      if (!product.price || product.price === 0) {
        console.log("Warning: Recommended product has no price or price is zero:", product._id);
      }

      const basePrice = product.price || 0;

      // Get the best offer for this product (either product or category offer)
      const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

      // Extract offer information
      const hasOffer = offerResult.hasOffer;
      const finalPrice = offerResult.finalPrice;
      const discountAmount = offerResult.discountAmount;
      const bestOffer = offerResult.offer;

      // Calculate discount percentage
      const discountPercentage = hasOffer ? (discountAmount / basePrice) * 100 : 0;

      // Format offer information if available
      let offerInfo = null;
      if (hasOffer && bestOffer) {
        offerInfo = {
          name: bestOffer.name,
          type: bestOffer.type, // 'product' or 'category'
          discountType: bestOffer.discountType,
          discountValue: bestOffer.discountValue,
          endDate: bestOffer.endDate,
          createdAt: bestOffer.createdAt
        };
      }

      // Log the offer information for debugging
      console.log(`Recommended product ${product.productName} (${product._id}) offer info:`, {
        hasOffer,
        offerType: offerInfo?.type,
        discountPercentage: discountPercentage.toFixed(2) + '%',
        originalPrice: basePrice,
        finalPrice
      });

      return {
        _id: product._id,
        name: product.productName,
        image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
        category: product.category?.name || 'Uncategorized',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        discountAmount: discountAmount,
        discountType: bestOffer ? bestOffer.discountType : null,
        hasOffer: hasOffer,
        offerInfo: offerInfo,
        offerName: hasOffer && bestOffer ? bestOffer.name : null,
        offerType: hasOffer && bestOffer ? bestOffer.type : null,
        quantity: product.quantity,
        isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
      };
    }));

    res.render("shop", {
      user: userData,
      products: productData,
      recommendedProducts: recommendedProductData,
      categories: listedCategories,
      query: req.query,
      currentPage: parseInt(page),
      totalPages,
      totalProducts
    });
  } catch (error) {
    console.log("Error loading shop:", error.message);
    res.redirect("/pageNotFound");
  }
};

//=================================================================================================
// Load Product Detail
//=================================================================================================
// This function loads the product detail page.
// It loads the product detail page.
//=================================================================================================
const loadProductDetail = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.params.id;
    const now = new Date();
    const offerService = require('../../services/newOfferService');
    const Review = require('../../models/reviewSchema');


    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    const product = await Product.findById(productId)
      .populate('category')
      .populate('offer');

    if (!product) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    // Check for expired offers
    if (product.offer && (product.offer.endDate < now || !product.offer.isActive)) {
      console.log(`Found expired offer on product ${product._id} during product detail page load`);
      product.offer = null;
      product.productOffer = false;
      product.offerPercentage = 0;
      product.offerEndDate = null;
      await product.save();
    }

    // Update product status based on quantity to ensure consistency
    if (product.quantity > 0 && product.status !== "Available") {
      product.status = "Available";
      await product.save();
      console.log(`Updated product status to Available for ${product.productName} (${product._id})`);
    } else if (product.quantity <= 0 && product.status !== "Out of Stock") {
      product.status = "Out of Stock";
      await product.save();
      console.log(`Updated product status to Out of Stock for ${product.productName} (${product._id})`);
    }

    // Ensure price is available and not zero
    if (!product.price || product.price === 0) {
      console.log("Warning: Product has no price or price is zero:", product._id);
    }

    const basePrice = product.price || 0;

    // Get the best offer for this product (either product or category offer)
    const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

    // Extract offer information
    const hasOffer = offerResult.hasOffer;
    const finalPrice = offerResult.finalPrice;
    const discountAmount = offerResult.discountAmount;
    const bestOffer = offerResult.offer;

    // Calculate discount percentage
    const discountPercentage = hasOffer ? (discountAmount / basePrice) * 100 : 0;

    // Format offer information if available
    let offerInfo = null;
    if (hasOffer && bestOffer) {
      offerInfo = {
        name: bestOffer.name,
        type: bestOffer.type, // 'product' or 'category'
        discountType: bestOffer.discountType,
        discountValue: bestOffer.discountValue,
        endDate: bestOffer.endDate,
        createdAt: bestOffer.createdAt
      };
    }

    // Log the offer information for debugging
    console.log(`Product detail ${product.productName} (${product._id}) offer info:`, {
      hasOffer,
      offerType: offerInfo?.type,
      discountPercentage: discountPercentage.toFixed(2) + '%',
      originalPrice: basePrice,
      finalPrice
    });

    // Fetch reviews for this product
    const reviews = await Review.find({
      product: productId,
      isBlocked: false
    })
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .limit(5); // Show latest 5 reviews on product page

    // Calculate rating distribution
    const allReviews = await Review.find({ product: productId, isBlocked: false });
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };

    allReviews.forEach(review => {
      ratingDistribution[review.rating]++;
    });

    const productData = {
      _id: product._id,
      name: product.productName,
      description: product.description,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      gallery: product.productImage.map(img => `/uploads/product-images/${img}`),
      category: product.category?.name || 'Uncategorized',
      price: basePrice,
      displayPrice: finalPrice,
      originalPrice: hasOffer ? basePrice : null,
      discount: discountPercentage,
      discountAmount: discountAmount,
      discountType: bestOffer ? bestOffer.discountType : null,
      hasOffer: hasOffer,
      offerInfo: offerInfo,
      stock: product.quantity,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000),
      rating: product.averageRating || 0,
      reviewCount: product.reviewCount || 0,
      coupons: [], // Placeholder
      highlights: [], // Placeholder
      specifications: {}, // Placeholder
      longDescription: product.description,
      reviews: reviews,
      ratingDistribution: ratingDistribution,
      isBlocked: product.isBlocked, // Pass blocked status
      status: product.status // Pass availability status
    };

    // Fetch related products
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isBlocked: false
    })
      .sort({ popularityScore: -1 })
      .limit(4)
      .select('productName productImage price offerPercentage productOffer createdAt status quantity');

    // Update related product statuses based on quantity
    for (const related of relatedProducts) {
      if (related.quantity > 0 && related.status !== "Available") {
        related.status = "Available";
        await related.save();
        console.log(`Updated related product status to Available for ${related.productName} (${related._id})`);
      } else if (related.quantity <= 0 && related.status !== "Out of Stock") {
        related.status = "Out of Stock";
        await related.save();
        console.log(`Updated related product status to Out of Stock for ${related.productName} (${related._id})`);
      }
    }

    const relatedProductsData = await Promise.all(relatedProducts.map(async (related) => {
      // Ensure price is available and not zero
      if (!related.price || related.price === 0) {
        console.log("Warning: Related product has no price or price is zero:", related._id);
      }

      const basePrice = related.price || 0;

      // Get the best offer for this product (either product or category offer)
      const offerResult = await offerService.getBestOfferForProduct(related._id, basePrice);

      // Extract offer information
      const hasOffer = offerResult.hasOffer;
      const finalPrice = offerResult.finalPrice;
      const discountAmount = offerResult.discountAmount;
      const bestOffer = offerResult.offer;

      // Calculate discount percentage
      const discountPercentage = hasOffer ? (discountAmount / basePrice) * 100 : 0;

      // Format offer information if available
      let offerInfo = null;
      if (hasOffer && bestOffer) {
        offerInfo = {
          name: bestOffer.name,
          type: bestOffer.type, // 'product' or 'category'
          discountType: bestOffer.discountType,
          discountValue: bestOffer.discountValue,
          endDate: bestOffer.endDate,
          createdAt: bestOffer.createdAt
        };
      }

      // Log the offer information for debugging
      console.log(`Related product ${related.productName} (${related._id}) offer info:`, {
        hasOffer,
        offerType: offerInfo?.type,
        discountPercentage: discountPercentage.toFixed(2) + '%',
        originalPrice: basePrice,
        finalPrice
      });

      return {
        _id: related._id,
        name: related.productName,
        image: related.productImage && related.productImage.length > 0 ? `/uploads/product-images/${related.productImage[0]}` : '/images/placeholder.jpg',
        category: related.category?.name || 'Uncategorized',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        discountAmount: discountAmount,
        discountType: bestOffer ? bestOffer.discountType : null,
        hasOffer: hasOffer,
        offerInfo: offerInfo,
        offerName: hasOffer && bestOffer ? bestOffer.name : null,
        offerType: hasOffer && bestOffer ? bestOffer.type : null,
        rating: related.averageRating || 0,
        reviewCount: 0,
        isNew: (Date.now() - new Date(related.createdAt)) < (7 * 24 * 60 * 60 * 1000),
        status: related.status || "Available",
        quantity: related.quantity || 0
      };
    }));

    res.render("product-detail", {
      user: userData,
      product: productData,
      relatedProducts: relatedProductsData
    });
  } catch (error) {
    console.log("Error loading product detail:", error.message);
    res.render("product-detail", { product: null, relatedProducts: [] });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the page controller functions.
// It exports the page controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  pageNotFound,
  loadHome,
  loadLandingpage,
  loadSignUppage,
  loadShop,
  loadProductDetail
};
