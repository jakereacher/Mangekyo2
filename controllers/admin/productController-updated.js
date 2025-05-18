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
    
    // Render the add product page
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
      const uploadDir = path.join(__dirname, '../../public/uploads/product-images');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Process each image
      for (const file of req.files) {
        const filename = `product_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${path.basename(file.originalname)}`;
        
        // Resize and save image
        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside' })
          .toFile(path.join(uploadDir, filename));
        
        images.push(filename);
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
      quantity: stock || 0,
      brand: brand || '',
      sku: sku || '',
      productImage: images,
      isBlocked: !(isListed === 'on' || isListed === true)
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
    res.render("admin/product-edit-updated", {
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
    let images = [...(product.productImage || [])];
    
    // Handle removed images
    if (removedImages) {
      try {
        const removedIndices = JSON.parse(removedImages);
        
        // Remove images from filesystem
        for (const index of removedIndices) {
          if (images[index]) {
            const imagePath = path.join(__dirname, '../../public/uploads/product-images', images[index]);
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
          }
        }
        
        // Filter out removed images
        images = images.filter((_, index) => !removedIndices.includes(parseInt(index)));
      } catch (error) {
        console.error("Error processing removed images:", error);
      }
    }

    // Process new images
    if (req.files && req.files.length > 0) {
      // Create directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../public/uploads/product-images');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Process each image
      for (const file of req.files) {
        const filename = `product_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${path.basename(file.originalname)}`;
        
        // Resize and save image
        await sharp(file.buffer)
          .resize(800, 800, { fit: 'inside' })
          .toFile(path.join(uploadDir, filename));
        
        images.push(filename);
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
      quantity: stock || 0,
      brand: brand || '',
      sku: sku || '',
      productImage: images,
      isBlocked: !(isListed === 'on' || isListed === true)
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
    if (product.productImage && product.productImage.length > 0) {
      for (const image of product.productImage) {
        const imagePath = path.join(__dirname, '../../public/uploads/product-images', image);
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
    
    // Toggle isBlocked status
    product.isBlocked = !product.isBlocked;
    await product.save();
    
    // Send success response
    res.status(200).json({ 
      success: true, 
      message: `Product ${product.isBlocked ? 'deactivated' : 'activated'} successfully`,
      isListed: !product.isBlocked
    });
  } catch (error) {
    console.error("Error in toggleBlockProduct:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getProductAddPage,
  addProducts,
  getProductList: require('./productController').getProductList, // Use existing function
  getEditProductPage,
  editProduct,
  deleteProduct,
  toggleBlockProduct
};
