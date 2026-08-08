import type { AdapterHttpClient } from "./json-http-client.js";
import { asString, isRecord, pathGet } from "./parse-unknown.js";
import type { EvidenceRef, FollowOnFetcher } from "./types.js";

export type IndieHackersFollowOnDeps = {
  http: Pick<AdapterHttpClient, "getText">;
};

export function isIndieHackersUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "indiehackers.com";
  } catch {
    return false;
  }
}

function extractNextData(html: string): unknown {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  const raw = match?.[1]?.trim();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function metaContent(html: string, name: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i",
  );
  return re.exec(html)?.[1] ?? alt.exec(html)?.[1];
}

function titleText(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = match?.[1]?.trim();
  return title && title.length > 0 ? title : undefined;
}

function evidenceFromHtml(url: string, html: string): EvidenceRef | undefined {
  const nextData = extractNextData(html);
  const post = pathGet(nextData, ["props", "pageProps", "post"]);
  if (isRecord(post)) {
    const id = asString(post.id) ?? asString(post.slug) ?? "page";
    const title = asString(post.title) ?? titleText(html) ?? "Indie Hackers post";
    const body =
      asString(post.body) ??
      asString(post.content) ??
      metaContent(html, "description") ??
      "";
    const quote = body ? `${title}\n\n${body}` : title;
    return {
      id: `indie-hackers-${id}`,
      quote,
      url,
      signalSource: "indie-hackers",
      signalKind: "demand-signal",
    };
  }

  const title = titleText(html);
  const description = metaContent(html, "description");
  if (!title && !description) {
    return undefined;
  }
  const quote =
    title && description ? `${title}\n\n${description}` : title ?? description!;
  let pathKey = "page";
  try {
    pathKey = new URL(url).pathname.replace(/\/+/g, "-").replace(/^-|-$/g, "");
  } catch {
    // keep default
  }
  return {
    id: `indie-hackers-${pathKey || "page"}`,
    quote,
    url,
    signalSource: "indie-hackers",
    signalKind: "demand-signal",
  };
}

/**
 * Indie Hackers Follow-on — fetches a concrete post page when referenced.
 * Non-IH URLs return []. Fetch/parse failures degrade to [].
 * Not part of Entry Catalog cold-start (ADR-0010).
 */
export function createIndieHackersFollowOnFetcher(
  deps: IndieHackersFollowOnDeps,
): FollowOnFetcher {
  return {
    async fetchPage(url: string) {
      if (!isIndieHackersUrl(url)) {
        return [];
      }
      try {
        const html = await deps.http.getText(url);
        const evidence = evidenceFromHtml(url, html);
        return evidence ? [evidence] : [];
      } catch {
        return [];
      }
    },
  };
}
