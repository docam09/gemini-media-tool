import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./content.js", import.meta.url), "utf8");
const post = (id, text = "Nồi cơm Tiger 1,2 triệu", extra = "") => `
  <div role="article"><h2>Người bán</h2>
    <a href="/groups/123/posts/${id}/?__cft__=tracking" aria-label="1 giờ">1h</a>
    <div data-ad-preview="message">${text}</div>${extra}
  </div>`;

function fixture(t, html, { height = 800, onScroll = () => {}, onWait = () => {} } = {}) {
  const dom = new JSDOM(`<main><section role="feed">${html}</section></main>`, {
    url: "https://www.facebook.com/groups/123/",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() { return this.textContent; },
  });
  const listeners = [];
  const progress = [];
  let scrolls = 0;
  let waited = 0;
  const scroller = window.document.documentElement;
  Object.defineProperties(scroller, {
    scrollHeight: { configurable: true, get: () => height },
    clientHeight: { get: () => 800 },
  });
  Object.defineProperty(window.document, "scrollingElement", { value: scroller });
  Object.defineProperty(window, "innerHeight", { value: 800 });
  window.scrollBy = ({ top }) => {
    assert.ok(top <= 800, "scroll must not skip whole screens of virtualized posts");
    scroller.scrollTop = Math.min(Math.max(0, height - 800), scroller.scrollTop + top);
    onScroll(++scrolls, window);
  };
  window.scrollTo = (_left, top) => {
    scroller.scrollTop = Math.min(Math.max(0, height - 800), top);
    onScroll(++scrolls, window);
  };
  window.setTimeout = (callback, delay) => setImmediate(() => {
    waited += delay;
    onWait(delay, window, waited);
    callback();
  });
  window.chrome = {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage: async (message) => { progress.push(message); },
    },
  };
  window.eval(source);
  const send = (message) => new Promise((resolve) => {
    listeners[0](message, {}, (response) => resolve(JSON.parse(JSON.stringify(response))));
  });
  return {
    window, listeners, progress,
    scan: (opts = {}) => send({ type: "SCAN", opts: { maxPosts: 60, maxScrolls: 12, ...opts } }),
    send,
    get scrolls() { return scrolls; },
  };
}

test("extracts classic articles and excludes comments and repeated URL variants", async (t) => {
  const comment = `<div role="article" aria-label="Bình luận của người mua">
    <a href="/groups/123/posts/20/?comment_id=30">Bình luận</a>
    <div data-ad-preview="message">Nội dung bình luận</div></div>`;
  const f = fixture(t, post("10", "Tiger 1,2 triệu", comment) +
    post("10", "Tiger 1,2 triệu").replace("/posts/10/", "/permalink/10/"));
  const result = await f.scan();
  assert.equal(result.posts.length, 1);
  assert.deepEqual(result.posts[0], {
    id: "https://www.facebook.com/groups/123/posts/10/",
    url: "https://www.facebook.com/groups/123/posts/10/",
    author: "Người bán",
    time: "1 giờ",
    text: "Tiger 1,2 triệu",
  });
});

test("extracts FeedUnit and message-only cards without role=article", async (t) => {
  const f = fixture(t, `
    <div data-pagelet="FeedUnit_0">
      <h3>Lan</h3><a href="/groups/123/posts/pfbidABC123/">2h</a>
      <div data-ad-rendering-role="story_message">Tiger 900k</div>
    </div>
    <div><header><a href="/groups/123/?multi_permalinks=42&ref=share">3h</a></header>
      <div><div data-ad-comet-preview="message">Tiger 1 triệu</div></div>
    </div>`);
  const result = await f.scan();
  assert.deepEqual(result.posts.map((p) => p.url), [
    "https://www.facebook.com/groups/123/posts/pfbidABC123/",
    "https://www.facebook.com/groups/123/posts/42/",
  ]);
  assert.equal(result.posts[0].text, "Tiger 900k");
});

test("preserves short dir=auto text but excludes comment and button text", async (t) => {
  const f = fixture(t, `<article>
    <a href="/groups/123/posts/10/">1h</a><span dir="auto">Tiger 900k</span>
    <button><span dir="auto">Thích</span></button>
    <div role="article"><div dir="auto">Comment with a much longer text</div></div>
  </article>`);
  const { posts } = await f.scan();
  assert.equal(posts[0].text, "Tiger 900k");
});

test("extracts a FeedUnit even when only its comments have article roles", async (t) => {
  const f = fixture(t, `<div data-pagelet="FeedUnit_0">
    <a href="/groups/123/posts/10/">1h</a>
    <div data-ad-preview="message">Tiger 1,2 triệu</div>
    <div role="article" aria-label="Comment by buyer">
      <a href="/groups/123/posts/10/?comment_id=20">Comment</a>
      <div data-ad-preview="message">Price?</div>
    </div>
  </div><div data-pagelet="FeedUnit_1">${post("20")}</div>`);
  const { posts } = await f.scan();
  assert.equal(posts.length, 2);
  assert.equal(posts[0].text, "Tiger 1,2 triệu");
  assert.equal(posts[1].author, "Người bán");
});

