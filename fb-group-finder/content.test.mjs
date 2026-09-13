import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./content.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
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
    images: [],
    comments: [{ author: "người mua", text: "Nội dung bình luận" }],
  });
});

const photo = (name, attrs = "") => `<a href="/photo/?fbid=${name}" role="link"><img src="https://scontent.xx.fbcdn.net/v/t39/${name}.jpg" ${attrs} /></a>`;

test("collects post photos but not avatars, icons, emoji, external or comment images", async (t) => {
  const f = fixture(t, `<div role="article">
    <h2><img src="https://scontent.xx.fbcdn.net/v/t1/avatar.jpg" width="40" height="40" /> Người bán</h2>
    <a href="/groups/123/posts/10/" aria-label="1 giờ">1h</a>
    <div data-ad-preview="message">Bảng giá trong ảnh <img src="https://static.xx.fbcdn.net/images/emoji.php/v9/t1/1/16/1f600.png" width="16" height="16" /></div>
    ${photo("p1")}${photo("p1")}${photo("p2", 'width="720" height="960"')}${photo("p3")}${photo("p4")}${photo("p5")}
    <img src="https://scontent.xx.fbcdn.net/v/t1/small.jpg" width="48" height="48" />
    <img src="https://static.xx.fbcdn.net/rsrc.php/v3/like.png" />
    <img src="https://example.com/catalog.jpg" />
    <img src="data:image/png;base64,AAAA" />
    <div role="button"><img src="https://scontent.xx.fbcdn.net/v/t1/button.jpg" /></div>
    <div role="article" aria-label="Bình luận của Khách"><div dir="auto">Có ảnh thật không?</div>
      <img src="https://scontent.xx.fbcdn.net/v/t1/comment-photo.jpg" width="400" height="300" /></div>
  </div>`);
  const { posts } = await f.scan();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].images, ["p1", "p2", "p3", "p4"].map((name) => `https://scontent.xx.fbcdn.net/v/t39/${name}.jpg`));
  assert.equal(posts[0].text, "Bảng giá trong ảnh");
  assert.deepEqual(posts[0].comments, [{ author: "Khách", text: "Có ảnh thật không?" }]);
});

test("reads visible comments and replies of the right post without controls, inputs or comment links", async (t) => {
  const comments = (id) => `
    <div role="article" aria-label="Comment by Seller">
      <h3><a href="/user/1/">Seller</a></h3>
      <div dir="auto">Giá ${id} là 850k</div><a href="/groups/123/posts/${id}/?comment_id=5">1h</a>
      <div role="button"><span dir="auto">Thích</span></div>
      <ul><li><span dir="auto">Trả lời</span></li></ul>
      <div role="article" aria-label="Phản hồi của Người mua"><div dir="auto">Để em ${id} ạ</div></div>
    </div>
    <div role="button"><span dir="auto">Xem thêm bình luận</span></div>
    <form><div role="textbox" dir="auto" aria-label="Viết bình luận">Viết bình luận...</div></form>`;
  const f = fixture(t, post("10", "Tiger 10", comments(10)) + post("20", "Tiger 20", comments(20)) + post("30", "Tiger 30"));
  const { posts, diagnostics } = await f.scan();
  assert.deepEqual(posts.map((p) => p.url), [10, 20, 30].map((id) => `https://www.facebook.com/groups/123/posts/${id}/`));
  assert.deepEqual(posts[0].comments, [
    { author: "Seller", text: "Giá 10 là 850k" },
    { author: "Người mua", text: "Để em 10 ạ" },
  ]);
  assert.deepEqual(posts[1].comments.map((c) => c.text), ["Giá 20 là 850k", "Để em 20 ạ"]);
  assert.deepEqual(posts[2].comments, []);
  assert.equal(posts[0].text, "Tiger 10");
  assert.equal(diagnostics.comments, 4);
  assert.equal(diagnostics.images, 0);
  assert.equal(f.progress.at(-1).comments, 4);
});

test("caps comments and images per post and refreshes a post once more comments render", async (t) => {
  const many = Array.from({ length: 15 }, (_, i) => `<div role="article" aria-label="Bình luận của A${i}"><div dir="auto">C${i}</div></div>`).join("");
  const f = fixture(t, post("10", "Tiger", photo("p1")), { height: 3000, onScroll: (n, window) => {
    if (n === 1) window.document.querySelector('[role="article"]').insertAdjacentHTML("beforeend", many);
  } });
  const { posts } = await f.scan();
  assert.equal(posts[0].comments.length, 12);
  assert.equal(posts[0].comments[0].author, "A0");
  assert.deepEqual(posts[0].images, ["https://scontent.xx.fbcdn.net/v/t39/p1.jpg"]);
});

