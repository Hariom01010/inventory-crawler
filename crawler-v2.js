import {
  inStockKeywords,
  interactableSelectors,
  outOfStockKeywords,
} from "./constant.js";
import { chromium } from "playwright";

let inStockVariants = 0;
let outOfStockVariants = 0;

const generateCombinations = (groups) => {
  if (!groups || groups.length === 0) return [];

  const results = [];

  function recurse(index, current) {
    if (index === groups.length) {
      results.push(current);
      return;
    }

    const group = groups[index];

    for (const option of group.options) {
      recurse(index + 1, [...current, option]);
    }
  }

  recurse(0, []);
  return results;
};

const isElementBetween = (elements, top, bottom) => {
  return elements.some((el) => {
    return el.y > top && el.y < bottom;
  });
};

const findPrimaryCTA = async (page) => {
  const ctaSelectors = [
    'button[name="add"]',
    "#add-to-cart",
    ".add-to-cart",
    ".btn-add-to-cart",
    "button.primary-cta",
    ".pdp-addtobag-btn",
  ];

  for (const selector of ctaSelectors) {
    const btn = page.locator(selector);
    if ((await btn.count()) && (await btn.first().isVisible())) {
      return btn.first();
    }
  }

  const buttons = page.locator(
    'button, input[type="button"], input[type="submit"], [role="button"]',
  );

  for (let i = 0; i < (await buttons.count()); i++) {
    const btn = buttons.nth(i);

    if (await btn.isVisible()) {
      const text = ((await btn.innerText()) || "").toLowerCase();

      if (
        inStockKeywords.some((k) => text.includes(k)) ||
        outOfStockKeywords.some((k) => text.includes(k))
      ) {
        return btn;
      }
    }
  }

  return null;
};

const checkStockState = async (page) => {
  await page.waitForTimeout(500);

  const cta = await findPrimaryCTA(page);

  if (cta) {
    const text = ((await cta.innerText()) || "").toLowerCase();

    if (outOfStockKeywords.some((k) => text.includes(k))) {
      return "outOfStock";
    }

    if (inStockKeywords.some((k) => text.includes(k))) {
      return "inStock";
    }
  }

  const pageText = (await page.content()).toLowerCase();

  if (outOfStockKeywords.some((k) => pageText.includes(k))) {
    return "outOfStock";
  }

  return "inStock";
};

function removeOutliers(cluster) {
  if (cluster.length < 3) return cluster;

  const xs = cluster.map((el) => el.x).sort((a, b) => a - b);

  const medianX = xs[Math.floor(xs.length / 2)];

  return cluster.filter((el) => Math.abs(el.x - medianX) < 200);
}

