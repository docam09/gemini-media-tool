chrome.storage.sync.get(["geminiApiKey", "geminiModel"]).then((s) => {
  if (s.geminiApiKey) document.getElementById("key").value = s.geminiApiKey;
  if (s.geminiModel) document.getElementById("model").value = s.geminiModel;
});
document.getElementById("save").onclick = async () => {
  await chrome.storage.sync.set({
    geminiApiKey: document.getElementById("key").value.trim(),
    geminiModel: document.getElementById("model").value,
  });
  document.getElementById("msg").textContent = "Đã lưu.";
  setTimeout(() => (document.getElementById("msg").textContent = ""), 1500);
};
