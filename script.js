import { main } from "./crawler.js";

const urls = [
    "https://saralhome.com/collections/fun-kids/products/gull-flower-micro-shape-bathmat-60-60cm-2",
]

for (const url of urls) {
    await main(url);
}