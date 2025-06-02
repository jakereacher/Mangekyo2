/**
 * Category Controller
 * Handles category management operations including listing, adding, editing, and deleting categories
 */

const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

//=================================================================================================
// Category Info
//=================================================================================================
// This function gets the category information with pagination.
// It displays the category information in the category page.
//=================================================================================================
const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    const categoryData = await Category.find(query)
      .populate("offer")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const categoriesWithOffers = categoryData.map(category => {
      const hasOffer = category.offer !== null;

      return {
        ...category.toObject(),
        hasOffer,
        offerName: hasOffer ? category.offer.name : null,
        offerType: hasOffer ? category.offer.type : null,
        discountPercentage: category.categoryOffer || 0,
        offerEndDate: category.offerEndDate
      };
    });

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    const searchParams = search ? `&search=${encodeURIComponent(search)}` : '';
    const searchParamsWithoutLimit = search ? `&search=${encodeURIComponent(search)}` : '';

    res.render("category", {
      cat: categoriesWithOffers,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search: search,
      limit: limit,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalCategories,
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
// Add Category
//=================================================================================================
// This function adds a new category to the database.
// It validates the category data and creates a new category object.
//=================================================================================================
const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {

    if (!name) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(name)) {
      return res.status(400).json({ error: "Category name can only contain letters and spaces (no numbers or special characters)" });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const newCategory = new Category({
      name,
      description,
    });
    await newCategory.save();
    return res.json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Error in addCategory:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
};

//=================================================================================================
// Get List Category
//=================================================================================================
// This function gets the list of categories.
// It displays the list of categories in the category page.
//=================================================================================================
const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//=================================================================================================
// Get Unlist Category
//=================================================================================================
// This function gets the unlisted category.
// It displays the unlisted category in the category page.
//=================================================================================================
const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//=================================================================================================
// Get Edit Category
//=================================================================================================
// This function gets the edit category.
// It displays the edit category in the category page.
//=================================================================================================
const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findOne({ _id: id });
    res.render("edit-category", { category: category });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Edit Category
//=================================================================================================
// This function edits the category.
// It updates the category in the database.
//=================================================================================================
const editCategory = async (req, res) => {
  try {
    const id = req.params.id || req.body.categoryId;
    const { categoryName, description, isListed } = req.body;

    if (!categoryName) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(categoryName)) {
      return res.status(400).json({ error: "Category name can only contain letters and spaces (no numbers or special characters)" });
    }

    const existingCategory = await Category.findOne({
      name: categoryName,
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: categoryName,
        description: description || "", // Default to empty string if undefined
        isListed: isListed === true || isListed === 'on' || isListed === 'true'
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    return res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory
    });

  } catch (error) {
    console.error("Error in editCategory:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//=================================================================================================
// Delete Category
//=================================================================================================
// This function deletes the category.
// It deletes the category from the database.
//=================================================================================================
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    await Product.deleteMany({ category: categoryId });

    await Category.findByIdAndDelete(categoryId);

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);

    res.status(500).json({ error: "Internal server error" });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the category controller functions.
// It exports the category controller functions to be used in the admin routes.
//=================================================================================================
module.exports = {
  categoryInfo,
  addCategory,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  deleteCategory,
};
