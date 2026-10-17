import { xray } from "../lib/api.js";
let timer, generation = 0;
const status = document.querySelector("#status");
function watch(job) {
  const run = ++generation;
  clearTimeout(timer);
  for (const id of ["symbol", "sections", "summary", "questions"]) document.querySelector(`#${id}`).replaceChildren();
  if (job?.error) { status.textContent = job.error; return; }
  status.textContent = "Starting X-ray…";
  if (!job?.xray_id) return;
  async function poll() {
    try {
      const data = await xray(job.xray_id);
      if (run !== generation) return;
      status.textContent = data.status;
      document.querySelector("#symbol").textContent = data.symbol;
      document.querySelector("#sections").replaceChildren(...Object.entries(data.sections).map(([name, section]) => {
        const article = document.createElement("article"), heading = document.createElement("h3"), pre = document.createElement("pre");
        heading.textContent = name; pre.textContent = JSON.stringify(section.data, null, 2);
        article.append(heading, pre); return article;
      }));
      document.querySelector("#summary").textContent = data.summary || "";
      document.querySelector("#questions").replaceChildren(...data.questions.map(question => {
        const li = document.createElement("li"); li.textContent = question; return li;
      }));
      if (!["done", "error"].includes(data.status)) timer = setTimeout(poll, 1000);
    } catch (error) { if (run === generation) status.textContent = error.message; }
  }
  poll();
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.xrayJob) watch(changes.xrayJob.newValue); });
const { xrayJob } = await chrome.storage.local.get("xrayJob");
if (xrayJob) watch(xrayJob);
