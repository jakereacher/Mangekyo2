const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const getProductAddPage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true });
    const error = req.query.error || null;
    res.render("product-add", { cat: category, error });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

const addProducts = async (req, res) => {
  try {
    const products = req.body;
    const productExists = await Product.findOne({ productName: products.productName });

    if (!productExists) {
      const images = [];


if (req.files && req.files.length > 0) {
  for (let i = 0; i < req.files.length; i++) {
    const imagePath = path.join("public", "uploads", "product-images", req.files[i].filename);

    // Move the uploaded file to the desired folder
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

      // Set status based on quantity
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
    console.error("Error saving product:", error);
    return res.redirect("/admin/pageerror");
  }
};

const getProductList = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    // Build search query
    const searchQuery = search
      ? {
          $or: [
            { productName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        }
      : {};

    // Count total products matching the search
    const totalProducts = await Product.countDocuments(searchQuery);

    // Fetch products with populated category and offer
    const products = await Product.find(searchQuery)
      .populate("category")
      .populate("offer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Process products to include offer information
    const productsWithOffers = products.map(product => {
      const hasOffer = product.productOffer && product.offer;
      // Handle price fields with fallbacks
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

    // Build search params for pagination links
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
    console.error("Error fetching products:", error);
    res.redirect("/admin/pageerror");
  }
};

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
          console.warn(`Failed to delete image ${imagePath}: ${unlinkError.message}`);
        }
      }
    }

    await Product.findByIdAndDelete(productId);
    return res.redirect("/admin/products");
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.redirect("/admin/pageerror");
  }
};

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

const editProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const products = req.body;
    const product = await Product.findById(productId);

    if (!product) {
      return res.redirect("/admin/products?error=Product+not+found");
    }

    // Handle removed images
    // Create a completely new array for existing images
    let existingImages = [];

    // Only if removedImages is present in the request
    if (req.body.removedImages) {
      try {
        const removedIndices = JSON.parse(req.body.removedImages);

        // Loop through the original product images
        for (let i = 0; i < product.productImage.length; i++) {
          // If this index is NOT in the removedIndices array, keep the image
          if (!removedIndices.includes(parseInt(i))) {
            existingImages.push(product.productImage[i]);
          }
          // If this index IS in the removedIndices array, delete the file
          else if (product.productImage[i]) {
            const imagePath = path.join("public", "uploads", "product-images", product.productImage[i]);
            try {
              await fs.promises.unlink(imagePath);
              console.log(`Deleted image: ${imagePath}`);
            } catch (unlinkError) {
              console.warn(`Failed to delete image ${imagePath}: ${unlinkError.message}`);
            }
          }
        }
      } catch (error) {
        console.error("Error processing removed images:", error);
        // If there's an error, don't modify the images array
        existingImages = [...product.productImage];
      }
    } else {
      // If no removedImages in request, keep all existing images
      existingImages = [...product.productImage];
    }

    // Process new images
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

    // Create a completely new array for the product images
    const finalImages = [];

    // Add only valid existing images
    for (const img of existingImages) {
      if (img && typeof img === 'string' && img.trim() !== '') {
        finalImages.push(img);
      }
    }

    // Add only valid new images
    for (const img of newImages) {
      if (img && typeof img === 'string' && img.trim() !== '') {
        finalImages.push(img);
      }
    }

    // Directly set the product's image array to our new clean array
    // This completely replaces the old array, removing any references to deleted images
    product.productImage = finalImages;

    // Require at least one image
    if (product.productImage.length < 1) {
      return res.redirect(`/admin/edit-product/${productId}?error=Product+must+have+at+least+one+image`);
    }

    const categoryId = await Category.findOne({ name: products.category });
    if (!categoryId) {
      return res.redirect(`/admin/edit-product/${productId}?error=Invalid+category+name`);
    }

    product.productName = products.productName;
    product.description = products.description;
    product.category = categoryId._id;
    product.price = products.price;
    product.quantity = products.quantity;

    // Automatically update status based on quantity
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

module.exports = {
  getProductAddPage,
  addProducts,
  getProductList,
  deleteProduct,
  toggleBlockProduct,
  getEditProductPage,
  editProduct,
};