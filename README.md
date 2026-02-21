# E-Commerce Variant Crawler

A robust web crawler built with Playwright to automatically navigate e-commerce product pages, iterate through all available variants (size, color, etc.), and verify their stock status by interacting with the "Add to Cart" or "Primary CTA" buttons.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)

## Installation

1. Clone or download this repository to your local machine.
2. Open your terminal in the project directory.
3. Install the required dependencies:
   ```bash
   npm install
   ```
4. Install Playwright browsers:
   ```bash
   npx playwright install chromium
   ```

## How to Run

1. **Configure URLs**: Open `script.js` and add the product URLs you want to crawl to the `urls` array:
   ```javascript
   const urls = [
       "https://example.com/products/your-product-slug",
   ];
   ```

2. **Execute the Script**: Run the following command in your terminal:
   ```bash
   node script.js
   ```

## Output & Logs

- **Terminal**: Displays the final JSON result for each URL, showing the total number of in-stock and out-of-stock variants found.
- **`crawler_log.txt`**: A detailed, timestamped execution log. It records every variant found, the actions taken (clicks, selections), and any errors encountered during the crawl.

## Key Features

- **Viewport-Only Interaction**: Focuses on elements visible to the user to avoid interacting with hidden background elements.
- **Smart CTA Detection**: Identifies the primary "Add to Cart" button using a mix of common selectors and keyword matching.
- **Recovery Logic**: Automatically handles cart drawers, modals, and redirects that often appear after clicking "Add to Cart".
- **False Positive Filtering**: Excludes utility buttons (like "Size Chart" or "Zoom") from being misidentified as product variants.
