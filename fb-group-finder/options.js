import { resolveModel } from "./gemini-model.js";

/** @type {HTMLInputElement} */
const keyInput = document.querySelector("#key");
/** @type {HTMLInputElement} */
const modelInput = document.querySelector("#model");

chrome.storage.sync.get(["geminiApiKey", "geminiModel"]).then((s) => {
  if (s.geminiApiKey) keyInput.value = s.geminiApiKey;
  modelInput.value = resolveModel(s.geminiModel);
}).catch((e) => { document.getElementById("msg").textContent = e.message; });
document.getElementById("save").onclick = async () => {
  try {
    const geminiModel = resolveModel(modelInput.value);
    await chrome.storage.sync.set({
      geminiApiKey: keyInput.value.trim(),
      geminiModel,
    });
    modelInput.value = geminiModel;
    document.getElementById("msg").textContent = "Đã lưu.";
    setTimeout(() => (document.getElementById("msg").textContent = ""), 1500);
  } catch (e) {
    document.getElementById("msg").textContent = e.message;
  }
};
