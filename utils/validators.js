function validateNumbers(numbers, expected, max) {
  if (numbers.length !== expected) {
    return {
      valid: false,
      message: `You requested ${expected} entries, but entered ${numbers.length}.`,
    };
  }

  for (let n of numbers) {
    if (n < 1 || n > max) {
      return { valid: false, message: `Number ${n} is outside range 1-${max}.` };
    }
  }

  return { valid: true };
}

module.exports = { validateNumbers };
