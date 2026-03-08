import { main } from "./crawler-v2.js";


const urls = [
    "https://www.onitsukatiger.com/in/en-in/product/california-78-ex/1183a355.407.html",
]

for (const url of urls) {
    await main(url);
}