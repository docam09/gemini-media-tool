(() => {
  const installed = Symbol.for("fb-group-finder.content");
  if (globalThis[installed]) return;
  globalThis[installed] = true;

  const ARTICLE = 'article, [role="article"]';
  const MESSAGE = '[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]';
  const VERSION = "0.1.2";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let scanning = false;
  let stopRequested = false;
  let lastScan = null;

  function postUrl(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.protocol !== "https:" || !["www.facebook.com", "m.facebook.com", "facebook.com"].includes(url.hostname)) return null;
      if (url.searchParams.has("comment_id") || url.searchParams.has("reply_comment_id")) return null;
      const group = location.pathname.match(/^\/groups\/([^/]+)/)?.[1];
      const path = url.pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\/([a-zA-Z0-9]+)\/?$/);
      if (path) {
        if (group && path[1] !== group) return null;
        return `https://www.facebook.com/groups/${path[1]}/posts/${path[2]}/`;
      }
      const linkedGroup = url.pathname.match(/^\/groups\/([^/]+)\/?$/)?.[1];
      const postId = url.searchParams.get("multi_permalinks");
      if (linkedGroup && (!group || linkedGroup === group) && /^[a-zA-Z0-9]+$/.test(postId || "")) {
        return `https://www.facebook.com/groups/${linkedGroup}/posts/${postId}/`;
      }
      const storyId = url.searchParams.get("story_fbid");
      const owner = url.searchParams.get("id");
      if (/^\/(?:permalink|story)\.php$/.test(url.pathname) && /^[a-zA-Z0-9]+$/.test(storyId || "") && /^\d+$/.test(owner || "")) {
        return `https://www.facebook.com/permalink.php?story_fbid=${storyId}&id=${owner}`;
      }
      if (/^\/(?:(?:[^/]+\/)?posts|share\/p)\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) {
        return `https://www.facebook.com${url.pathname.replace(/\/?$/, "/")}`;
      }
    } catch {
      return null;
    }
    return null;
  }

  function isComment(element) {
    const article = element.closest(ARTICLE);
    return /^(?:comment|reply|bình luận|phản hồi|댓글|답글)(?:\s|:|$)/i.test(article?.getAttribute("aria-label") || "");
  }

  function belongsToPost(element, post) {
    if (element.closest('form, [role="dialog"]') || isComment(element)) return false;
    const article = element.closest(ARTICLE);
    let primary = post.matches(ARTICLE) ? post : post.querySelector(ARTICLE);
    const message = post.querySelector(MESSAGE);
    if (message && !primary?.contains(message)) primary = null;
    return !article || article === primary || !post.contains(article);
  }

  function findPermalink(post) {
    for (const anchor of post.querySelectorAll("a[href]")) {
      if (!belongsToPost(anchor, post)) continue;
      const url = postUrl(anchor.getAttribute("href"));
      if (url) return { url, label: anchor.getAttribute("aria-label") || "" };
    }
    return null;
  }

  function feedRoot() {
    return document.querySelector('[role="feed"]') || document.querySelector('[role="main"], main') || document.body;
  }

  function findCandidates() {
    const root = feedRoot();
    const candidates = new Set();
    for (const unit of root.querySelectorAll('[data-pagelet^="FeedUnit"]')) {
      if (!unit.parentElement.closest(`${ARTICLE}, [data-pagelet^="FeedUnit"]`)) candidates.add(unit);
    }
    for (const article of root.querySelectorAll(ARTICLE)) {
      if (!article.parentElement.closest(ARTICLE) && !isComment(article) &&
          ![...candidates].some((post) => post.contains(article))) candidates.add(article);
    }
    const seeds = [
      ...root.querySelectorAll(MESSAGE),
      ...[...root.querySelectorAll("a[href]")].filter((anchor) => postUrl(anchor.getAttribute("href"))),
    ];
    for (const seed of seeds) {
      if (isComment(seed) || [...candidates].some((post) => post.contains(seed))) continue;
      for (let parent = seed.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if ([...candidates].some((post) => parent.contains(post))) break;
        const messages = [...parent.querySelectorAll(MESSAGE)].filter((node) =>
          !node.parentElement.closest(MESSAGE) && belongsToPost(node, parent));
        if (messages.length > 1) break;
        const links = new Set([...parent.querySelectorAll("a[href]")]
          .filter((node) => belongsToPost(node, parent))
          .map((node) => postUrl(node.getAttribute("href"))).filter(Boolean));
        if (links.size > 1) break;
        if (links.size === 1 && findText(parent)) {
          candidates.add(parent);
          break;
        }
      }
    }
    return [...candidates].filter((post) => !post.closest('form, [role="dialog"]'));
  }

  function textOf(element) {
    return element instanceof HTMLElement ? (element.innerText ?? element.textContent ?? "").trim() : "";
  }

  function findText(post) {
    const message = [...post.querySelectorAll(MESSAGE)].find((node) => belongsToPost(node, post));
    if (message) return textOf(message);
    const parts = [];
    for (const node of post.querySelectorAll('[dir="auto"]')) {
      if (!belongsToPost(node, post) || node.closest('[role="button"], button, a, h2, h3, h4, ul')) continue;
      const text = textOf(node);
      if (text && !parts.some((part) => part.includes(text))) parts.push(text);
    }
    return parts.join("\n");
  }

  async function expandSeeMore(candidates, expanded) {
    let clicked = false;
    for (const post of candidates) {
      for (const button of post.querySelectorAll('[role="button"], button')) {
        if (!(button instanceof HTMLElement) || !belongsToPost(button, post) || expanded.has(button)) continue;
        const label = textOf(button).toLocaleLowerCase().replace(/\s+/g, " ");
        if (!["xem thêm", "see more", "더 보기"].includes(label)) continue;
        expanded.add(button);
        button.click();
        clicked = true;
      }
    }
    if (clicked) await sleep(400);
  }

  function collectPosts(candidates, posts, limit, diagnostics) {
    let missingLinks = 0;
    let missingText = 0;
    for (const post of candidates) {
      const permalink = findPermalink(post);
      const text = findText(post);
      if (!permalink) missingLinks++;
      if (!text) missingText++;
      if (!permalink || !text || posts.size >= limit) continue;
      const previous = posts.get(permalink.url);
      if (previous && previous.text.length >= text.length) continue;
      const author = [...post.querySelectorAll('h2, h3, h4, strong a, a[role="link"] strong')]
        .find((node) => belongsToPost(node, post));
      posts.set(permalink.url, {
        id: permalink.url,
        url: permalink.url,
        author: textOf(author),
        time: permalink.label,
        text: text.slice(0, 4000),
      });
    }
    diagnostics.candidates = Math.max(diagnostics.candidates, candidates.length);
    diagnostics.missingLinks = Math.max(diagnostics.missingLinks, missingLinks);
    diagnostics.missingText = Math.max(diagnostics.missingText, missingText);
  }

  function scrollContainer() {
    for (let node = feedRoot(); node && node !== document.body; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) return node;
    }
    return document.scrollingElement || document.documentElement;
  }

  function bounded(value, fallback, max) {
    return Math.min(max, Math.max(1, Math.floor(Number(value) || fallback)));
  }

  function linkShape(href) {
    if (!href) return { route: "missing" };
    try {
      const url = new URL(href, location.origin);
      if (url.protocol !== "https:" || !["www.facebook.com", "m.facebook.com", "facebook.com"].includes(url.hostname)) return { route: "external-or-non-https" };
      let route = "other-facebook";
      if (/^\/groups\/[^/]+\/(?:posts|permalink)\//.test(url.pathname)) route = "group-post";
      else if (/^\/groups\/[^/]+\/search/.test(url.pathname)) route = "group-search";
      else if (/^\/groups\/[^/]+/.test(url.pathname)) route = "group";
      else if (/^\/(?:story|permalink)\.php$/.test(url.pathname)) route = "story";
      else if (/^\/marketplace\//.test(url.pathname)) route = "marketplace";
      else if (/^\/share\/p\//.test(url.pathname)) route = "share-post";
      else if (/\/posts\//.test(url.pathname)) route = "profile-post";
      const group = url.pathname.match(/^\/groups\/([^/]+)/)?.[1];
      const publicSegments = ["groups", "posts", "permalink", "share", "p", "marketplace", "item", "photo", "photo.php", "videos", "watch", "story.php", "permalink.php", "search", "user", "profile.php"];
      return {
        route,
        pathShape: url.pathname.split("/").filter(Boolean).map((part) => publicSegments.includes(part) ? part : /^\d+$/.test(part) ? ":number" : part.startsWith("pfbid") ? ":pfbid" : ":value"),
        isFragmentLink: href.startsWith("#"),
        accepted: Boolean(postUrl(href)),
        sameGroup: group ? group === location.pathname.match(/^\/groups\/([^/]+)/)?.[1] : null,
        queryKeys: ["story_fbid", "id", "multi_permalinks", "comment_id", "reply_comment_id"].filter((key) => url.searchParams.has(key)),
        hasFragment: Boolean(url.hash),
      };
    } catch {
      return { route: "invalid" };
    }
  }

  function describeNode(node) {
    const roles = ["article", "feed", "main", "button", "link", "dialog", "heading", "list", "listitem"];
    const role = node.getAttribute("role");
    return {
      tag: node.tagName.toLowerCase(),
      role: roles.includes(role) ? role : role ? "other" : null,
      pagelet: node.hasAttribute("data-pagelet") ? (node.getAttribute("data-pagelet").startsWith("FeedUnit") ? "FeedUnit" : "other") : null,
      attributes: ["data-ad-preview", "data-ad-comet-preview", "data-ad-rendering-role", "aria-label", "aria-labelledby", "aria-posinset", "dir", "href"].filter((name) => node.hasAttribute(name)),
      isMessage: node.matches(MESSAGE),
      isComment: isComment(node),
      isSeeMore: node.matches('[role="button"], button') && ["xem thêm", "see more", "더 보기"].includes(textOf(node).toLocaleLowerCase()),
      isDirAuto: node.getAttribute("dir") === "auto",
      hasLayout: node.getClientRects().length > 0,
      insideFormOrDialog: Boolean(node.closest('form, [role="dialog"]')),
      textLength: textOf(node).length,
      link: node.matches('a, [role="link"]') ? linkShape(node.getAttribute("href")) : null,
    };
  }

  function structure(root, limit = 160) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const indexes = new Map();
    const nodes = [];
    let node = root;
    while (node && nodes.length < limit) {
      indexes.set(node, nodes.length);
      nodes.push({ parent: indexes.get(node.parentElement) ?? null, belongsToCandidate: belongsToPost(node, root), ...describeNode(node) });
      node = walker.nextNode();
    }
    return { nodes, truncated: Boolean(node) };
  }

  function selectorCounts(root) {
    return {
      articles: root.querySelectorAll(ARTICLE).length,
      feedUnits: root.querySelectorAll('[data-pagelet^="FeedUnit"]').length,
      messages: root.querySelectorAll(MESSAGE).length,
      dirAuto: root.querySelectorAll('[dir="auto"]').length,
      links: root.querySelectorAll("a[href]").length,
      linksWithoutHref: root.querySelectorAll('[role="link"]:not([href]), a:not([href])').length,
      acceptedLinks: [...root.querySelectorAll("a[href]")].filter((node) => postUrl(node.getAttribute("href"))).length,
      images: root.querySelectorAll("img").length,
    };
  }

  function diagnose() {
    const root = feedRoot();
    const candidates = findCandidates();
    return {
      schemaVersion: 1,
      extensionVersion: VERSION,
      pageType: linkShape(location.href).route,
      scanning,
      lastScan,
      documentCounts: selectorCounts(document),
      selectedRoot: { node: describeNode(root), counts: selectorCounts(root) },
      regions: [...document.querySelectorAll('main, [role="main"], [role="feed"]')].slice(0, 6)
        .map((node) => ({ node: describeNode(node), counts: selectorCounts(node) })),
      candidateCount: candidates.length,
      samples: (candidates.length ? candidates.slice(0, 3) : [root]).map((post) => ({
        hasPermalink: Boolean(findPermalink(post)),
        extractedTextLength: findText(post).length,
        counts: selectorCounts(post),
        structure: structure(post),
      })),
    };
  }

  async function scanFeed(opts, onProgress) {
    const maxPosts = bounded(opts.maxPosts, 60, 300);
    const maxScrolls = bounded(opts.maxScrolls, 60, 120);
    const posts = new Map();
    const expanded = new WeakSet();
    const diagnostics = { candidates: 0, missingLinks: 0, missingText: 0, scrolls: 0, stopReason: "running" };
    lastScan = { maxPosts, maxScrolls, scanned: 0, ...diagnostics };
    const startPath = location.pathname + location.search;
    let previous = "";
    let stalled = 0;

    for (let pass = 0; pass <= maxScrolls; pass++) {
      if (stopRequested) {
        diagnostics.stopReason = "user-stopped";
        break;
      }
      if (location.pathname + location.search !== startPath) throw new Error("Trang Facebook đã thay đổi. Hãy quét lại trên nhóm cần tìm.");
      await expandSeeMore(findCandidates(), expanded);
      if (stopRequested) {
        diagnostics.stopReason = "user-stopped";
        break;
      }
      const candidates = findCandidates();
      collectPosts(candidates, posts, maxPosts, diagnostics);
      lastScan = { maxPosts, maxScrolls, scanned: posts.size, ...diagnostics };
      onProgress({ scanned: posts.size, scroll: pass, ...diagnostics });
      if (posts.size >= maxPosts) {
        diagnostics.stopReason = "post-limit";
        break;
      }
      if (posts.size === 0 && pass >= 12) {
        diagnostics.stopReason = "no-readable-posts";
        break;
      }

      const container = scrollContainer();
      const viewport = container === document.scrollingElement ? window.innerHeight : container.clientHeight;
      const atBottom = container.scrollTop + viewport >= container.scrollHeight - 4;
      const signature = JSON.stringify([
        container.scrollTop, container.scrollHeight,
        candidates.map((post) => [findPermalink(post)?.url, textOf(post)]),
      ]);
      stalled = atBottom && signature === previous ? stalled + 1 : 0;
      previous = signature;
      if (stalled >= 6) {
        diagnostics.stopReason = "feed-stalled";
        break;
      }
      if (pass === maxScrolls) {
        diagnostics.stopReason = "scroll-limit";
        break;
      }
      const step = Math.max(400, Math.floor(viewport * 0.8));
      if (container === document.scrollingElement || container === document.documentElement) {
        window.scrollBy({ top: step, behavior: "instant" });
      } else {
        container.scrollTop += step;
      }
      diagnostics.scrolls++;
      await sleep(1200);
    }
    lastScan = { maxPosts, maxScrolls, scanned: posts.size, ...diagnostics };
    return { posts: [...posts.values()], diagnostics, canceled: stopRequested };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "PING") {
      sendResponse({ ok: true, version: VERSION, isGroup: /^\/groups\/[^/]+/.test(location.pathname), title: document.title });
      return;
    }
    if (msg?.type === "DIAGNOSE") {
      sendResponse({ ok: true, report: diagnose() });
      return;
    }
    if (msg?.type === "STOP_SCAN") {
      stopRequested = scanning;
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type !== "SCAN") return;
    if (scanning) {
      sendResponse({ ok: false, error: "Tab này đang quét. Hãy chờ lượt quét hiện tại kết thúc." });
      return;
    }
    scanning = true;
    stopRequested = false;
    scanFeed(msg.opts || {}, (progress) => chrome.runtime.sendMessage({ type: "SCAN_PROGRESS", ...progress }).catch(() => {}))
      .then((result) => sendResponse({ ok: true, ...result, groupTitle: document.title, groupUrl: location.href }))
      .catch((error) => {
        lastScan = { ...lastScan, stopReason: "error" };
        sendResponse({ ok: false, error: String(error) });
      })
      .finally(() => { scanning = false; });
    return true;
  });
})();
