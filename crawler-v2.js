import {
  inStockKeywords,
  interactableSelectors,
  outOfStockKeywords,
} from "./constant.js";
import { chromium } from "playwright";

let inStockVariants = 0;
let outOfStockVariants = 0;

const elementInViewPort = async (page, element, inViewPortElements) => {
  const viewport = page.viewportSize();
  const box = await element.boundingBox();

  if (box && viewport) {
    return (
      box &&
      box.y + box.height > 0 &&
      box.y < viewport.height &&
      box.x + box.width > 0 &&
      box.width < viewport.width
    );
  }
  return false;
};

export const main = async (url) => {
  const browser = await chromium.launch({
    headless: false,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
  await page.waitForTimeout(3000);

  // FIND ELEMENTS IN VIEWPORT
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
        text: node.innerText?.trim(),
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
  const dropdownElements = [];
  const swatchElements = [];
  const clusters = [];

  for (const el of elementsInfo) {
    if (el.tag === "SELECT") {
      dropdownElements.push(el);
    } else {
      swatchElements.push(el);
    }
  }
  let currentCluster = [swatchElements[0]];

  for (let i = 1; i < swatchElements.length; i++) {
    const prev = swatchElements[i - 1];
    const current = swatchElements[i];

    if (Math.abs(current.y - prev.y) < 80) {
      currentCluster.push(current);
    } else {
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }
  clusters.push(currentCluster);

  for (const cluster of clusters) {
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
    const variantOptions = cluster.filter((el) => el.tag !== "LABEL");
    console.log("Cluster classified as:", clusterType);
  }

  for (const element of dropdownElements) {
    const options = element.locator.locator("option");
    const optionCount = await options.count();
    console.log("Dropdown detected:", element.text);

    for (let i = 0; i < optionCount; i++) {
      const option = options.nth(i);

      const value = await option.getAttribute("value");
      const label = await option.innerText();

      if (!value || label.toLowerCase().includes("select")) continue;

      console.log("Option:", label);
    }
  }

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

};
