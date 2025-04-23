// Validation helpers
exports.validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };
  
  exports.validateMobile = (mobile) => {
    const re = /^[0-9]{10,15}$/;
    return re.test(mobile);
  };
  
  // Other shared utilities can go here