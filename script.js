import { main } from "./crawler.js";

const urls = [
    "https://hummel.net.in/products/loose-bay-soccer-jersey-s-s-2",
]

for (const url of urls) {
    await main(url);
}