const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");




const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const query = search
      ? { name: { $regex: search, $options: "i" } }
      : {};

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
      search: search,
    });
  } catch (error) {
    console.error("Error in categoryInfo:", error);
    res.redirect("/pageerror");
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
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

const getListCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const getUnlistCategory = async (req, res) => {
  try {
    let id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.query.id;
    const category = await Category.findOne({ _id: id });
    res.render("edit-category", { category: category });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};
const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryName, description } = req.body;

    // Validate input
    if (!categoryName) {
      return res.status(400).json({ error: "Category name is required" });
    }

    // Check for existing category with the same name (excluding current category)
    const existingCategory = await Category.findOne({ 
      name: categoryName,
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    // Update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: categoryName,
        description: description || "", // Default to empty string if undefined
      },
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Return success response
    return res.status(200).json({ 
      message: "Category updated successfully",
      category: updatedCategory 
    });

  } catch (error) {
    console.error("Error in editCategory:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Delete all products associated with this category
    await Product.deleteMany({ category: categoryId });

    // Delete the category
    await Category.findByIdAndDelete(categoryId);

    // Send a JSON response
    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);

    // Send a JSON error response
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  getListCategory,
  getUnlistCategory,
  getEditCategory,
  editCategory,
  deleteCategory,
};