export const main = async (url) => {
  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
  await page.waitForTimeout(3000);

  const selectorQuery = interactableSelectors.join(",");
  const locator = page.locator(selectorQuery);
  const inViewPortElements = [];

  for (let i = 0; i < (await locator.count()); i++) {
    const element = locator.nth(i);

    if (!(await element.isVisible())) continue;

    const inViewPort = await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();

      if (
        !(
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        )
      ) {
        return false;
      }
      const excludedTags = ["HEADER", "FOOTER", "NAV"];
      let parent = node;
      while (parent) {
        if (excludedTags.includes(parent.tagName)) return false;
        parent = parent.parentElement;
      }

      return true;
    });

    if (!inViewPort) continue;
    const text = await element.evaluate((node) =>
      (node.innerText || "").toLowerCase(),
    );

    const isCTA =
      inStockKeywords.some((keyword) => text.includes(keyword)) ||
      outOfStockKeywords.some((keyword) => text.includes(keyword));
    if (isCTA) continue;

    inViewPortElements.push(element);
  }

  const elementsInfo = [];
  for (const element of inViewPortElements) {
    const info = await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text:
          node.innerText?.trim() ||
          node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          "",
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        tag: node.tagName,
        classes: node.className,
      };
    });

    elementsInfo.push({
      locator: element,
      ...info,
    });
  }

  elementsInfo.sort((a, b) => a.y - b.y);
  const swatchElements = [];
  const clusters = [];
  const usedInputs = new Set();

  for (const el of elementsInfo) {
    if (el.tag === "INPUT") {
      const id = await el.locator.getAttribute("id");
      if (!id) continue;

      let matchedLabel = null;

      for (const candidate of elementsInfo) {
        if (candidate.tag !== "LABEL") continue;

        const forAttr = await candidate.locator.getAttribute("for");

        if (forAttr === id) {
          matchedLabel = candidate;
          break;
        }
      }

      if (matchedLabel) {
        swatchElements.push({
          ...matchedLabel,
          locator: matchedLabel.locator,
        });

        usedInputs.add(id);
        continue;
      }
    }

    if (el.tag === "LABEL") {
      const forAttr = await el.locator.getAttribute("for");

      if (forAttr && usedInputs.has(forAttr)) {
        continue;
      }
    }

    swatchElements.push(el);
  }
  let currentCluster = [swatchElements[0]];

  for (let i = 1; i < swatchElements.length; i++) {
    const current = swatchElements[i];
    const lastInCluster = currentCluster[currentCluster.length - 1];

    const distance = Math.abs(current.y - lastInCluster.y);
    const elementBetween = isElementBetween(
      elementsInfo,
      lastInCluster.y + lastInCluster.height,
      current.y,
    );

    const isVariantLabel =
      current.tag === "LABEL" &&
      current.text &&
      (current.text.toLowerCase().startsWith("color") ||
        current.text.toLowerCase().startsWith("size") ||
        current.text.toLowerCase().startsWith("material"));

    if (!isVariantLabel && distance < 100 && !elementBetween) {
      currentCluster.push(current);
    } else {
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }
  clusters.push(currentCluster);

  const variantGroups = [];
  for (const rawCluster of clusters) {
    const cluster = removeOutliers(rawCluster);
    let clusterType = null;

    for (const el of cluster) {
      if (!el.text) continue;

      const text = el.text.toLowerCase().trim();

      if (el.tag === "LABEL") {
        if (text.startsWith("color")) {
          clusterType = "color";
          break;
        }

        if (text.startsWith("size")) {
          clusterType = "size";
          break;
        }

        if (text.startsWith("material")) {
          clusterType = "material";
          break;
        }
      }
    }
    const variantOptions = cluster.filter((el) => {
      // remove variant labels
      if (el.tag === "LABEL") return false;

      // remove container elements that contain other cluster elements
      const isContainer = cluster.some((other) => {
        if (other === el) return false;

        const inside =
          other.x >= el.x &&
          other.y >= el.y &&
          other.x + other.width <= el.x + el.width &&
          other.y + other.height <= el.y + el.height;

        return inside;
      });

      if (isContainer) return false;

      return true;
    });
    const options = [];

    for (const el of variantOptions) {
      options.push({
        elementHandle: el.locator,
        text: el.text,
        initialStatus: "unknown",
        isDropdown: false,
      });
    }

    if (options.length > 1) {
      variantGroups.push({
        groupName: clusterType || "unknown",
        options,
      });
    }
    console.log("Cluster classified as:", clusterType);
  }

  const combinations = generateCombinations(variantGroups);
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    console.log(`\n--- Cluster ${i + 1} ---`);
    console.log(`Element count: ${cluster.length}`);

    for (const el of cluster) {
      console.log({
        text: el.text,
        tag: el.tag,
        y: el.y,
        classes: el.classes,
      });
    }
  }
  for (const combo of combinations) {
    console.log("Testing combination:", combo.map((o) => o.text).join(" / "));

    try {
      for (const option of combo) {
        await option.elementHandle.click({ force: true });
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(1500);

      const status = await checkStockState(page);
      console.log("Stock status:", status);

      if (status === "inStock") {
        const cta = await findPrimaryCTA(page);

        if (cta) {
          await cta.click({ force: true });
          await page.waitForTimeout(2000);
        }

        inStockVariants++;
      } else {
        outOfStockVariants++;
      }
    } catch (err) {
      console.log("Combination failed:", err.message);
      outOfStockVariants++;
    }
  }

  console.log("\nFinal result:");
  console.log({
    url,
    inStockVariants,
    outOfStockVariants,
  });
  await browser.close();
};
