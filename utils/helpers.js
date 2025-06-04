// Validation helpers
exports.validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };
  
  exports.validateMobile = (mobile) => {
    const re = /^[0-9]{10,15}$/;
    return re.test(mobile);
  };
  
  exports.validateProfileName = (name) => {
    return typeof name === 'string' && name.trim().length > 0 && !/^\s+$/.test(name) && !/\s{2,}/.test(name);
  };
  
  // Other shared utilities can go here