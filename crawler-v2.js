import {
  inStockKeywords,
  interactableSelectors,
  INVALID_ATTRIBUTE_KEYWORDS,
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
  if (cluster.length < 2) return cluster;
  if (cluster.length === 2) {
    const d = Math.sqrt(
      Math.pow(cluster[0].x - cluster[1].x, 2) +
        Math.pow(cluster[0].y - cluster[1].y, 2),
    );
    if (d > 500) {
      return;
    }
    return cluster;
  }

  let currentCluster = [...cluster];

  while (currentCluster.length >= 3) {
    const n = currentCluster.length;

    const sortedX = [...currentCluster].map((el) => el.x).sort((a, b) => a - b);
    const medianX = sortedX[Math.floor(n / 2)];
    const sortedY = [...currentCluster].map((el) => el.y).sort((a, b) => a - b);
    const medianY = sortedY[Math.floor(n / 2)];

    // Map distances from center
    const clusterWithDist = currentCluster.map((el) => ({
      ...el,
      dist: Math.sqrt(
        Math.pow(el.x - medianX, 2) + Math.pow(el.y - medianY, 2),
      ),
    }));

    // Sort by distance (ascending)
    clusterWithDist.sort((a, b) => a.dist - b.dist);

    const minIdx = 0;
    const maxIdx = n - 1;
    const suspect = clusterWithDist[maxIdx];
    const range = suspect.dist - clusterWithDist[minIdx].dist;

    if (range === 0) break;

    // Dixon's Q Critical Values (95% confidence)
    const qTable = {
      3: 0.941,
      4: 0.765,
      5: 0.642,
      6: 0.56,
      7: 0.507,
      8: 0.468,
      9: 0.437,
      10: 0.412,
    };
    const Q_CRIT = qTable[n] || 0.4;

    const gap = suspect.dist - clusterWithDist[n - 2].dist;
    const qExp = gap / range;

    if (qExp > Q_CRIT) {
      // SUCCESSFUL REMOVAL: Filter the suspect out using a unique property (like x and y)
      currentCluster = currentCluster.filter(
        (el) => !(el.x === suspect.x && el.y === suspect.y),
      );
      // Loop continues to check the NEW smaller cluster
    } else {
      // No more outliers found
      break;
    }
  }

  return currentCluster;
}

function hasHorizontalNeighbor(cluster) {
  const yThreshold = 25;
  const xThreshold = 20;

  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const a = cluster[i];
      const b = cluster[j];

      const sameRow = Math.abs(a.y - b.y) < yThreshold;
      const differentColumn = Math.abs(a.x - b.x) > xThreshold;

      if (sameRow && differentColumn) {
        return true;
      }
    }
  }

  return false;
}

function getMajorityTag(cluster) {
  const counts = {};

  for (const el of cluster) {
    counts[el.tag] = (counts[el.tag] || 0) + 1;
  }

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function hasInvalidAttribute(el) {
  const values = [el.classes, el.id, el.name, el.aria, el.role, el.text];

  const combined = values.join(" ").toLowerCase();

  return INVALID_ATTRIBUTE_KEYWORDS.some((word) => combined.includes(word));
}

async function collectViewportElements(page) {
  const selectorQuery = interactableSelectors.join(",");
  const locator = page.locator(selectorQuery);

  const elements = [];

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
      inStockKeywords.some((k) => text.includes(k)) ||
      outOfStockKeywords.some((k) => text.includes(k));

    if (isCTA) continue;

    elements.push(element);
  }

  return elements;
}
async function extractElementInfo(elements) {
  const result = [];

  for (const element of elements) {
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
        id: node.id || "",
        name: node.getAttribute("name") || "",
        aria: node.getAttribute("aria-label") || "",
        role: node.getAttribute("role") || "",
      };
    });

    result.push({
      locator: element,
      ...info,
    });
  }

  result.sort((a, b) => a.y - b.y);

  return result;
}
async function normalizeInputLabels(elementsInfo) {
  const swatchElements = [];
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

      if (forAttr && usedInputs.has(forAttr)) continue;
    }

    swatchElements.push(el);
  }

  return swatchElements;
}
function clusterElements(elements) {
  const clusters = [];

  let currentCluster = [elements[0]];

  for (let i = 1; i < elements.length; i++) {
    const current = elements[i];

    const nearestColumnElement = currentCluster.reduce((closest, el) => {
      const dist = Math.abs(el.x - current.x);

      if (!closest || dist < closest.dist) {
        return { el, dist };
      }

      return closest;
    }, null)?.el;

    let shouldJoinCluster = false;

    if (nearestColumnElement) {
      const MAX_VERTICAL_GAP = 70;

      const yDist = Math.abs(current.y - nearestColumnElement.y);
      const xDist = Math.abs(current.x - nearestColumnElement.x);

      const distance = Math.sqrt(xDist ** 2 + yDist ** 2);

      shouldJoinCluster = distance < 150 && yDist < MAX_VERTICAL_GAP;
    }

    if (shouldJoinCluster) {
      currentCluster.push(current);
    } else {
      clusters.push(currentCluster);
      currentCluster = [current];
    }
  }

  clusters.push(currentCluster);

  return clusters;
}
function extractVariantGroups(clusters) {
  const variantGroups = [];

  for (const rawCluster of clusters) {
    const cluster = removeOutliers(rawCluster);

    const majorityTag = getMajorityTag(cluster);

    const variantOptions = cluster.filter((el) => {
      if (hasInvalidAttribute(el)) return false;
      if (el.tag !== majorityTag) return false;

      const isContainer = cluster.some((other) => {
        if (other === el) return false;

        const inside =
          other.x >= el.x &&
          other.y >= el.y &&
          other.x + other.width <= el.x + el.width &&
          other.y + other.height <= el.y + el.height;

        return inside;
      });

      return !isContainer;
    });

    if (variantOptions.length > 1 && hasHorizontalNeighbor(variantOptions)) {
      variantGroups.push({
        groupName: "unknown",
        options: variantOptions.map((el) => ({
          elementHandle: el.locator,
          text: el.text,
          initialStatus: "unknown",
          isDropdown: false,
        })),
      });
    }
  }

  return variantGroups;
}

export const main = async (url) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const elements = await collectViewportElements(page);

  const elementsInfo = await extractElementInfo(elements);

  const swatchElements = await normalizeInputLabels(elementsInfo);

  const clusters = clusterElements(swatchElements);

  const variantGroups = extractVariantGroups(clusters);

  const combinations = generateCombinations(variantGroups);

  console.log("\n===== INITIAL CLUSTERS =====");
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    console.log(`\n--- Cluster ${i + 1} ---`);
    console.log(`Element count: ${cluster.length}`);

    for (const el of cluster) {
      console.log({
        text: el.text,
        tag: el.tag,
        y: el.y,
        x: el.x,
        classes: el.classes,
      });
    }
  }

  console.log("\n===== FINAL VARIANT GROUPS =====");

  variantGroups.forEach((group, i) => {
    console.log(`\nVariant Group ${i + 1}`);

    group.options.forEach((opt) => {
      console.log({
        text: opt.text,
        tag: opt.elementHandle ? "locator" : "unknown",
      });
    });
  });

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
