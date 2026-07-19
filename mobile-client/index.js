// Polyfill global DOMException to support modern third-party package APIs in Hermes
if (typeof global.DOMException === 'undefined') {
  class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'DOMException';
    }
  }
  global.DOMException = DOMException;
}

// Use require instead of import to prevent ES6 module hoisting
// This ensures that the polyfill executes strictly before any other module is evaluated.
const registerRootComponent = require('expo/src/launch/registerRootComponent').default;
const App = require('./App').default;

registerRootComponent(App);
