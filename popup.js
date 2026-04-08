
const enabledToggle = document.getElementById("enabledToggle");
const statusEl = document.getElementById("status");
const inputText = document.getElementById("inputText");
const outputText = document.getElementById("outputText");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

function setStatus(text) { statusEl.textContent = text; }

chrome.storage.sync.get({ enabled: true, popupInput: "" }, (result) => {
  enabledToggle.checked = !!result.enabled;
  setStatus(result.enabled ? "Đang bật trên trang web" : "Đang tắt trên trang web");
  inputText.value = result.popupInput || "";
  refreshOutput();
});

enabledToggle.addEventListener("change", () => {
  const enabled = enabledToggle.checked;
  chrome.storage.sync.set({ enabled }, () => {
    setStatus(enabled ? "Đang bật trên trang web" : "Đang tắt trên trang web");
  });
});

function refreshOutput() {
  const converted = window.MiniUniKeyEngine.processText(inputText.value);
  outputText.value = converted;
  chrome.storage.sync.set({ popupInput: inputText.value });
}

inputText.addEventListener("input", refreshOutput);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(outputText.value);
  } catch (_) {
    outputText.select();
    document.execCommand("copy");
  }
  const old = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  setTimeout(() => copyBtn.textContent = old, 1000);
});

clearBtn.addEventListener("click", () => {
  inputText.value = "";
  outputText.value = "";
  chrome.storage.sync.set({ popupInput: "" });
  inputText.focus();
});
