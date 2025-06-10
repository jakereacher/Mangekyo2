/**
 * Product Controller
 */

const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

//=================================================================================================
// Get Product Add Page
//=================================================================================================
// This function gets the product add page.
// It displays the product add page.
//=================================================================================================
const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true });
    const error = req.query.error || null;
    res.render("product-add", { cat: category, error });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Add Products
//=================================================================================================
// This function adds a new product to the database.
// It validates the product data and creates a new product object.
//=================================================================================================
const addProducts = async (req, res) => {
  try {
    const products = req.body;
    console.log("Add Product - Request body:", products);
    console.log("Add Product - Files received:", req.files ? req.files.length : 0);

    // Debug: Log detailed information about each file received
    if (req.files && req.files.length > 0) {
      console.log("=== DETAILED FILE ANALYSIS ===");
      req.files.forEach((file, index) => {
        console.log(`File ${index + 1}:`, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size,
          path: file.path
        });
      });
    }

    const productExists = await Product.findOne({ productName: products.productName });

    if (!productExists) {
      const images = [];

      if (req.files && req.files.length > 0) {
        console.log("Add Product - Processing files:", req.files.map(f => f.filename));

        // Use Sets to track processed files and prevent duplicates
        const processedFilenames = new Set();
        const processedSizes = new Set();
        const processedCombinations = new Set();

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          console.log(`Processing file ${i + 1}:`, {
            filename: file.filename,
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          });

          // Skip empty files or files with 0 size
          if (!file || file.size === 0) {
            console.log(`Skipping empty file at index ${i}`);
            continue;
          }

          // Create a unique identifier for this file (size + original name)
          const fileIdentifier = `${file.originalname}_${file.size}`;

          // Skip if we've already processed this exact file
          if (processedCombinations.has(fileIdentifier)) {
            console.log(`🚨 Skipping duplicate file: ${file.originalname} (${file.size} bytes)`);
            continue;
          }

          // Skip if we've already processed this filename
          if (processedFilenames.has(file.filename)) {
            console.log(`Skipping duplicate filename: ${file.filename}`);
            continue;
          }

          // Validate file type
          const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
          if (!validTypes.includes(file.mimetype)) {
            console.log(`Skipping invalid file type: ${file.mimetype} for file ${file.filename}`);
            continue;
          }

          const imagePath = path.join("public", "uploads", "product-images", file.filename);

          try {
            await fs.promises.rename(file.path, imagePath);
            images.push(file.filename);
            processedFilenames.add(file.filename);
            processedSizes.add(file.size);
            processedCombinations.add(fileIdentifier);
            console.log(`✅ Successfully processed image: ${file.filename}`);
          } catch (error) {
            console.error(`❌ Error saving image: ${error.message}`);
          }
        }
      }

      // Remove any potential duplicates from the final array
      const uniqueImages = [...new Set(images)];
      console.log("Add Product - Original images array:", images);
      console.log("Add Product - Final unique images array:", uniqueImages);
      console.log("Add Product - Removed duplicates:", images.length - uniqueImages.length);

      // Additional validation: ensure we have valid images
      if (uniqueImages.length === 0) {
        console.log("❌ No valid images to save");
        return res.redirect("/admin/add-products?error=Please+upload+at+least+one+valid+image");
      }

      if (uniqueImages.length < 3) {
        console.log(`⚠️  Only ${uniqueImages.length} unique images found, but 3 are recommended`);
      }

      const categoryId = await Category.findOne({ name: products.category });
      if (!categoryId) {
        return res.redirect("/admin/add-products?error=Invalid+category+name");
      }

      const status = products.quantity > 0 ? "Available" : "Out of Stock";

      const newProduct = new Product({
        productName: products.productName,
        description: products.description,
        category: categoryId._id,
        price: products.price,
        createdOn: new Date(),
        quantity: products.quantity,
        productImage: uniqueImages,
        status: status,
      });+

      await newProduct.save();
      console.log("Add Product - Product saved with images:", newProduct.productImage);
      return res.redirect("/admin/add-products");
    } else {
      return res.redirect("/admin/add-products?error=Product+already+exists");
    }
  } catch (error) {
    return res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Get Product List
//=================================================================================================
// This function gets the product list with pagination.
// It displays the product list in the products page.
//=================================================================================================
const getProductList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const searchQuery = search
      ? {
          $or: [
            { productName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    const totalProducts = await Product.countDocuments(searchQuery);

    const products = await Product.find(searchQuery)
      .populate("category")
      .populate("offer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const productsWithOffers = products.map(product => {
      const hasOffer = product.productOffer && product.offer;
      const price = product.price || product.salePrice || product.regularPrice || 0;
      const finalPrice = product.finalPrice || price;
      const discountAmount = hasOffer ? (price - finalPrice) : 0;
      const discountPercentage = product.offerPercentage || 0;

      return {
        ...product.toObject({ virtuals: true }),
        hasOffer,
        price,
        finalPrice,
        discountAmount,
        discountPercentage,
        offerName: hasOffer ? product.offer.name : null,
        offerType: hasOffer ? product.offer.type : null,
        offerEndDate: product.offerEndDate
      };
    });

    const searchParams = search ? `&search=${encodeURIComponent(search)}` : '';
    const searchParamsWithoutLimit = search ? `&search=${encodeURIComponent(search)}` : '';

    const error = req.query.error || null;
    res.render("products", {
      products: productsWithOffers,
      error,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalItems: totalProducts,
        limit: limit,
        searchParams: searchParams,
        searchParamsWithoutLimit: searchParamsWithoutLimit
      }
    });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Delete Product
//=================================================================================================
// This function deletes a product from the database.
// It deletes the product from the database.
//=================================================================================================
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.redirect("/admin/products?error=Product+not+found");
    }

    if (product.productImage && product.productImage.length > 0) {
      for (const image of product.productImage) {
        const imagePath = path.join("public", "uploads", "product-images", image);
        try {
          await fs.promises.unlink(imagePath);
        } catch (unlinkError) {
          // Failed to delete image - continue silently
        }
      }
    }

    await Product.findByIdAndDelete(productId);
    return res.redirect("/admin/products");
  } catch (error) {
    return res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Toggle Block Product
//=================================================================================================
// This function toggles the block status of a product.
// It updates the block status of the product in the database.
//=================================================================================================
const toggleBlockProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);

    if (!product) {
      return res.redirect("/admin/products?error=Product+not+found");
    }

    product.isBlocked = !product.isBlocked;
    await product.save();

    return res.redirect("/admin/products");
  } catch (error) {
    console.error("Error toggling product block status:", error);
    return res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Get Edit Product Page
//=================================================================================================
// This function gets the edit product page.
// It displays the edit product page.
//=================================================================================================
const getEditProductPage = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate("category");
    const categories = await Category.find({ isListed: true });

    if (!product) {
      return res.redirect("/admin/products?error=Product+not+found");
    }

    const error = req.query.error || null;
    res.render("edit-product", { product, categories, error });
  } catch (error) {
    console.error("Error fetching product for edit:", error);
    return res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Edit Product
//=================================================================================================
// This function edits a product.
// It updates the product in the database.
//=================================================================================================
const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const products = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.redirect("/admin/products?error=Product+not+found");
    }

    let existingImages = [];

    if (req.body.removedImages) {
      try {
        const removedImageNames = JSON.parse(req.body.removedImages);
        console.log("Removed image names:", removedImageNames);
        console.log("Current product images:", product.productImage);

        // Process each image in the original array
        for (const currentImage of product.productImage) {
          if (currentImage && typeof currentImage === 'string' && currentImage.trim() !== '') {
            // If this image is marked for removal, delete the file from filesystem
            if (removedImageNames.includes(currentImage)) {
              const imagePath = path.join("public", "uploads", "product-images", currentImage);
              try {
                // Check if file exists before attempting to delete
                await fs.promises.access(imagePath);
                await fs.promises.unlink(imagePath);
                console.log(`Successfully deleted image file: ${imagePath}`);
              } catch (unlinkError) {
                if (unlinkError.code === 'ENOENT') {
                  console.warn(`Image file not found (already deleted): ${imagePath}`);
                } else {
                  console.warn(`Failed to delete image ${imagePath}: ${unlinkError.message}`);
                }
              }
            } else {
              // Keep this image if it's not marked for removal
              existingImages.push(currentImage);
            }
          }
        }

        console.log("Existing images after removal:", existingImages);
      } catch (error) {
        console.error("Error processing removed images:", error);
        // Fallback: keep all existing images if there's an error
        existingImages = product.productImage.filter(img => img && typeof img === 'string' && img.trim() !== '');
      }
    } else {
      // No images to remove, filter out any empty/invalid images
      existingImages = product.productImage.filter(img => img && typeof img === 'string' && img.trim() !== '');
    }

    const validTypes = ['image/jpeg', 'image/png'];
    const newImages = [];
    const imageFields = ['image1', 'image2', 'image3', 'image4'];

    for (let i = 0; i < imageFields.length; i++) {
      const fieldName = imageFields[i];
      const files = req.files && req.files[fieldName];
      const file = files && files[0];

      if (file) {
        if (!validTypes.includes(file.mimetype)) {
          return res.redirect(`/admin/edit-product/${productId}?error=Only+JPG+or+PNG+files+are+allowed`);
        }

        const originalImagePath = file.path;
        const resizedImagePath = path.join(
          "public",
          "uploads",
          "product-images",
          "resized_" + file.filename
        );

        await sharp(originalImagePath)
          .resize({ width: 440, height: 440 })
          .toFile(resizedImagePath);

        newImages.push("resized_" + file.filename);

        try {
          await fs.promises.unlink(originalImagePath);
        } catch (unlinkError) {
          console.warn(`Failed to delete original image ${originalImagePath}: ${unlinkError.message}`);
        }
      }
    }

    // Combine existing and new images, ensuring all are valid
    const finalImages = [];

    // Add existing images (already filtered)
    for (const img of existingImages) {
      if (img && typeof img === 'string' && img.trim() !== '') {
        finalImages.push(img);
      }
    }

    // Add new images
    for (const img of newImages) {
      if (img && typeof img === 'string' && img.trim() !== '') {
        finalImages.push(img);
      }
    }

    // Remove any duplicate images
    const uniqueImages = [...new Set(finalImages)];

    console.log("Final unique images:", uniqueImages);
    console.log("Original product images before update:", product.productImage);

    // Validate that we have at least one image
    if (uniqueImages.length < 1) {
      return res.redirect(`/admin/edit-product/${productId}?error=Product+must+have+at+least+one+image`);
    }

    // Update the product images
    product.productImage = uniqueImages;
    console.log("Product images after update:", product.productImage);

    const categoryId = await Category.findOne({ name: products.category });
    if (!categoryId) {
      return res.redirect(`/admin/edit-product/${productId}?error=Invalid+category+name`);
    }

    product.productName = products.productName;
    product.description = products.description;
    product.category = categoryId._id;
    product.price = products.price;
    product.quantity = products.quantity;

    if (product.quantity > 0) {
      product.status = "Available";
    } else {
      product.status = "Out of Stock";
    }

    await product.save();
    console.log("Product saved successfully with images:", product.productImage);

    // Verify the product was saved correctly by fetching it again
    const savedProduct = await Product.findById(productId);
    console.log("Verification - Product images in database:", savedProduct.productImage);

    return res.redirect("/admin/products");
  } catch (error) {
    console.error("Error updating product:", error);
    return res.redirect(`/admin/edit-product/${req.params.id}?error=Update+failed`);
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the product controller functions.
// It exports the product controller functions to be used in the admin routes.
//=================================================================================================
module.exports = {
  getProductAddPage,
  addProducts,
  getProductList,
  deleteProduct,
  toggleBlockProduct,
  getEditProductPage,
  editProduct,
};