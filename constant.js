export const inStockKeywords = [
  "buy now",
  "buy",
  "purchase",
  "order now",
  "place order",
  "checkout",
  "proceed to checkout",
  "secure checkout",
  "complete purchase",
  "pay now",
  "get it now",
  "grab now",
  "claim now",
  "shop now",
  "buy it now",
  "instant buy",
  "express checkout",
  "add to cart",
  "add to bag",
  "add to basket",
  "add to trolley",
  "add to shopping cart",
  "add to shopping bag",
  "add item",
  "add to order",
  "quick add",
];

export const outOfStockKeywords = [
  "out of stock",
  "sold out",
  "unavailable",
  "currently unavailable",
  "not available",
  "out of inventory",
  "temporarily unavailable",
  "no stock",
  "notify me",
  "notify me when available",
  "email me when available",
  "back in stock alert",
  "join waitlist",
  "join waiting list",
  "restock alert",
  "get notified",
  "pre order",
  "preorder",
  "backorder",
];

export const interactableSelectors = [
  'button:not([aria-label*="Next" i]):not([aria-label*="Previous" i]):not([aria-label*="Page" i]):not([class*="carousel" i]):not([class*="pagination" i])', // Filter out common navigation buttons
  'input[type="radio"]:not([disabled])',
  'input[type="checkbox"]:not([disabled])',
  '[role="button"]:not([disabled])',      // Divs/spans acting as buttons
  '[role="radio"]:not([disabled])',       // Divs/spans acting as radios
  '[role="option"]:not([disabled])',      // For explicit options, e.g., in listboxes
  '[class*="swatch"]:not([disabled])',     // Common class patterns for swatches
  '[class*="variant-select"]:not([disabled])', // Common class patterns for variant selectors
  '[data-value]:not([disabled])',         // Elements with data-value (common for variants)
  '[data-option]:not([disabled])',        // Elements with data-option
  '[data-variant]:not([disabled])',       // Elements with data-variant
  'a[data-value]:not([disabled])',        // Links with data-value (often image swatches)
  'a[class*="swatch"]:not([disabled])'    // Links with swatch classes
];

export const redirectKeywords = [
  "cart",
  "order",
  "checkout",
  "shipping",
  "payment",
  "billing",
  "review",
  "confirm",
  "confirmation",
  "place-order",
  "secure-checkout",
  "express-checkout",
  "onepage",
  "one-page",
  "checkouts",
  "bag",
  "basket",
  "shopping-cart",
  "my-cart",
  "viewcart",
  "cart-page",
  "cart-view",
];

export const postClickKeywords = [
  "checkout",
  "order now",
  "place order",
  "proceed to checkout",
  "continue to checkout",
  "checkout now",
  "secure checkout",
  "express checkout",
  "place order",
  "complete order",
  "review order",
  "confirm order",
  "continue to shipping",
  "continue to payment",
  "continue to billing",
  "view cart",
  "go to cart",
  "view bag",
  "view basket",
  "added to cart",
  "item added",
  "successfully added",
];

export const variantContainerSelectors = [
  '[role="listbox"]',
  'select',
  'input[type="radio"]',
  'input[type="checkbox"]', // Added for multi-select variants
  '[data-property]',
  '[data-variant-option]',
  '[data-option-value]',
  '.product-option',
  '.variant-selector',
  '.swatch-wrapper',
  '.swatch-option',
  '.size-picker',
  '.color-picker',
  '.attribute-options',
  '.option-group',
  'ul.options',
  'div[class*="select-option"]',
  'div[class*="variant-option"]',
  'div[class*="variant-swatch"]',
  'div[class*="product-attribute"]'
];