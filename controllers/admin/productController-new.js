const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/**
 * Render the add product page
 */
const getProductAddPage = async (req, res) => {
  try {
    // Get all active categories
    const categories = await Category.find({ isListed: true });
    
    // Render the new add product page
    res.render("admin/product-add-new", { 
      categories,
      error: req.query.error || null 
    });
  } catch (error) {
    console.error("Error in getProductAddPage:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Add a new product
 */
const addProducts = async (req, res) => {
  try {
    const {
      productName,
      category,
      description,
      price,
      stock,
      brand,
      sku,
      isListed
    } = req.body;

    // Validate required fields
    if (!productName || !category || !description || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if product with same name already exists
    const productExists = await Product.findOne({ 
      productName: { $regex: new RegExp(`^${productName}$`, 'i') }
    });

    if (productExists) {
      return res.status(400).json({ error: "Product with this name already exists" });
    }

    // Process images
    const images = [];
    if (req.files && req.files.length > 0) {
      // Create directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../public/uploads/products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Process each image
      for (const file of req.files) {
        const filename = `product_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${path.basename(file.originalname)}`;
        const imagePath = `/uploads/products/${filename}`;
        
        // Resize and save image
        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside' })
          .toFile(path.join(uploadDir, filename));
        
        images.push(imagePath);
      }
    }

    // Create slug from product name
    const slug = productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Create new product
    const newProduct = new Product({
      productName,
      slug,
      category,
      description,
      price,
      stock: stock || 0,
      brand: brand || '',
      sku: sku || '',
      images,
      isListed: isListed === 'on' || isListed === true
    });

    await newProduct.save();
    
    // Redirect to products page
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error in addProducts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Render the product list page
 */
const getProductList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const category = req.query.category || "";
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : null;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : null;
    const stock = req.query.stock || "";
    const sortBy = req.query.sortBy || "createdAt_desc";

    // Build query
    let query = {};
    
    // Search
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } }
      ];
    }
    
    // Category
    if (category) {
      query.category = category;
    }
    
    // Price range
    if (minPrice !== null || maxPrice !== null) {
      query.price = {};
      if (minPrice !== null) query.price.$gte = minPrice;
      if (maxPrice !== null) query.price.$lte = maxPrice;
    }
    
    // Stock status
    if (stock) {
      switch (stock) {
        case 'in_stock':
          query.stock = { $gt: 0 };
          break;
        case 'low_stock':
          query.stock = { $gt: 0, $lte: 10 };
          break;
        case 'out_of_stock':
          query.stock = { $lte: 0 };
          break;
      }
    }
    
    // Sort options
    const sortOptions = {};
    const [sortField, sortOrder] = sortBy.split('_');
    sortOptions[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Get products
    const products = await Product.find(query)
      .populate('category')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Count total products for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    // Get all categories for filter
    const categories = await Category.find({ isListed: true });

    // Build query string for pagination
    const queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    if (category) queryParams.append('category', category);
    if (minPrice) queryParams.append('minPrice', minPrice);
    if (maxPrice) queryParams.append('maxPrice', maxPrice);
    if (stock) queryParams.append('stock', stock);
    if (sortBy) queryParams.append('sortBy', sortBy);
    const queryString = queryParams.toString() ? `&${queryParams.toString()}` : '';

    // Render the products page
    res.render("admin/products", {
      products,
      categories,
      currentPage: page,
      totalPages,
      search,
      selectedCategory: category,
      minPrice,
      maxPrice,
      stock,
      sortBy,
      queryString
    });
  } catch (error) {
    console.error("Error in getProductList:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Render the edit product page
 */
const getEditProductPage = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Get product details
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Get all active categories
    const categories = await Category.find({ isListed: true });
    
    // Render the edit product page
    res.render("admin/product-edit-new", {
      product,
      categories,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("Error in getEditProductPage:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Update a product
 */
const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      productName,
      category,
      description,
      price,
      stock,
      brand,
      sku,
      isListed,
      existingImages,
      removedImages
    } = req.body;

    // Validate required fields
    if (!productName || !category || !description || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if product with same name already exists (excluding current product)
    const productExists = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, 'i') },
      _id: { $ne: productId }
    });

    if (productExists) {
      return res.status(400).json({ error: "Product with this name already exists" });
    }

    // Get current product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Handle existing images
    let images = [];
    if (existingImages) {
      // If existingImages is an array, use it directly
      if (Array.isArray(existingImages)) {
        images = existingImages;
      } 
      // If it's a single value, convert to array
      else {
        images = [existingImages];
      }
    }

    // Handle removed images
    if (removedImages) {
      const removedIndices = JSON.parse(removedImages);
      
      // Remove images from filesystem
      for (const index of removedIndices) {
        if (product.images[index]) {
          const imagePath = path.join(__dirname, '../../public', product.images[index]);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }
      
      // Filter out removed images
      images = product.images.filter((_, index) => !removedIndices.includes(index));
    } else {
      // If no removedImages specified, keep all existing images
      images = product.images;
    }

    // Process new images
    if (req.files && req.files.length > 0) {
      // Create directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../public/uploads/products');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Process each image
      for (const file of req.files) {
        const filename = `product_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${path.basename(file.originalname)}`;
        const imagePath = `/uploads/products/${filename}`;
        
        // Resize and save image
        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside' })
          .toFile(path.join(uploadDir, filename));
        
        images.push(imagePath);
      }
    }

    // Create slug from product name
    const slug = productName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Update product
    await Product.findByIdAndUpdate(productId, {
      productName,
      slug,
      category,
      description,
      price,
      stock: stock || 0,
      brand: brand || '',
      sku: sku || '',
      images,
      isListed: isListed === 'on' || isListed === true
    });
    
    // Redirect to products page
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error in editProduct:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Delete a product
 */
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Delete product images
    if (product.images && product.images.length > 0) {
      for (const image of product.images) {
        const imagePath = path.join(__dirname, '../../public', image);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
    }
    
    // Delete product
    await Product.findByIdAndDelete(productId);
    
    // Send success response
    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error in deleteProduct:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Toggle product listing status
 */
const toggleBlockProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Toggle isListed status
    product.isListed = !product.isListed;
    await product.save();
    
    // Send success response
    res.status(200).json({ 
      success: true, 
      message: `Product ${product.isListed ? 'activated' : 'deactivated'} successfully`,
      isListed: product.isListed
    });
  } catch (error) {
    console.error("Error in toggleBlockProduct:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getProductAddPage,
  addProducts,
  getProductList,
  getEditProductPage,
  editProduct,
  deleteProduct,
  toggleBlockProduct
};
