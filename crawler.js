import { chromium } from 'playwright';
import fs from 'fs/promises';
import { interactableSelectors, inStockKeywords, outOfStockKeywords } from './constant.js';

const logFile = 'crawler_log.txt';

async function log(message) {
    const messageString = (typeof message === 'string') ? message : JSON.stringify(message, null, 2);
    await fs.appendFile(logFile, `${new Date().toISOString()} - ${messageString}\n`);
}

async function isInViewport(element, page) {
    const boundingBox = await element.boundingBox();
    if (!boundingBox) return false;
    const viewport = page.viewportSize();
    if (!viewport) return false;
    return (
        boundingBox.x >= 0 &&
        boundingBox.y >= 0 &&
        boundingBox.x + boundingBox.width <= viewport.width &&
        boundingBox.y + boundingBox.height <= viewport.height
    );
}

const carouselKeywords = ['fotorama__arr', 'fotorama__nav__frame', 'carousel-control', 'slider-arrow', 'slick-arrow', 'swiper-button'];

// Function to compare URLs without query parameters or hashes
function isSamePage(url1, url2) {
    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);
        return u1.origin === u2.origin && u1.pathname === u2.pathname;
    } catch (e) {
        return url1 === url2;
    }
}

async function checkStockState(page) {
    await page.waitForTimeout(500); 
    
    // 1. Check the primary CTA text first (most accurate)
    const primaryCTA = await findPrimaryCTA(page);
    if (primaryCTA) {
        const btnText = (await primaryCTA.innerText() || await primaryCTA.getAttribute('value') || '').toLowerCase();
        if (outOfStockKeywords.some(kw => btnText.includes(kw.toLowerCase()))) {
            return 'outOfStock';
        }
        if (inStockKeywords.some(kw => btnText.includes(kw.toLowerCase()))) {
            return 'inStock';
        }
    }

    // 2. Fallback to broad page content check
    const pageContent = await page.content();
    const lowerCasePageContent = pageContent.toLowerCase();
    
    if (outOfStockKeywords.some(keyword => lowerCasePageContent.includes(keyword.toLowerCase()))) {
        return 'outOfStock';
    }
    
    return 'inStock';
}

async function findPrimaryCTA(page) {
    const ctaSelectors = [
        'button[name="add"]',
        'button[type="submit"].js-product-button-add-to-cart',
        '#add-to-cart',
        '.add-to-cart',
        '[data-js-trigger-id="add-to-cart"]',
        '.btn-add-to-cart',
        'button.primary-cta'
    ];

    for (const selector of ctaSelectors) {
        try {
            const btn = await page.$(selector);
            if (btn && await btn.isVisible()) {
                return btn;
            }
        } catch (e) {}
    }

    const buttons = await page.$$('button, input[type="button"], input[type="submit"], [role="button"]');
    for (const btn of buttons) {
        if (await btn.isVisible()) {
            const text = (await btn.innerText() || await btn.getAttribute('value') || '').toLowerCase();
            if (inStockKeywords.some(kw => text.includes(kw.toLowerCase())) || 
                outOfStockKeywords.some(kw => text.includes(kw.toLowerCase()))) {
                return btn;
            }
        }
    }
    
    return null;
}

async function closeCartDrawer(page) {
    const closeSelectors = [
        'button[aria-label*="close" i]',
        '.drawer__close',
        '.modal__close',
        '.close-cart',
        'button:has-text("Close")',
        '.js-drawer-close',
        '.cart-drawer__close'
    ];

    for (const selector of closeSelectors) {
        try {
            const closeBtn = await page.$(selector);
            if (closeBtn && await closeBtn.isVisible()) {
                await log(`    -> Closing cart drawer/modal via ${selector}...`);
                await closeBtn.click();
                await page.waitForTimeout(1000);
                return true;
            }
        } catch (e) {}
    }
    
    try {
        await log(`    -> No obvious close button. Attempting to click backdrop...`);
        await page.mouse.click(10, 10); 
        await page.waitForTimeout(1000);
    } catch (e) {}
    
    return false;
}

