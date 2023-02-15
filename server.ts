import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import cfg from "./config.json" assert { type: "json" };

type GenericObject = Record<string, unknown>;

let reqCount = 0;
const fmt = (t: string) => `${new Date().toISOString()} | #${reqCount} · ${t}`;

serve(async (req: Request) => {
    reqCount++;
    console.log(fmt("Received request"));
    const res = await handler(req);
    console.log(fmt("Done."));
    return res;
}, {
    port: cfg.bridgePort,
    hostname: cfg.bridgeHostname,
    onListen: (p) => console.log(fmt(`Listening on ${p.hostname}:${p.port}`))
});

async function handler (req: Request): Promise<Response> {
    try {
        const urlAndToken = transformRequestURL(new URL(req.url));
        const serverResponse = await requestFromServer(...urlAndToken);
        const payload = processServerResponse(serverResponse);

        console.log(fmt(`Sending back response of ${payload.length} posts...`));
        return Response.json(payload, { status: 200 });
    } catch (e) {
        console.error(fmt(`[ERROR] ${e.message}`));
        if ("code" in e) {
            return new Response(e.msg, { status: e.code });
        } else {
            return new Response(`Server encountered a miscellaneous error: ${e.message}`, { status: 500 });
        }
    }
}

function transformRequestURL(url: URL): [URL, string | null] {
    console.log(fmt("Transforming client request..."));
    const login = url.searchParams.get("login");
    const key = url.searchParams.get("api_key");
    const token = (login && key) ? `Token ${btoa(`${login}:${key}`)}` : null;
    
    if (!url.pathname.startsWith("/posts")) {
        throw { code: 400, msg: "Endpoint must start with /posts" };
    } else if (url.pathname.split("/")[1].match(/^[0-9]*$/)) {
        // A single post (by id) is requested in this case
        return [new URL(`/api/posts/${url.pathname.split("/")[1]}`), token];
    }

    // A post list is requested otherwise
    // Map ratings to szuru-style
    const query = url.searchParams.get("tags")
        ?.replace(/:(g|general|s|safe)($| )/, ":safe")
        .replace(/:(q|questionable)($| )/, ":questionable")
        .replace(/:(e|explicit)($| )/, ":unsafe");
    const limit = url.searchParams.get("limit") ?? "75";
    // Calculate offset based on page number
    const page = parseInt(url.searchParams.get("page") ?? "1");
    const offset = ((page - 1) * parseInt(limit)).toString();

    // Construct new URL based on parameters
    const newUrl = new URL("/api/posts", cfg.serverURL);
    newUrl.searchParams.append("query", query ?? "");
    newUrl.searchParams.append("limit", limit);
    newUrl.searchParams.append("offset", offset);
    newUrl.searchParams.append("fields", cfg.requestPostFields);
    return [newUrl, token];
}

async function requestFromServer(url: URL, token: string | null) {
    console.log(fmt(`Calling server with URL "${url.toString()}"`));
    const headers = new Headers({
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Accept-Encoding": "utf8",
        "Accept-Language": "en-US,en;q=0.5",
        "Connection": "keep-alive",
        "Host": cfg.serverURL,
        "Referer": url.toString(),
        "User-Agent": cfg.userAgent
    });
    if (token) headers.append("Authorization", token);
    const response = await fetch(url, { headers });
    if (response.status !== 200) { throw {
        code: 500,
        msg: `Server returned an error: \nBEGIN ERROR\n${await response.text()}\nEND ERROR`
    }}
    return response.json();
}

function processServerResponse(res: GenericObject) {
    console.log(fmt("Processing server response..."));
    return (res.results as GenericObject[]).map((post) => {
        const remap = Object.entries({
            id: "id",
            created_at: "creationTyime",
            updated_at: "lastEditTime",
            score: "score",
            source: "source",
            rating: "safety",
            width: "canvasWidth",
            height: "canvasHeight",
            md5: "checksum",
            file_ext: "mimeType"
        });
        const newPost = Object.fromEntries(remap.map(([k, v]) => [k, post[v]]));
        const has_children = Boolean(post.relations);
        const base = cfg.serverURL;
        return Object.assign(newPost, {
            author: (post.user as GenericObject).name,
            // change this map to translate your server's categories to abox's
            tag_string: (post.tags as { names: string[] }[])
                .map(t => t.names[0])
                .join(" "),
            has_children,
            children_ids: has_children
                ? (post.relations as { id: string }[]).map(r => r.id).join(" ")
                : "",
            file_url: new URL(post.contentUrl as string, base),
            large_file_url: new URL(post.contentUrl as string, base),
            preview_file_url: new URL(post.thumbnailUrl as string, base),
        });
    });
}