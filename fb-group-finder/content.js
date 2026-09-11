// Runs inside facebook.com. Scrolls the current group feed, expands "See more",
// and extracts posts {id, url, author, time, text}.

const POST_URL_RE = /\/(?:groups\/[^/]+\/(?:posts|permalink)\/(\d+)|posts\/(?:pfbid)?[\w]+|permalink\.php\?story_fbid=(\d+)|share\/p\/[\w]+)/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanUrl(href) {
  try {
    const u = new URL(href, location.origin);
    for (const k of [...u.searchParams.keys()]) {
      if (k !== "story_fbid" && k !== "id") u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return href;
  }
}

function findPermalink(article) {
  const anchors = article.querySelectorAll('a[href]');
  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    if (POST_URL_RE.test(href)) return cleanUrl(href);
  }
  return null;
}

function findAuthor(article) {
  const h = article.querySelector('h2, h3, h4, strong a, a[role="link"] strong');
  return h ? h.textContent.trim() : "";
}

function findTime(article) {
  const t = article.querySelector('a[aria-label][href*="/posts/"], a[aria-label][href*="/permalink/"]');
  if (t) return t.getAttribute("aria-label") || "";
  const abbr = article.querySelector("abbr");
  return abbr ? abbr.textContent.trim() : "";
}

function findText(article) {
  const msg = article.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
  if (msg) return msg.innerText.trim();
  const parts = [];
  for (const d of article.querySelectorAll('div[dir="auto"]')) {
    if (d.closest('[role="button"], ul, form')) continue;
    const t = d.innerText.trim();
    if (t.length > 20 && !parts.includes(t)) parts.push(t);
  }
  return parts.slice(0, 5).join("\n");
}

function expandSeeMore(article) {
  for (const b of article.querySelectorAll('div[role="button"], span[role="button"]')) {
    const t = b.textContent.trim().toLowerCase();
    if (t === "xem thêm" || t === "see more" || t === "더 보기") {
      try { b.click(); } catch {}
    }
  }
}

function collectPosts(seen) {
  const feed = document.querySelector('div[role="feed"]') || document.body;
  const articles = feed.querySelectorAll('div[role="article"]');
  const out = [];
  for (const art of articles) {
    if (art.closest('div[role="article"] div[role="article"]')) continue; // comments
    if (art.getAttribute("aria-label")?.toLowerCase().startsWith("bình luận")) continue;
    expandSeeMore(art);
    const url = findPermalink(art);
    if (!url || seen.has(url)) continue;
    const text = findText(art);
    if (!text) continue;
    seen.add(url);
    out.push({
      id: url,
      url,
      author: findAuthor(art),
      time: findTime(art),
      text: text.slice(0, 4000),
    });
  }
  return out;
}

async function scanFeed({ maxPosts = 60, maxScrolls = 30 }, onProgress) {
  const seen = new Set();
  const posts = [];
  let idle = 0;
  for (let i = 0; i < maxScrolls && posts.length < maxPosts; i++) {
    const fresh = collectPosts(seen);
    posts.push(...fresh);
    idle = fresh.length ? 0 : idle + 1;
    onProgress?.({ scanned: posts.length, scroll: i + 1 });
    if (idle >= 4) break;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(1200);
  }
  // one last pass after final scroll
  posts.push(...collectPosts(seen));
  return posts.slice(0, maxPosts);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true, isGroup: /\/groups\//.test(location.pathname), title: document.title });
    return;
  }
  if (msg?.type === "SCAN") {
    scanFeed(msg.opts || {}, (p) => chrome.runtime.sendMessage({ type: "SCAN_PROGRESS", ...p }).catch(() => {}))
      .then((posts) => sendResponse({ ok: true, posts, groupTitle: document.title, groupUrl: location.href }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // async
  }
});
