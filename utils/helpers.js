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
  
  // Address field validation
  exports.validateAddressName = (name) => {
    // No empty, no only spaces, no numbers, no multiple spaces
    return (
      typeof name === 'string' &&
      name.trim().length > 0 &&
      /^[A-Za-z\s]+$/.test(name) &&
      !/\d/.test(name) &&
      !/^\s+$/.test(name) &&
      !/\s{2,}/.test(name)
    );
  };

  exports.validateCityOrState = (value) => {
    // No empty, no only spaces, no numbers, no special chars except space
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      /^[A-Za-z\s]+$/.test(value) &&
      !/\d/.test(value) &&
      !/^\s+$/.test(value) &&
      !/\s{2,}/.test(value)
    );
  };

  exports.validatePinCode = (pin) => {
    // 6 digits, numbers only
    return typeof pin === 'string' && /^\d{6}$/.test(pin);
  };

  exports.validateMobileStrict = (mobile) => {
    // 10 digits, numbers only
    return typeof mobile === 'string' && /^\d{10}$/.test(mobile);
  };

  exports.validateAddressLine = (line) => {
    // No empty, no only spaces
    return typeof line === 'string' && line.trim().length > 0 && !/^\s+$/.test(line);
  };
  
  // Other shared utilities can go here