test("reports image and comment counts in diagnostics without exposing their content", async (t) => {
  const f = fixture(t, post("10", "Tiger", photo("secret-photo") +
    '<div role="article" aria-label="Bình luận của Khách"><div dir="auto">SECRET COMMENT 0912345678</div></div>'));
  const { report } = await f.send({ type: "DIAGNOSE" });
  assert.equal(report.samples[0].imageCount, 1);
  assert.equal(report.samples[0].commentCount, 1);
  assert.equal(report.selectedRoot.counts.postImages, 1);
  assert.equal(report.selectedRoot.counts.commentArticles, 1);
  const dump = JSON.stringify(report);
  assert.ok(!dump.includes("secret-photo") && !dump.includes("SECRET COMMENT") && !dump.includes("0912345678") && !dump.includes("Khách"));
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
  assert.equal(report.extensionVersion, manifest.version);
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

const unresolvedCard = (id) => `<section>
  <header><h3><a href="/groups/123/user/456/">Người bán</a></h3>
    <span role="link" data-test-post="${id}" tabindex="0">2 giờ</span></header>
  <div><div data-ad-preview="message">Tiger ${id} - 900k
    <a href="https://example.com/catalog">Catalog</a></div></div>
</section>`;
const loadingArticle = '<div role="article"><div role="status" aria-label="Loading"><div></div></div></div>';

test("finds seven text cards despite two empty article placeholders and zero permalinks", async (t) => {
  const f = fixture(t, Array.from({ length: 7 }, (_, i) => unresolvedCard(i + 1)).join("") + loadingArticle.repeat(2));
  const { report } = await f.send({ type: "DIAGNOSE" });
  assert.equal(report.documentCounts.articles, 2);
  assert.equal(report.documentCounts.messages, 7);
  assert.equal(report.documentCounts.acceptedLinks, 0);
  assert.equal(report.candidateCount, 7);
  assert.ok(report.samples.every((sample) => sample.extractedTextLength > 0 && !sample.hasPermalink));
  assert.ok(report.samples[0].links.some((link) => link.link?.route === "missing"));
});

test("waits for header focus to reveal permalinks without clicking or joining adjacent posts", async (t) => {
  const pending = [];
  const f = fixture(t, unresolvedCard("10") + unresolvedCard("20") + loadingArticle.repeat(2), {
    onWait: () => {
      for (const link of pending.splice(0)) {
        link.setAttribute("href", `/groups/123/posts/${link.dataset.testPost}/`);
      }
    },
  });
  let clicks = 0;
  let bodyFocus = 0;
  f.window.document.addEventListener("click", () => { clicks++; });
  f.window.document.querySelectorAll('[data-ad-preview="message"] a, h3 a').forEach((link) =>
    link.addEventListener("focusin", () => { bodyFocus++; }));
  f.window.document.querySelectorAll("[data-test-post]").forEach((link) =>
    link.addEventListener("focusin", () => pending.push(link)));
  const beforeFocus = f.window.document.activeElement;
  const result = await f.scan({ maxPosts: 2 });
  assert.deepEqual(result.posts.map((post) => post.url), [
    "https://www.facebook.com/groups/123/posts/10/",
    "https://www.facebook.com/groups/123/posts/20/",
  ]);
  assert.match(result.posts[0].text, /Tiger 10/);
  assert.doesNotMatch(result.posts[0].text, /Tiger 20/);
  assert.equal(result.diagnostics.linkActivations, 2);
  assert.equal(f.scrolls, 0);
  assert.equal(clicks, 0);
  assert.equal(bodyFocus, 0);
  assert.equal(f.window.document.activeElement, beforeFocus);
});

test("keeps text diagnostics when focus cannot resolve a link, without repeated focus or fabricated URLs", async (t) => {
  const f = fixture(t, unresolvedCard("10") + loadingArticle);
  let activations = 0;
  f.window.document.querySelector("[data-test-post]").addEventListener("focusin", () => { activations++; });
  const result = await f.scan();
  assert.equal(activations, 1);
  assert.equal(result.posts.length, 0);
  assert.equal(result.diagnostics.candidates, 1);
  assert.equal(result.diagnostics.missingLinks, 1);
  assert.equal(result.diagnostics.missingText, 0);
});

test("supports an unwrapped message without treating neighboring timestamps as its link", async (t) => {
  const f = fixture(t, '<a href="#">1 giờ</a><div data-ad-preview="message">Tiger 900k</div>' +
    '<a href="#">2 giờ</a><div data-ad-preview="message">Toshiba 800k</div>');
  const result = await f.scan();
  assert.equal(result.posts.length, 0);
  assert.equal(result.diagnostics.candidates, 2);
  assert.equal(result.diagnostics.missingText, 0);
});

test("honors cancellation while waiting for a permalink", async (t) => {
  const f = fixture(t, unresolvedCard("10"), {
    onWait: (delay) => {
      if (delay === 600) f.send({ type: "STOP_SCAN" });
    },
  });
  const result = await f.scan();
  assert.equal(result.canceled, true);
  assert.equal(result.posts.length, 0);
  assert.equal(result.diagnostics.linkActivations, 1);
  assert.equal(f.scrolls, 0);
});

test("aborts a group change during link resolution before collecting the new group's posts", async (t) => {
  const f = fixture(t, unresolvedCard("10"), {
    onWait: (delay, window) => {
      if (delay !== 600) return;
      window.history.pushState({}, "", "/groups/456/");
      window.document.querySelector('[role="feed"]').innerHTML = post("20").replace("/groups/123/", "/groups/456/");
    },
  });
  const result = await f.scan({ maxPosts: 1 });
  assert.equal(result.ok, false);
  assert.match(result.error, /đã thay đổi/);
  assert.equal(f.scrolls, 0);
});
