// React Navigation 7.6.x calls Array.prototype.findLast/findLastIndex.
// Hermes bundled with this Expo SDK does not provide them, so install
// minimal standards-compatible polyfills before Expo Router is loaded.
const arrayPrototype = Array.prototype;

if (typeof arrayPrototype.findLast !== 'function') {
  Object.defineProperty(arrayPrototype, 'findLast', {
    configurable: true,
    writable: true,
    value: function (predicate, thisArg) {
      if (this == null) throw new TypeError('Array.prototype.findLast called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      const list = Object(this);
      const length = Math.min(Math.max(Number(list.length) || 0, 0), Number.MAX_SAFE_INTEGER);
      for (let index = length - 1; index >= 0; index--) {
        const value = list[index];
        if (predicate.call(thisArg, value, index, list)) return value;
      }
      return undefined;
    },
  });
}

if (typeof arrayPrototype.findLastIndex !== 'function') {
  Object.defineProperty(arrayPrototype, 'findLastIndex', {
    configurable: true,
    writable: true,
    value: function (predicate, thisArg) {
      if (this == null) throw new TypeError('Array.prototype.findLastIndex called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      const list = Object(this);
      const length = Math.min(Math.max(Number(list.length) || 0, 0), Number.MAX_SAFE_INTEGER);
      for (let index = length - 1; index >= 0; index--) {
        if (predicate.call(thisArg, list[index], index, list)) return index;
      }
      return -1;
    },
  });
}

require('expo-router/entry');