test("finds separate unmarked post cards via permalinks and dir=auto text", async (t) => {
  const f = fixture(t, `<div>
    <section><header><a href="/groups/123/posts/10/">1h</a></header>
      <div dir="auto">Tiger 900k</div></section>
    <section><header><a href="/groups/123/posts/20/">2h</a></header>
      <div dir="auto">Tiger 1 triệu</div></section>
  </div>`);
  const { posts } = await f.scan();
  assert.deepEqual(posts.map((p) => p.text), ["Tiger 900k", "Tiger 1 triệu"]);
});

test("normalizes story.php regardless of query order and retains share links", async (t) => {
  const f = fixture(t, post("10").replace(
    "/groups/123/posts/10/?__cft__=tracking", "/story.php?id=123&ref=share&story_fbid=pfbidXYZ",
  ) + post("20").replace("/groups/123/posts/20/?__cft__=tracking", "/share/p/ABC/?mibextid=abc"));
  const { posts } = await f.scan();
  assert.deepEqual(posts.map((p) => p.url), [
    "https://www.facebook.com/permalink.php?story_fbid=pfbidXYZ&id=123",
    "https://www.facebook.com/share/p/ABC/",
  ]);
});

test("rejects external lookalike links, comments, and other group links", async (t) => {
  const f = fixture(t, `<article>
    <a href="https://example.com/groups/123/posts/10/">External</a>
    <a href="/groups/123/posts/10/?reply_comment_id=9">Comment</a>
    <a href="/groups/456/posts/10/">Another group</a>
    <div data-ad-preview="message">Tiger 900k</div>
  </article>`);
  const result = await f.scan();
  assert.equal(result.posts.length, 0);
  assert.equal(result.diagnostics.missingLinks, 1);
  assert.equal(result.diagnostics.missingText, 0);
});

test("waits for asynchronous See more before storing text", async (t) => {
  let clicked = false;
  const f = fixture(t, post("10", "Tiger...", '<button id="more">Xem thêm</button>'), {
    onWait: (delay, window) => {
      if (clicked && delay === 400) window.document.querySelector('[data-ad-preview]').textContent = "Tiger 1,2 triệu, còn hàng";
    },
  });
  f.window.document.querySelector("#more").onclick = () => { clicked = true; };
  const result = await f.scan({ maxPosts: 1 });
  assert.equal(result.posts[0].text, "Tiger 1,2 triệu, còn hàng");
  assert.equal(f.scrolls, 0);
});

test("continues beyond three empty screens and extracts a late-rendered post", async (t) => {
  const f = fixture(t, "", {
    height: 15000,
    onScroll: (count, window) => {
      if (count === 5) window.document.querySelector('[role="feed"]').innerHTML = post("55");
    },
  });
  const result = await f.scan({ maxPosts: 1 });
  assert.equal(result.posts.length, 1);
  assert.equal(f.scrolls, 5);
  assert.equal(result.diagnostics.stopReason, "post-limit");
});

test("waits at the bottom for delayed loading instead of stopping on the fourth pass", async (t) => {
  const f = fixture(t, "", {
    onScroll: (count, window) => {
      if (count === 5) window.document.querySelector('[role="feed"]').innerHTML = post("55");
    },
  });
  const result = await f.scan({ maxPosts: 1 });
  assert.equal(result.posts.length, 1);
  assert.equal(f.scrolls, 5);
});

test("keeps posts after a virtualized feed unmounts each previous screen", async (t) => {
  const f = fixture(t, post("1"), {
    height: 15000,
    onScroll: (count, window) => {
      window.document.querySelector('[role="feed"]').innerHTML = post(String(count + 1));
    },
  });
  const result = await f.scan({ maxPosts: 4 });
  assert.equal(result.posts.length, 4);
  assert.equal(f.scrolls, 3);
});

test("stops on a stationary feed with diagnostics and bounded scrolling", async (t) => {
  const f = fixture(t, '<article><div data-ad-preview="message">Tiger 1 triệu</div></article>');
  const result = await f.scan({ maxScrolls: 100 });
  assert.equal(result.posts.length, 0);
  assert.equal(result.diagnostics.candidates, 1);
  assert.equal(result.diagnostics.missingLinks, 1);
  assert.equal(result.diagnostics.stopReason, "feed-stalled");
  assert.equal(f.scrolls, 6);
});

test("collects the final screen when the scroll budget is exhausted", async (t) => {
  const f = fixture(t, "", {
    height: 15000,
    onScroll: (count, window) => {
      if (count === 2) window.document.querySelector('[role="feed"]').innerHTML = post("10");
    },
  });
  const result = await f.scan({ maxScrolls: 2 });
  assert.equal(result.posts.length, 1);
  assert.equal(f.scrolls, 2);
  assert.equal(result.diagnostics.stopReason, "scroll-limit");
});

