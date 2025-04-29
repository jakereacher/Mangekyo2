const express = require("express");
const router = express.Router();
const { uploadsArray, uploadsFields } = require("../helpers/multer");

// Controllers
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");

// Middleware
const { adminAuth } = require("../middlewares/auth");

// Admin Authentication Routes
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminAuth, adminController.logout);

// User Management Routes
router.get("/users", adminAuth, customerController.customerInfo);
router.get("/blockCustomer", adminAuth, customerController.customerBlocked);
router.get("/unblockCustomer", adminAuth, customerController.customerunBlocked);

// Category Management Routes
router.get("/category", adminAuth, categoryController.categoryInfo);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.get("/listCategory", adminAuth, categoryController.getListCategory);
router.get("/unlistCategory", adminAuth, categoryController.getUnlistCategory);
router.get("/editCategory", adminAuth, categoryController.getEditCategory);
router.post("/editCategory/:id", adminAuth, categoryController.editCategory);
router.post("/delete-category/:id", adminAuth, categoryController.deleteCategory);

// Product Management Routes
router.get("/products", adminAuth, productController.getProductList);
router.get("/add-products", adminAuth, productController.getProductAddPage);
router.post("/add-products", adminAuth, uploadsArray, productController.addProducts);
router.get("/edit-product/:id", adminAuth, productController.getEditProductPage);
router.post("/edit-product/:id", adminAuth, uploadsFields, productController.editProduct);
router.post("/delete-product/:id", adminAuth, productController.deleteProduct);
router.post("/toggle-block-product/:id", adminAuth, productController.toggleBlockProduct);


// Order Management Routes
router.get("/orders",adminAuth, orderController.getAllOrders);
router.get("/orders/:orderId",adminAuth, orderController.getAdminOrderDetails);
router.post("/orders/:orderId/update-status",adminAuth, orderController.updateOrderItemStatus);
router.get("/return-requests",adminAuth, orderController.getReturnRequests);
router.post("/orders/:orderId/approve-return",adminAuth, orderController.approveReturn);
router.post("/orders/:orderId/reject-return",adminAuth, orderController.rejectReturn);

// Catch-All for Undefined Admin Routes
router.use((req, res) => {
  res.status(404).render("admin/error", {
    message: "Page not found in admin panel",
  });
});

module.exports = router;