function generateCombinations(groups) {
    if (!groups || groups.length === 0) {
        return [];
    }
    const allCombinations = [];
    function recurse(groupIndex, currentCombination) {
        if (groupIndex === groups.length) {
            allCombinations.push(currentCombination);
            return;
        }
        const group = groups[groupIndex];
        for (const option of group.options) {
            recurse(groupIndex + 1, [...currentCombination, option]);
        }
    }
    recurse(0, []);
    return allCombinations;
}

export const main = async (url) => {
    await fs.writeFile(logFile, ''); 
    await log(`--- Processing: ${url} ---`);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    let totalInStock = 0;
    let totalOutOfStock = 0;

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        const processedElements = new Set();
        const detectedVariantGroups = [];

        // --- Swatch and Button Variant Detection ---
        await log(`Finding swatch and button variants...`);
        
        const allCandidates = await page.$$(interactableSelectors.join(', '));
        const visibleCandidates = [];
        for (const candidate of allCandidates) {
            if (await candidate.isVisible() && await isInViewport(candidate, page)) {
                visibleCandidates.push(candidate);
            }
        }
        await log(`Found ${visibleCandidates.length} visible candidates in viewport.`);

        const forbiddenKeywords = ['slide', 'zoom', 'chart', 'next', 'previous', 'page', 'cookie', 'accept', 'reject', 'settings', 'quantity', 'qty', 'minus', 'plus', 'add', 'remove', 'cart', 'wishlist', 'search'];
        
        for (const candidate of visibleCandidates) {
            const candidateOuterHTML = await candidate.evaluate(el => el.outerHTML);
            if (processedElements.has(candidateOuterHTML)) continue;

            const parent = await candidate.evaluateHandle(el => el.parentElement);
            if (!parent.asElement()) continue;

            const candidateTag = await candidate.evaluate(el => el.tagName);

            // Special handling for SELECT
            if (candidateTag === 'SELECT') {
                const options = await candidate.$$('option');
                const groupOptions = [];
                for (const option of options) {
                    const val = await option.getAttribute('value');
                    const text = (await option.innerText()).trim();
                    if (!val || text.toLowerCase().includes('select')) continue;
                    
                    const isOutOfStock = outOfStockKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));

                    groupOptions.push({
                        elementHandle: candidate,
                        text: text,
                        initialStatus: isOutOfStock ? 'outOfStock' : 'inStock',
                        selector: candidateOuterHTML,
                        isDropdown: true,
                        valueToSelect: val
                    });
                }
                if (groupOptions.length > 1) {
                    detectedVariantGroups.push({ groupName: `Dropdown`, options: groupOptions });
                }
                processedElements.add(candidateOuterHTML);
                continue;
            }

            const children = await parent.asElement().$$(':scope > *');
            const candidateAttrs = await candidate.evaluate(el => Array.from(el.attributes).map(attr => attr.name).sort());

            const identicalSiblings = [candidate];
            for (const sibling of children) {
                if (await sibling.evaluate((el, cand) => el === cand, candidate)) continue;
                const siblingTag = await sibling.evaluate(el => el.tagName);
                if (siblingTag !== candidateTag) continue;
                const siblingAttrs = await sibling.evaluate(el => Array.from(el.attributes).map(attr => attr.name).sort());
                if (JSON.stringify(siblingAttrs) !== JSON.stringify(candidateAttrs)) continue;
                
                if (await sibling.isVisible()) {
                   identicalSiblings.push(sibling);
                }
            }
            
            if (identicalSiblings.length > 1) {
                let isCarousel = false;
                for (const member of identicalSiblings) {
                    const outerHTML = (await member.evaluate(el => el.outerHTML)).toLowerCase();
                    if (carouselKeywords.some(keyword => outerHTML.includes(keyword)) || (await member.getAttribute('role')) === 'img') {
                        isCarousel = true;
                        break;
                    }
                }
                if (isCarousel) continue;

                const groupOptions = [];
                
                for (const member of identicalSiblings) {
                    const text = (await member.innerText() || await member.getAttribute('title') || await member.getAttribute('aria-label') || await member.getAttribute('data-value') || '').trim();
                    
                    if (!text || text.includes('\n') || text.length > 50 || forbiddenKeywords.some(kw => text.toLowerCase().includes(kw))) {
                        continue;
                    }
                    
                    const isOutOfStock = (await member.isDisabled()) || outOfStockKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
                    
                    const memberOuterHTML = await member.evaluate(el => el.outerHTML);
                    groupOptions.push({
                        elementHandle: member,
                        text: text,
                        initialStatus: isOutOfStock ? 'outOfStock' : 'inStock',
                        selector: memberOuterHTML,
                        isDropdown: false
                    });
                    processedElements.add(memberOuterHTML);
                }
                
                if (groupOptions.length > 1) {
                    detectedVariantGroups.push({ groupName: `Group of ${candidateTag}s`, options: groupOptions });
                }
            }
        }

        
        const uniqueGroups = [];
        const seenGroupContents = new Set();
        for (const group of detectedVariantGroups) {
            const contentKey = JSON.stringify(group.options.map(o => o.text));
            if (!seenGroupContents.has(contentKey)) {
                uniqueGroups.push(group);
                seenGroupContents.add(contentKey);
            }
        }

        await log(`\n--- Found ${uniqueGroups.length} Unique Variant Groups ---`);

        if (uniqueGroups.length === 0) {
            await log(`No variant groups found. Checking base product.`);
            const status = await checkStockState(page);
            await log(`Base product status: ${status}`);
            if (status === 'inStock') {
                totalInStock++;
                const cta = await findPrimaryCTA(page);
                if (cta) {
                    await log(`  - Clicking Primary CTA for base product...`);
                    await cta.click({ force: true });
                    await page.waitForTimeout(2000);
                    await closeCartDrawer(page);
                }
            } else {
                totalOutOfStock++;
            }
        } else {
            const allCombinations = generateCombinations(uniqueGroups);
            await log(`\n--- Testing ${allCombinations.length} Variant Combinations ---`);

            for (const combination of allCombinations) {
                const combinationText = combination.map(opt => opt.text).join(' / ');
                await log(`\n- Testing Combination: [${combinationText}]`);

                if (combination.some(opt => opt.initialStatus === 'outOfStock')) {
                    totalOutOfStock++;
                    await log(`  -> Combination is initially out of stock (one or more options disabled).`);
                    continue;
                }

                try {
                    for (const option of combination) {
                        await log(`  - Selecting: "${option.text}"`);

                        if (option.isDropdown) {
                            await option.elementHandle.selectOption(option.valueToSelect);
                        } else {
                            await option.elementHandle.click({ force: true });
                        }
                        
                        await page.waitForTimeout(500);
                    }
                    
                    await page.waitForTimeout(1500); 

                    const currentStatus = await checkStockState(page);
                    await log(`    -> Status: ${currentStatus}`);

                    if (currentStatus === 'inStock') {
                        const cta = await findPrimaryCTA(page);
                        if (cta) {
                            const ctaText = (await cta.innerText() || await cta.getAttribute('value') || 'No Text').trim();
                            await log(`    -> Clicking Primary CTA: "${ctaText}"...`);
                            await page.waitForTimeout(1000);
                            await cta.click({ force: true });
                            await page.waitForTimeout(4000); 
                            
                            if (!isSamePage(page.url(), url)) {
                                await log(`    -> Redirected to ${page.url()}. Going back...`);
                                await page.goBack({ waitUntil: 'domcontentloaded' });
                                await page.waitForTimeout(2000);
                            } else {
                                await closeCartDrawer(page);
                            }
                        }
                        totalInStock++;
                    } else {
                        totalOutOfStock++;
                    }
                } catch (e) {
                    await log(`    -> ERROR during combination test: ${e.message}`);
                    totalOutOfStock++;
                    await closeCartDrawer(page);
                }
            }
        }
    } catch (err) {
        console.error("An error occurred:", err.message);
        await log(`ERROR: ${err.message}`);
    } finally {
        await browser.close();
    }

    const result = { url, inStock: totalInStock, outOfStock: totalOutOfStock };
    console.log(`\nFinal Result for ${url}:\n${JSON.stringify(result, null, 2)}`);
    await log(`\nFinal Result for ${url}:\n${JSON.stringify(result, null, 2)}`);
    return result;
};
