const fs = require('fs');
const path = require('path');

// Function to check if image files exist
function checkImagePaths() {
  const uploadsDir = path.join(__dirname, 'public', 'uploads', 'product-images');
  
  console.log('🔍 Checking image paths and files...\n');
  
  // Check if uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    console.log('❌ Uploads directory does not exist:', uploadsDir);
    console.log('📁 Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory created successfully\n');
  } else {
    console.log('✅ Uploads directory exists:', uploadsDir);
    
    // List files in uploads directory
    try {
      const files = fs.readdirSync(uploadsDir);
      console.log(`📸 Found ${files.length} image files:`);
      files.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file}`);
      });
      console.log('');
    } catch (error) {
      console.log('❌ Error reading uploads directory:', error.message);
    }
  }
  
  // Check static file serving configuration
  console.log('🌐 Static file serving configuration:');
  console.log('   - app.use(express.static("public")) ✅');
  console.log('   - app.use("/uploads", express.static(path.join(__dirname, "public/uploads"))) ✅');
  console.log('');
  
  // Check image path formats in templates
  console.log('🔗 Image path formats to use:');
  console.log('   ✅ Correct: /uploads/product-images/filename.jpg');
  console.log('   ❌ Incorrect: uploads/product-images/filename.jpg (missing leading slash)');
  console.log('');
  
  // AWS deployment tips
  console.log('☁️  AWS Deployment Tips:');
  console.log('   1. Ensure all image paths start with "/" for absolute paths');
  console.log('   2. Check that public/uploads directory is included in deployment');
  console.log('   3. Verify file permissions on AWS server (755 for directories, 644 for files)');
  console.log('   4. Consider using AWS S3 for image storage in production');
  console.log('   5. Test image URLs directly: https://yourdomain.com/uploads/product-images/filename.jpg');
  console.log('');
  
  console.log('🚀 Deployment checklist:');
  console.log('   □ All image paths use absolute paths (start with "/")');
  console.log('   □ public/uploads directory exists and has proper permissions');
  console.log('   □ Static file serving is configured correctly');
  console.log('   □ Images are accessible via direct URL');
  console.log('   □ Database contains correct image filenames (not full paths)');
}

// Run the check
checkImagePaths();
