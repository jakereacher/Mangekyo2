const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');

const pageNotFound = async (req, res) => {
  try {
    res.render("page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadHome = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const products = await Product.find({ 
      isBlocked: false,
      status: "Available" 
    })
    .sort({ createdAt: -1 })
    .limit(8);

    res.render("home", { 
      user: userData,
      products: products
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
      isBlocked: false,
      status: "Available"
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
      query.salePrice = { $gte: parseFloat(min_price), $lte: parseFloat(max_price) };
    }

    let sortOption = {};
    switch (sort) {
      case 'price_asc': sortOption = { salePrice: 1 }; break;
      case 'price_desc': sortOption = { salePrice: -1 }; break;
      case 'name_asc': sortOption = { productName: 1 }; break;
      case 'name_desc': sortOption = { productName: -1 }; break;
      default: sortOption = { createdAt: -1 };
    }

    const perPage = 9;
    const skip = (page - 1) * perPage;

   
    const products = await Product.find(query)
      .populate('category')
      .sort(sortOption)
      .skip(skip)
      .limit(perPage);


    const listedCategories = await Category.find({ isListed: true });
    const recommendedProducts = await Product.find({
      isBlocked: false,
      status: "Available",
      category: { $in: listedCategories.map(cat => cat._id) } // Only from listed categories
    })
      .populate('category')
      .sort({ createdAt: -1 })
      .limit(4);

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / perPage);

    const productData = products.map(product => ({
      _id: product._id, 
      name: product.productName,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
    }));

    const recommendedProductData = recommendedProducts.map(product => ({
      _id: product._id,  
      name: product.productName,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
      isNew: (Date.now() - new Date(product.createdAt)) < (7 * 24 * 60 * 60 * 1000)
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

const loadProductDetail = async (req, res) => {
  try {
    const userId = req.session.user;
    const userData = await User.findById(userId);
    const productId = req.params.id;


    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

    const product = await Product.findById(productId)
      .populate('category');

    if (!product) {
      return res.render("product-detail", { product: null, relatedProducts: [] });
    }

   
    const productData = {
      _id: product._id,
      name: product.productName,
      description: product.description,
      image: product.productImage && product.productImage.length > 0 ? `/uploads/product-images/${product.productImage[0]}` : '/images/placeholder.jpg',
      gallery: product.productImage.map(img => `/uploads/product-images/${img}`),
      category: product.category?.name || 'Uncategorized',
      price: product.salePrice,
      originalPrice: product.regularPrice,
      discount: product.offerPercentage > 0 ? product.offerPercentage : 0,
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
      isBlocked: false,
      status: "Available"
    })
      .sort({ popularityScore: -1 })
      .limit(4)
      .select('productName productImage salePrice regularPrice offerPercentage createdAt');

    const relatedProductsData = relatedProducts.map(related => ({
      _id: related._id,
      name: related.productName,
      image: related.productImage && related.productImage.length > 0 ? `/uploads/product-images/${related.productImage[0]}` : '/images/placeholder.jpg',
      price: related.salePrice,
      originalPrice: related.regularPrice,
      discount: related.offerPercentage > 0 ? related.offerPercentage : 0,
      rating: related.averageRating || 0,
      reviewCount: 0,
      isNew: (Date.now() - new Date(related.createdAt)) < (7 * 24 * 60 * 60 * 1000)
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
