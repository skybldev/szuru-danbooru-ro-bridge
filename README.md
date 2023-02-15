# szuru-danbooru-ro-bridge

A read-only (only supports `GET /posts`) bridge that translates Danbooru 2 requests from Anime Boxes and similar clients to [szurubooru](https://github.com/rr-/szurubooru/) requests.

## Usage

You will need Deno to run this. Copy `config.json.example` to `config.json` and edit as needed. Then, run with `deno run --allow-net server.ts`.

In Anime Boxes, you must choose **Danbooru 2** as the server type. You can also supply the username and API key from your szurubooru account in your client.