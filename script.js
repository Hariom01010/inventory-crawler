import { main } from "./crawler-v2.js";


const urls = [
    "https://vanillamoon.in/products/chap",
]

for (const url of urls) {
    await main(url);
}