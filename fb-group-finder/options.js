/** @type {HTMLInputElement} */
const keyInput = document.querySelector("#key");
/** @type {HTMLSelectElement} */
const modelInput = document.querySelector("#model");

chrome.storage.sync.get(["geminiApiKey", "geminiModel"]).then((s) => {
  if (s.geminiApiKey) keyInput.value = s.geminiApiKey;
  if (s.geminiModel) modelInput.value = s.geminiModel;
});
document.getElementById("save").onclick = async () => {
  await chrome.storage.sync.set({
    geminiApiKey: keyInput.value.trim(),
    geminiModel: modelInput.value,
  });
  document.getElementById("msg").textContent = "Đã lưu.";
  setTimeout(() => (document.getElementById("msg").textContent = ""), 1500);
};
