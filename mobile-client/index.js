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

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
