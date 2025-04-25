const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create directories if they don't exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configure storage for different upload types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath;
    
    if (file.fieldname === "profileImage") {
      uploadPath = path.join(__dirname, "../public/uploads/profile-pics");
    } else {
      uploadPath = path.join(__dirname, "../public/uploads/product-images");
    }
    
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure different upload methods
const uploadsArray = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb);
  }
}).array("images[]", 4);

const uploadProfileImage = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "profileImage") {
      checkFileType(file, cb);
    } else {
      // Allow non-file fields to pass through
      cb(null, false);
    }
  }
}).single("profileImage")

const uploadsFields = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb);
  }
}).fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "image3", maxCount: 1 },
  { name: "image4", maxCount: 1 },
]);

// Helper function to check file type
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only images (JPEG, JPG, PNG, WEBP) are allowed"));
  }
}

module.exports = { uploadsArray, uploadsFields, uploadProfileImage };