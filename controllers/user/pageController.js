const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');

// Function to update all product statuses based on quantity
async function updateAllProductStatuses() {
  try {
    const products = await Product.find({});
    let updatedCount = 0;

    for (const product of products) {
      if (product.quantity > 0 && product.status !== "Available") {
        product.status = "Available";
        await product.save();
        updatedCount++;
        console.log(`Updated product status to Available for ${product.productName} (${product._id})`);
      } else if (product.quantity <= 0 && product.status !== "Out of Stock") {
        product.status = "Out of Stock";
        await product.save();
        updatedCount++;
        console.log(`Updated product status to Out of Stock for ${product.productName} (${product._id})`);
      }
    }

    console.log(`Updated ${updatedCount} product statuses`);
  } catch (error) {
    console.error("Error updating product statuses:", error);
  }
}

const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadHome = async (req, res) => {
  try {
    // Update all product statuses based on quantity
    await updateAllProductStatuses();

    const userId = req.session.user;
    const userData = await User.findById(userId);

    // Fetch products with populated offer information
    const products = await Product.find({
      isBlocked: false
    })
    .populate('offer')
    .populate('category')
    .sort({ createdAt: -1 })
    .limit(8);

    // Process products to include offer information
    const processedProducts = products.map(product => {
      // Log the product price for debugging
      console.log("Home product price data:", {
        id: product._id,
        productName: product.productName,
        price: product.price,
        toJSON: product.toJSON ? product.toJSON().price : 'N/A',
        toObject: product.toObject ? product.toObject().price : 'N/A'
      });

      // Ensure price is available and not zero
      if (!product.price || product.price === 0) {
        console.log("Warning: Product has no price or price is zero:", product._id);
      }

      // Calculate final price after offer
      const basePrice = product.price || 0;
      let discountPercentage = 0;
      let hasOffer = false;
      let finalPrice = basePrice;

      // Check if product has an offer
      if (product.productOffer && product.offer) {
        hasOffer = true;

        // Get discount percentage based on offer type
        if (product.offer.discountType === 'percentage') {
          discountPercentage = product.offer.discountValue;
        } else if (product.offer.discountType === 'fixed') {
          // For fixed discount, calculate percentage based on price
          discountPercentage = (product.offer.discountValue / basePrice) * 100;
        }

        // Calculate final price with discount
        if (product.offer.discountType === 'percentage') {
          finalPrice = basePrice * (1 - product.offer.discountValue / 100);
        } else {
          finalPrice = basePrice - product.offer.discountValue;
          if (finalPrice < 0) finalPrice = 0;
        }
      } else {
        // Use offerPercentage as fallback
        discountPercentage = product.offerPercentage || 0;
        hasOffer = product.productOffer && discountPercentage > 0;
        finalPrice = hasOffer ? basePrice * (1 - discountPercentage / 100) : basePrice;
      }

      return {
        ...product.toObject({ virtuals: true }),
        finalPrice,
        displayPrice: finalPrice,
        price: basePrice,
        hasOffer,
        discount: discountPercentage,
        originalPrice: hasOffer ? basePrice : null
      };
    });

    res.render("home", {
      user: userData,
      products: processedProducts
    });
  } catch (error) {
    console.log("Home not found", error);
    res.status(500).send("server error");
  }
};

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

const loadSignUppage = async (req, res) => {
  try {
    return res.render("signup");
  } catch (error) {
    console.log("signup not found");
    res.status(500).send("server error");
  }
};

