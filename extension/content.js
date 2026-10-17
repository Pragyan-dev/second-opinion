// Injected only by the Analyze button. Owner A.
(() => {
  if (window.SecondOpinion) return;
  function extractPage() {
    const text = document.body.innerText.slice(0, 20000);
    const anchors = [...document.querySelectorAll("a[href]")];
    return {
      url: location.href, title: document.title, text,
      links: [...new Set(anchors.map(a => a.href))],
      emails: [...new Set(anchors.filter(a => a.href.startsWith("mailto:")).map(a => a.href.slice(7).split("?")[0]))],
      phones: [...new Set(anchors.filter(a => a.href.startsWith("tel:")).map(a => a.href.slice(4)))],
      tickers: [...new Set([...text.matchAll(/\$([A-Z]{1,5})\b/g)].map(m => m[1]))],
    };
  }
  function highlightTickers() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest("script,style,textarea,input,button,a,[contenteditable],.second-opinion-ticker") && /\$[A-Z]{1,5}\b/.test(node.textContent)) nodes.push(node);
    }
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const match of node.textContent.matchAll(/\$([A-Z]{1,5})\b/g)) {
        fragment.append(document.createTextNode(node.textContent.slice(last, match.index)));
        const span = document.createElement("span");
        span.className = "second-opinion-ticker";
        span.textContent = match[0];
        span.style.cssText = "cursor:pointer;text-decoration:underline dotted;text-underline-offset:4px";
        span.setAttribute("role", "button"); span.tabIndex = 0;
        span.title = "Open Second Opinion Stock X-ray (demo)";
        const open = () => chrome.runtime.sendMessage({ type: "XRAY", symbol: match[1] }).catch(console.error);
        span.addEventListener("click", open);
        span.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(); } });
        fragment.append(span); last = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(node.textContent.slice(last)));
      node.replaceWith(fragment);
    }
  }
  // TODO(A): refine extraction for complex pages while preserving the capture contract.
  window.SecondOpinion = { extractPage, highlightTickers };
})();
