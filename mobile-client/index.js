if (typeof global.DOMException === 'undefined') {
  class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  }
  try {
    Object.defineProperty(global, 'DOMException', {
      value: DOMException,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch (e) {
    try {
      global.DOMException = DOMException;
    } catch (_e) {}
  }
}

// Use require instead of import to prevent ES6 module hoisting
// This ensures that the polyfill executes strictly before any other module is evaluated.
const registerRootComponent = require('expo/src/launch/registerRootComponent').default;
const App = require('./App').default;

registerRootComponent(App);