const loadShop = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
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

    // Update product statuses based on quantity
    for (const product of products) {
      if (product.quantity > 0 && product.status !== "Available") {
        product.status = "Available";
        await product.save();
        console.log(`Updated product status to Available for ${product.productName} (${product._id})`);
      } else if (product.quantity <= 0 && product.status !== "Out of Stock") {
        product.status = "Out of Stock";
        await product.save();
        console.log(`Updated product status to Out of Stock for ${product.productName} (${product._id})`);
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

    const productData = products.map(product => {
      // Log the product price for debugging
      console.log("Shop product price data:", {
        id: product._id,
        productName: product.productName,
        price: product.price,
        toJSON: product.toJSON ? product.toJSON().price : 'N/A',
        toObject: product.toObject ? product.toObject().price : 'N/A'
      });

      // Ensure price is available and not zero
      if (!product.price || product.price === 0) {
        console.log("Warning: Product has no price or price is zero:", product._id);
      }

      // Calculate final price after offer
      const basePrice = product.price || 0;
      let discountPercentage = 0;
      let hasOffer = false;
      let finalPrice = basePrice;

      // Check if product has an offer
      if (product.productOffer && product.offer) {
        hasOffer = true;

        // Get discount percentage based on offer type
        if (product.offer.discountType === 'percentage') {
          discountPercentage = product.offer.discountValue;
        } else if (product.offer.discountType === 'fixed') {
          // For fixed discount, calculate percentage based on price
          discountPercentage = (product.offer.discountValue / basePrice) * 100;
        }

        // Calculate final price with discount
        if (product.offer.discountType === 'percentage') {
          finalPrice = basePrice * (1 - product.offer.discountValue / 100);
        } else {
          finalPrice = basePrice - product.offer.discountValue;
          if (finalPrice < 0) finalPrice = 0;
        }
      } else {
        // Use offerPercentage as fallback
        discountPercentage = product.offerPercentage || 0;
        hasOffer = product.productOffer && discountPercentage > 0;
        finalPrice = hasOffer ? basePrice * (1 - discountPercentage / 100) : basePrice;
      }

      return {
        _id: product._id,
        name: product.productName,
        image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
        category: product.category?.name || 'Uncategorized',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        hasOffer: hasOffer,
        offerName: hasOffer && product.offer ? product.offer.name : null,
        offerType: hasOffer && product.offer ? product.offer.type : null,
        isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
      };
    });

    const recommendedProductData = recommendedProducts.map(product => {
      // Log the product price for debugging
      console.log("Recommended product price data:", {
        id: product._id,
        productName: product.productName,
        price: product.price,
        toJSON: product.toJSON ? product.toJSON().price : 'N/A',
        toObject: product.toObject ? product.toObject().price : 'N/A'
      });

      // Ensure price is available and not zero
      if (!product.price || product.price === 0) {
        console.log("Warning: Recommended product has no price or price is zero:", product._id);
      }

      // Calculate final price after offer
      const basePrice = product.price || 0;
      let discountPercentage = 0;
      let hasOffer = false;
      let finalPrice = basePrice;

      // Check if product has an offer
      if (product.productOffer && product.offer) {
        hasOffer = true;

        // Get discount percentage based on offer type
        if (product.offer.discountType === 'percentage') {
          discountPercentage = product.offer.discountValue;
        } else if (product.offer.discountType === 'fixed') {
          // For fixed discount, calculate percentage based on price
          discountPercentage = (product.offer.discountValue / basePrice) * 100;
        }

        // Calculate final price with discount
        if (product.offer.discountType === 'percentage') {
          finalPrice = basePrice * (1 - product.offer.discountValue / 100);
        } else {
          finalPrice = basePrice - product.offer.discountValue;
          if (finalPrice < 0) finalPrice = 0;
        }
      } else {
        // Use offerPercentage as fallback
        discountPercentage = product.offerPercentage || 0;
        hasOffer = product.productOffer && discountPercentage > 0;
        finalPrice = hasOffer ? basePrice * (1 - discountPercentage / 100) : basePrice;
      }

      return {
        _id: product._id,
        name: product.productName,
        image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
        category: product.category?.name || 'Uncategorized',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        hasOffer: hasOffer,
        offerName: hasOffer && product.offer ? product.offer.name : null,
        offerType: hasOffer && product.offer ? product.offer.type : null,
        isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
      };
    });

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

const loadProductDetail = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.params.id;


    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    const product = await Product.findById(productId)
      .populate('category')
      .populate('offer');

    if (!product) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
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

    // Log the product price for debugging
    console.log("Product price data:", {
      id: product._id,
      productName: product.productName,
      price: product.price,
      toJSON: product.toJSON ? product.toJSON().price : 'N/A',
      toObject: product.toObject ? product.toObject().price : 'N/A'
    });

    // Ensure price is available and not zero
    if (!product.price || product.price === 0) {
      console.log("Warning: Product has no price or price is zero:", product._id);
    }

    // Calculate final price after offer
    const basePrice = product.price || 0;
    let discountPercentage = 0;
    let hasOffer = false;
    let finalPrice = basePrice;

    // Check if product has an offer
    if (product.productOffer && product.offer) {
      hasOffer = true;

      // Get discount percentage based on offer type
      if (product.offer.discountType === 'percentage') {
        discountPercentage = product.offer.discountValue;
      } else if (product.offer.discountType === 'fixed') {
        // For fixed discount, calculate percentage based on price
        discountPercentage = (product.offer.discountValue / basePrice) * 100;
      }

      // Calculate final price with discount
      if (product.offer.discountType === 'percentage') {
        finalPrice = basePrice * (1 - product.offer.discountValue / 100);
      } else {
        finalPrice = basePrice - product.offer.discountValue;
        if (finalPrice < 0) finalPrice = 0;
      }
    } else {
      // Use offerPercentage as fallback
      discountPercentage = product.offerPercentage || 0;
      hasOffer = product.productOffer && discountPercentage > 0;
      finalPrice = hasOffer ? basePrice * (1 - discountPercentage / 100) : basePrice;
    }

    // Format offer information
    let offerInfo = null;
    if (hasOffer && product.offer) {
      offerInfo = {
        name: product.offer.name,
        type: product.offer.type,
        discountType: product.offer.discountType,
        discountValue: product.offer.discountValue,
        endDate: product.offerEndDate
      };
    }

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
      hasOffer: hasOffer,
      offerInfo: offerInfo,
      stock: product.quantity,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000),
      rating: product.averageRating || 0,
      reviewCount: 0, // Placeholder
      coupons: [], // Placeholder
      highlights: [], // Placeholder
      specifications: {}, // Placeholder
      longDescription: product.description,
      reviews: [], // Placeholder
      ratingDistribution: null, // Placeholder
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

      // Get the full product with offer details
      const fullProduct = await Product.findById(related._id).populate('offer');

      // Calculate final price after offer
      const basePrice = related.price || 0;
      let discountPercentage = related.offerPercentage || 0;
      let hasOffer = related.productOffer && discountPercentage > 0;
      let finalPrice = basePrice;

      // If we have the full product with offer details
      if (fullProduct && fullProduct.productOffer && fullProduct.offer) {
        hasOffer = true;

        // Get discount percentage based on offer type
        if (fullProduct.offer.discountType === 'percentage') {
          discountPercentage = fullProduct.offer.discountValue;
        } else if (fullProduct.offer.discountType === 'fixed') {
          // For fixed discount, calculate percentage based on price
          discountPercentage = (fullProduct.offer.discountValue / basePrice) * 100;
        }

        // Calculate final price with discount
        if (fullProduct.offer.discountType === 'percentage') {
          finalPrice = basePrice * (1 - fullProduct.offer.discountValue / 100);
        } else {
          finalPrice = basePrice - fullProduct.offer.discountValue;
          if (finalPrice < 0) finalPrice = 0;
        }
      } else {
        // Use offerPercentage as fallback
        finalPrice = hasOffer ? basePrice * (1 - discountPercentage / 100) : basePrice;
      }

      return {
        _id: related._id,
        name: related.productName,
        image: related.productImage && related.productImage.length > 0 ? `/uploads/product-images/${related.productImage[0]}` : '/images/placeholder.jpg',
        price: basePrice,
        displayPrice: finalPrice,
        originalPrice: hasOffer ? basePrice : null,
        discount: discountPercentage,
        hasOffer: hasOffer,
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

module.exports = {
  pageNotFound,
  loadHome,
  loadLandingpage,
  loadSignUppage,
  loadShop,
  loadProductDetail
};
