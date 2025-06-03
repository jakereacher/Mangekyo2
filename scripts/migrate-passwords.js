/**
 * Migration script to add plaintextPassword field to existing users
 * This script sets a default password for existing users who don't have plaintextPassword
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import User model
const User = require('../models/userSchema');

const DEFAULT_PASSWORD = 'password123'; // Default password for existing users

async function migratePasswords() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users without plaintextPassword
    const usersWithoutPlaintextPassword = await User.find({
      $or: [
        { plaintextPassword: { $exists: false } },
        { plaintextPassword: null },
        { plaintextPassword: '' }
      ]
    });

    console.log(`Found ${usersWithoutPlaintextPassword.length} users without plaintext passwords`);

    if (usersWithoutPlaintextPassword.length === 0) {
      console.log('No users need migration');
      return;
    }

    // Update each user
    for (const user of usersWithoutPlaintextPassword) {
      // Hash the default password
      const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      
      // Update user with both hashed and plaintext passwords
      await User.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        plaintextPassword: DEFAULT_PASSWORD
      });

      console.log(`Updated user: ${user.email}`);
    }

    console.log(`Migration completed! Updated ${usersWithoutPlaintextPassword.length} users`);
    console.log(`Default password set to: ${DEFAULT_PASSWORD}`);
    console.log('Users can now view and change their passwords from the profile page');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
if (require.main === module) {
  migratePasswords();
}

module.exports = migratePasswords;