test("uses the feed's scrollable ancestor", async (t) => {
  const f = fixture(t, post("10"));
  const main = f.window.document.querySelector("main");
  main.style.overflowY = "auto";
  Object.defineProperties(main, { scrollHeight: { value: 8000 }, clientHeight: { value: 800 } });
  await f.scan({ maxScrolls: 2 });
  assert.equal(main.scrollTop, 1280);
  assert.equal(f.scrolls, 0);
});

test("does not register duplicate listeners or allow concurrent scans", async (t) => {
  const f = fixture(t, post("10"));
  f.window.eval(source);
  assert.equal(f.listeners.length, 1);
  const first = f.scan();
  const second = await f.scan();
  assert.equal(second.ok, false);
  assert.match(second.error, /đang quét/);
  assert.equal((await first).ok, true);
});

test("aborts if Facebook navigates to another group during the scan", async (t) => {
  const f = fixture(t, post("10"), {
    onScroll: (_count, window) => window.history.pushState({}, "", "/groups/456/"),
  });
  const result = await f.scan();
  assert.equal(result.ok, false);
  assert.match(result.error, /đã thay đổi/);
});

test("diagnostics preserve useful structure without content, URLs, identifiers, or secrets", async (t) => {
  const f = fixture(t, `<article id="PERSONAL_ID">
    <h2>PRIVATE_AUTHOR</h2>
    <a href="/groups/123/posts/pfbidPrivatePost/?token=PRIVATE_TOKEN" aria-label="PRIVATE_DATE">PRIVATE_LABEL</a>
    <div data-ad-preview="message">PRIVATE_POST_TEXT 0987654321</div>
    <img src="https://example.com/PRIVATE_PHOTO">
    <input type="password" value="PRIVATE_PASSWORD">
    <script>window.key = 'PRIVATE_KEY';</script>
  </article>`);
  f.window.document.title = "PRIVATE_GROUP_TITLE";
  const { report } = await f.send({ type: "DIAGNOSE" });
  const json = JSON.stringify(report);
  assert.equal(report.extensionVersion, "0.1.2");
  assert.equal(report.candidateCount, 1);
  assert.equal(report.samples[0].hasPermalink, true);
  assert.ok(report.samples[0].extractedTextLength > 0);
  assert.ok(report.samples[0].structure.nodes.some((node) => node.link?.route === "group-post"));
  assert.doesNotMatch(json, /PRIVATE|PrivatePost|0987654321|PERSONAL_ID|https:|\/groups\/123/);
});

test("diagnostics expose missing hrefs and messages outside the selected feed", async (t) => {
  const f = fixture(t, '<article><span role="link">2 giờ</span><div data-ad-preview="message">Tiger 1 triệu</div></article>');
  f.window.document.body.insertAdjacentHTML("beforeend", '<section role="feed"><article><a href="/groups/123/posts/10/">1h</a></article></section>');
  const { report } = await f.send({ type: "DIAGNOSE" });
  assert.equal(report.samples[0].hasPermalink, false);
  assert.equal(report.selectedRoot.counts.linksWithoutHref, 1);
  assert.equal(report.selectedRoot.counts.acceptedLinks, 0);
  assert.equal(report.documentCounts.acceptedLinks, 1);
  assert.equal(report.regions.filter((region) => region.node.role === "feed").length, 2);
});

test("diagnostic samples are bounded on a large page", async (t) => {
  const f = fixture(t, post("10", "Tiger", "<span>Extra text</span>".repeat(1000)).repeat(5));
  const { report } = await f.send({ type: "DIAGNOSE" });
  assert.equal(report.samples.length, 3);
  assert.equal(report.samples[0].structure.nodes.length, 160);
  assert.equal(report.samples[0].structure.truncated, true);
});

test("stops an unreadable moving feed after twelve scrolls with an explicit reason", async (t) => {
  const f = fixture(t, '<article><div data-ad-preview="message">Tiger</div></article>', { height: 100000 });
  const result = await f.scan({ maxScrolls: 120 });
  assert.equal(result.diagnostics.stopReason, "no-readable-posts");
  assert.equal(f.scrolls, 12);
  assert.equal(result.posts.length, 0);
  assert.equal(f.progress.at(-1).missingLinks, 1);
});

test("a stop request cancels the in-flight scan before another scroll", async (t) => {
  const f = fixture(t, post("10"), { height: 15000 });
  const scan = f.scan();
  await f.send({ type: "STOP_SCAN" });
  const result = await scan;
  assert.equal(result.canceled, true);
  assert.equal(result.diagnostics.stopReason, "user-stopped");
  assert.equal(f.scrolls, 0);
});
