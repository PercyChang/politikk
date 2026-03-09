/**
 * Cloudflare Pages Function – RSS-proxy for nyhetsfeed
 * Fil: /functions/rss.js
 *
 * Rute (automatisk): /functions/rss?source=nrk|vg|bbc|reuters|aljazeera
 *
 * Cloudflare Pages oppdager denne filen automatisk og
 * deployer den som en serverless funksjon.
 */

const SOURCES = {
  nrk:       'https://www.nrk.no/toppsaker.rss',
  vg:        'https://www.vg.no/rss/feed/?categories=1068',
  bbc:       'https://feeds.bbci.co.uk/news/world/rss.xml',
  reuters:   'https://feeds.reuters.com/reuters/topNews',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
};

const FILTER_KEYWORDS = [
  // Menneskerettigheter
  'human rights', 'rights', 'torture', 'refugee', 'asylum', 'discrimination',
  'amnesty', 'genocide', 'persecution',
  // Demokrati
  'democracy', 'democratic', 'election', 'authoritarian', 'autocracy',
  'freedom', 'vote', 'parliament', 'press freedom', 'coup',
  // Krig og konflikt
  'war', 'conflict', 'attack', 'troops', 'military', 'ceasefire',
  'invasion', 'bombing', 'sanctions', 'missile', 'offensive', 'crisis',
  // Norske ord (NRK/VG)
  'demokrati', 'menneskerettighet', 'krig', 'konflikt', 'flyktning',
  'valg', 'angrep', 'militær', 'rettighet', 'fred', 'sanksjoner',
];

function matchesFilter(title = '', description = '') {
  const text = (title + ' ' + description).toLowerCase();
  return FILTER_KEYWORDS.some(kw => text.includes(kw));
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(
        new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`)
      );
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    items.push({
      title:       get('title'),
      link:        get('link'),
      description: get('description'),
      pubDate:     get('pubDate'),
    });
  }
  return items;
}

// Cloudflare Pages Functions bruker denne signaturen:
export async function onRequest(context) {
  const { request } = context;
  const url    = new URL(request.url);
  const source = url.searchParams.get('source');

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }

  if (!source || !SOURCES[source]) {
    return new Response(JSON.stringify({ error: 'Ukjent kilde' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(SOURCES[source], {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; POS-nyheter/1.0)' },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Henting feilet: ${res.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const xml   = await res.text();
    const items = parseRSS(xml).filter(i => matchesFilter(i.title, i.description));

    return new Response(JSON.stringify({ source, items }), {
      status: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               's-maxage=600, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
