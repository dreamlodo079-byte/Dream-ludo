// Polyfill global DOMException to support modern third-party package APIs in Hermes
if (typeof global.DOMException === 'undefined') {
  (global as any).DOMException = class DOMException extends Error {
    constructor(message: string, name?: string) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}
