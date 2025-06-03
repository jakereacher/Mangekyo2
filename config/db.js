const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    // Simple connection without deprecated options
    await mongoose.connect(process.env.MONGO_URI, {
      // Only use essential connection options
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
    });

    console.log(`DB connected successfully`);

    // Set up connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    // Don't exit process, let the app handle the error gracefully
  }
};

module.exports = connectDB;
