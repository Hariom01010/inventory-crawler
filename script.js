import { main } from "./crawler.js";

const urls = [
    "https://www.onitsukatiger.com/in/en-in/product/tiger-corsair/1183c555.300.html",
]

for (const url of urls) {
    await main(url);
}