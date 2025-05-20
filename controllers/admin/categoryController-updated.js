const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Render the category management page
 */
const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    // Fetch categories with populated offer
    const categories = await Category.find(query)
      .populate("offer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Count total categories for pagination
    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    // Get product counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const productCount = await Product.countDocuments({ category: category._id });
        return {
          ...category.toObject(),
          productCount
        };
      })
    );

    // Get top categories by product count
    const topCategories = await Category.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "category",
          as: "products"
        }
      },
      {
        $project: {
          name: 1,
          productCount: { $size: "$products" }
        }
      },
      { $sort: { productCount: -1 } },
      { $limit: 5 }
    ]);

    // Render the updated category page
    res.render("admin/category-updated", {
      categories: categoriesWithCounts,
      topCategories,
      currentPage: page,
      totalPages,
      search
    });
  } catch (error) {
    console.error("Error in categoryInfo:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get category by ID (for edit modal)
 */
const getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    console.error("Error in getCategoryById:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Add a new category
 */
const addCategory = async (req, res) => {
  try {
    const { name, description, isListed } = req.body;

    // Validate input
    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Validate that category name contains only letters and spaces
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(name)) {
      return res.status(400).json({ error: "Category name can only contain letters and spaces (no numbers or special characters)" });
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Process image if uploaded
    let imagePath = null;
    if (req.file) {
      // Create directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../public/uploads/categories');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Generate unique filename
      const filename = `category_${Date.now()}_${path.basename(req.file.originalname)}`;
      imagePath = `/uploads/categories/${filename}`;

      // Resize and save image
      await sharp(req.file.buffer)
        .resize(800, 600, { fit: 'inside' })
        .toFile(path.join(uploadDir, filename));
    }

    // Create new category
    const newCategory = new Category({
      name,
      description: description || "",
      image: imagePath,
      isListed: isListed === 'on' || isListed === true
    });

    await newCategory.save();

    // Redirect back to category page
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error in addCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Update category listing status
 */
const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error in getListCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error in getUnlistCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Edit category
 */
const editCategory = async (req, res) => {
  try {
    const id = req.params.id || req.body.categoryId;
    const { categoryName, description, isListed } = req.body;

    // Validate input
    if (!categoryName) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Validate that category name contains only letters and spaces
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(categoryName)) {
      return res.status(400).json({ error: "Category name can only contain letters and spaces (no numbers or special characters)" });
    }

    // Check for existing category with the same name (excluding current category)
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Process image if uploaded
    let updateData = {
      name: categoryName,
      description: description || "",
      isListed: isListed === 'on' || isListed === true
    };

    if (req.file) {
      // Create directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../public/uploads/categories');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Generate unique filename
      const filename = `category_${Date.now()}_${path.basename(req.file.originalname)}`;
      const imagePath = `/uploads/categories/${filename}`;

      // Resize and save image
      await sharp(req.file.buffer)
        .resize(800, 600, { fit: 'inside' })
        .toFile(path.join(uploadDir, filename));

      // Add image path to update data
      updateData.image = imagePath;

      // Delete old image if exists
      const category = await Category.findById(id);
      if (category && category.image) {
        const oldImagePath = path.join(__dirname, '../../public', category.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    // Update the category
    await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Redirect back to category page
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error in editCategory:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Delete category
 */
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Find the category to get the image path
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Update products to remove this category
    await Product.updateMany(
      { category: categoryId },
      { $unset: { category: "" } }
    );

    // Delete the category image if it exists
    if (category.image) {
      const imagePath = path.join(__dirname, '../../public', category.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete the category
    await Category.findByIdAndDelete(categoryId);

    // Send a JSON response
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  getCategoryById,
  getListCategory,
  getUnlistCategory,
  editCategory,
  deleteCategory,
};
