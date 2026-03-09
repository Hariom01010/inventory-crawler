import { main } from "./crawler-v2.js";


const urls = [
    "https://www.amydus.com/products/black-tummy-shaper-bell-bottom",
]

for (const url of urls) {
    await main(url);
}