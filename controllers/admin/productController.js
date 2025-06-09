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
    const productExists = await Product.findOne({ productName: products.productName });

    if (!productExists) {
      const images = [];


if (req.files && req.files.length > 0) {
  for (let i = 0; i < req.files.length; i++) {
    const imagePath = path.join("public", "uploads", "product-images", req.files[i].filename);

    try {
      await fs.promises.rename(req.files[i].path, imagePath);
      images.push(req.files[i].filename);
    } catch (error) {
      console.error(`Error saving image: ${error.message}`);
    }
  }
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
        productImage: images,
        status: status,
      });+

      await newProduct.save();
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
        const removedIndices = JSON.parse(req.body.removedImages);
        console.log("Removed indices:", removedIndices);
        console.log("Current product images:", product.productImage);

        // Process each image in the original array
        for (let i = 0; i < product.productImage.length; i++) {
          const currentImage = product.productImage[i];

          // If this index is marked for removal, delete the file
          if (removedIndices.includes(parseInt(i))) {
            if (currentImage && typeof currentImage === 'string' && currentImage.trim() !== '') {
              const imagePath = path.join("public", "uploads", "product-images", currentImage);
              try {
                await fs.promises.unlink(imagePath);
                console.log(`Successfully deleted image: ${imagePath}`);
              } catch (unlinkError) {
                console.warn(`Failed to delete image ${imagePath}: ${unlinkError.message}`);
              }
            }
          } else {
            // Keep this image if it's valid
            if (currentImage && typeof currentImage === 'string' && currentImage.trim() !== '') {
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

    // Validate that we have at least one image
    if (uniqueImages.length < 1) {
      return res.redirect(`/admin/edit-product/${productId}?error=Product+must+have+at+least+one+image`);
    }

    product.productImage = uniqueImages;

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