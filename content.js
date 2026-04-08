
(() => {
  let enabled = true;
  let isApplying = false;
  const pendingMap = new WeakMap();
  const stateMap = new WeakMap();

  chrome.storage.sync.get({ enabled: true }, (result) => {
    enabled = !!result.enabled;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.enabled) {
      enabled = !!changes.enabled.newValue;
    }
  });

  function isSupportedInputType(type) {
    const t = (type || "text").toLowerCase();
    return ["text", "search", "url", "tel", "email", ""].includes(t);
  }

  function isPasswordInput(el) {
    return el instanceof HTMLInputElement && (el.type || "").toLowerCase() === "password";
  }

  function isEditableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (isPasswordInput(el)) return false;
    if (el instanceof HTMLInputElement) return isSupportedInputType(el.type);
    if (el.isContentEditable) return true;
    if (el.getAttribute("contenteditable") === "" || el.getAttribute("contenteditable") === "true") return true;
    if ((el.getAttribute("role") || "").toLowerCase() === "textbox") return true;
    return false;
  }

  function shouldIgnore(el) {
    if (isPasswordInput(el)) return true;
    if (!isEditableElement(el)) return true;
    if (el.closest("[data-mini-unikey-ignore='true']")) return true;
    if (el.readOnly || el.disabled) return true;
    return false;
  }

  function isWordChar(ch) {
    return !!ch && /\p{L}/u.test(ch);
  }

  function isAsciiLetter(ch) {
    return /^[A-Za-z]$/.test(ch || "");
  }

  function getWordBounds(text, caret) {
    let start = caret;
    let end = caret;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
    return { start, end };
  }

  function dispatchInputEvent(el) {
    el.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      composed: true,
      data: null,
      inputType: "insertText"
    }));
  }

  function clearState(el) {
    stateMap.delete(el);
  }

  function replaceRangeValue(el, start, end, replacement, caret) {
    const value = el.value;
    el.value = value.slice(0, start) + replacement + value.slice(end);
    try { el.setSelectionRange(caret, caret); } catch (_) {}
    dispatchInputEvent(el);
  }

  function processWithRawBufferInput(el, pending) {
    if (!pending) return false;
    const state = stateMap.get(el);

    if (pending.inputType === "deleteContentBackward") {
      if (
        state &&
        pending.selStart === pending.selEnd &&
        pending.selStart === state.wordStart + state.transformed.length
      ) {
        const currentCaret = el.selectionStart ?? 0;
        state.raw = state.raw.slice(0, -1);
        const newText = window.MiniUniKeyEngine.processWord(state.raw);
        isApplying = true;
        replaceRangeValue(el, state.wordStart, currentCaret, newText, state.wordStart + newText.length);
        isApplying = false;
        if (state.raw) {
          state.transformed = newText;
          stateMap.set(el, state);
        } else {
          clearState(el);
        }
        return true;
      }
      clearState(el);
      return false;
    }

    if (pending.inputType !== "insertText" || !isAsciiLetter(pending.data)) {
      if (pending.inputType === "insertText" && pending.data && !isWordChar(pending.data)) {
        clearState(el);
      }
      return false;
    }

    const ch = pending.data;
    const caret = el.selectionStart ?? 0;

    if (
      state &&
      pending.selStart === pending.selEnd &&
      pending.selStart === state.wordStart + state.transformed.length
    ) {
      state.raw += ch;
      const newText = window.MiniUniKeyEngine.processWord(state.raw);
      isApplying = true;
      replaceRangeValue(el, state.wordStart, caret, newText, state.wordStart + newText.length);
      isApplying = false;
      state.transformed = newText;
      stateMap.set(el, state);
      return true;
    }

    const oldValue = pending.oldValue || "";
    const oldBounds = getWordBounds(oldValue, pending.selStart);
    const oldWord = oldValue.slice(oldBounds.start, oldBounds.end);

    if (
      pending.selStart === pending.selEnd &&
      oldWord &&
      /^[A-Za-z]+$/.test(oldWord) &&
      pending.selStart === oldBounds.end
    ) {
      const raw = oldWord + ch;
      const newText = window.MiniUniKeyEngine.processWord(raw);
      const currentBounds = getWordBounds(el.value, caret);
      isApplying = true;
      replaceRangeValue(el, currentBounds.start, currentBounds.end, newText, oldBounds.start + newText.length);
      isApplying = false;
      stateMap.set(el, { wordStart: oldBounds.start, raw, transformed: newText });
      return true;
    }

    if (
      pending.selStart === pending.selEnd &&
      (pending.selStart === 0 || !isWordChar(oldValue[pending.selStart - 1]))
    ) {
      const raw = ch;
      const newText = window.MiniUniKeyEngine.processWord(raw);
      stateMap.set(el, { wordStart: pending.selStart, raw, transformed: newText });
      if (newText !== ch) {
        isApplying = true;
        replaceRangeValue(el, pending.selStart, caret, newText, pending.selStart + newText.length);
        isApplying = false;
      }
      return true;
    }

    return false;
  }

  function processInputOrTextarea(el) {
    const pending = pendingMap.get(el);
    if (pending) pendingMap.delete(el);
    if (processWithRawBufferInput(el, pending)) return;

    const value = el.value || "";
    const caret = el.selectionStart ?? 0;
    const bounds = getWordBounds(value, caret);
    const word = value.slice(bounds.start, bounds.end);
    if (!word || !/\p{L}/u.test(word)) return;

    const convertedWord = window.MiniUniKeyEngine.processWord(word);
    if (convertedWord === word) return;

    const beforeCaretWordPart = value.slice(bounds.start, caret);
    const newCaret = bounds.start + window.MiniUniKeyEngine.processWord(beforeCaretWordPart).length;

    isApplying = true;
    replaceRangeValue(el, bounds.start, bounds.end, convertedWord, newCaret);
    isApplying = false;
    stateMap.set(el, { wordStart: bounds.start, raw: word, transformed: convertedWord });
  }

  function getSelectionInfo(root) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;
    return { selection: sel, range, container: range.startContainer, offset: range.startOffset };
  }

  function getTextNodeAndOffset(container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      return { node: container, offset: Math.min(offset, container.nodeValue.length) };
    }

    const childNodes = container.childNodes || [];
    const previousChild = offset > 0 ? childNodes[offset - 1] : null;
    const nextChild = offset < childNodes.length ? childNodes[offset] : null;
    const previousText = previousChild ? getEdgeTextNode(previousChild, "last") : null;
    if (previousText) return { node: previousText, offset: previousText.nodeValue.length };

    const nextText = nextChild ? getEdgeTextNode(nextChild, "first") : null;
    if (nextText) return { node: nextText, offset: 0 };

    const currentText = getEdgeTextNode(container, "first");
    if (!currentText) return null;
    return { node: currentText, offset: Math.min(offset, currentText.nodeValue.length) };
  }

  function getEdgeTextNode(node, edge) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node;

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
    let current = walker.nextNode();
    if (edge === "first") return current;

    let last = current;
    while ((current = walker.nextNode())) last = current;
    return last;
  }

  function replaceRangeInTextNode(node, start, end, replacement, caretOffset, selection) {
    const text = node.nodeValue || "";
    node.nodeValue = text.slice(0, start) + replacement + text.slice(end);
    const range = document.createRange();
    const safe = Math.min(caretOffset, node.nodeValue.length);
    range.setStart(node, safe);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function processWithRawBufferRich(el) {
    const pending = pendingMap.get(el);
    if (!pending) return false;
    pendingMap.delete(el);

    const info = getSelectionInfo(el);
    if (!info) return false;
    const target = getTextNodeAndOffset(info.container, info.offset);
    if (!target || !target.node) return false;

    const state = stateMap.get(el);

    if (pending.inputType === "deleteContentBackward") {
      if (
        state &&
        state.kind === "textnode" &&
        state.node === target.node &&
        pending.offset === state.start + state.transformed.length
      ) {
        state.raw = state.raw.slice(0, -1);
        const newText = window.MiniUniKeyEngine.processWord(state.raw);
        isApplying = true;
        replaceRangeInTextNode(target.node, state.start, target.offset, newText, state.start + newText.length, info.selection);
        dispatchInputEvent(el);
        isApplying = false;
        if (state.raw) {
          state.transformed = newText;
          stateMap.set(el, state);
        } else {
          clearState(el);
        }
        return true;
      }
      clearState(el);
      return false;
    }

    if (pending.inputType !== "insertText" || !isAsciiLetter(pending.data)) {
      if (pending.inputType === "insertText" && pending.data && !isWordChar(pending.data)) clearState(el);
      return false;
    }

    const ch = pending.data;
    const text = target.node.nodeValue || "";

    if (
      state &&
      state.kind === "textnode" &&
      state.node === target.node &&
      pending.offset === state.start + state.transformed.length
    ) {
      state.raw += ch;
      const newText = window.MiniUniKeyEngine.processWord(state.raw);
      isApplying = true;
      replaceRangeInTextNode(target.node, state.start, target.offset, newText, state.start + newText.length, info.selection);
      dispatchInputEvent(el);
      isApplying = false;
      state.transformed = newText;
      stateMap.set(el, state);
      return true;
    }

    const oldText = pending.oldText || "";
    const oldBounds = (() => {
      let start = pending.offset;
      let end = pending.offset;
      while (start > 0 && isWordChar(oldText[start - 1])) start--;
      while (end < oldText.length && isWordChar(oldText[end])) end++;
      return { start, end };
    })();
    const oldWord = oldText.slice(oldBounds.start, oldBounds.end);

    if (
      oldWord &&
      /^[A-Za-z]+$/.test(oldWord) &&
      pending.offset === oldBounds.end
    ) {
      const raw = oldWord + ch;
      const newText = window.MiniUniKeyEngine.processWord(raw);
      const newBounds = (() => {
        let start = target.offset;
        let end = target.offset;
        while (start > 0 && isWordChar(text[start - 1])) start--;
        while (end < text.length && isWordChar(text[end])) end++;
        return { start, end };
      })();
      isApplying = true;
      replaceRangeInTextNode(target.node, newBounds.start, newBounds.end, newText, oldBounds.start + newText.length, info.selection);
      dispatchInputEvent(el);
      isApplying = false;
      stateMap.set(el, { kind: "textnode", node: target.node, start: oldBounds.start, raw, transformed: newText });
      return true;
    }

    if (pending.offset === 0 || !isWordChar(oldText[pending.offset - 1])) {
      const raw = ch;
      const newText = window.MiniUniKeyEngine.processWord(raw);
      stateMap.set(el, { kind: "textnode", node: target.node, start: pending.offset, raw, transformed: newText });
      if (newText !== ch) {
        isApplying = true;
        replaceRangeInTextNode(target.node, pending.offset, target.offset, newText, pending.offset + newText.length, info.selection);
        dispatchInputEvent(el);
        isApplying = false;
      }
      return true;
    }

    return false;
  }

  function processRichEditable(el) {
    if (processWithRawBufferRich(el)) return;
    if (processSingleTextNodeRich(el)) return;
  }

  function processSingleTextNodeRich(el) {
    const info = getSelectionInfo(el);
    if (!info) return false;
    const target = getTextNodeAndOffset(info.container, info.offset);
    if (!target || !target.node) return false;

    const text = target.node.nodeValue || "";
    const bounds = getWordBounds(text, target.offset);
    const word = text.slice(bounds.start, bounds.end);
    if (!word || !/\p{L}/u.test(word)) return false;

    const convertedWord = window.MiniUniKeyEngine.processWord(word);
    if (convertedWord === word) return false;

    const beforeCaretWordPart = text.slice(bounds.start, target.offset);
    const newCaret = bounds.start + window.MiniUniKeyEngine.processWord(beforeCaretWordPart).length;

    isApplying = true;
    replaceRangeInTextNode(target.node, bounds.start, bounds.end, convertedWord, newCaret, info.selection);
    dispatchInputEvent(el);
    isApplying = false;
    stateMap.set(el, { kind: "textnode", node: target.node, start: bounds.start, raw: word, transformed: convertedWord });
    return true;
  }

  function processElement(el) {
    if (!enabled || isApplying || shouldIgnore(el)) return;
    try {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        processInputOrTextarea(el);
      } else {
        processRichEditable(el);
      }
    } catch (_) {}
  }

  function handleBeforeInput(event) {
    if (!enabled || isApplying || event.isComposing) return;
    const el = event.target;
    if (shouldIgnore(el)) return;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      pendingMap.set(el, {
        inputType: event.inputType,
        data: event.data,
        selStart: el.selectionStart ?? 0,
        selEnd: el.selectionEnd ?? 0,
        oldValue: el.value
      });
      return;
    }

    if (el.isContentEditable || (el.getAttribute && (el.getAttribute("role") || "").toLowerCase() === "textbox")) {
      const info = getSelectionInfo(el);
      const target = info ? getTextNodeAndOffset(info.container, info.offset) : null;
      pendingMap.set(el, {
        inputType: event.inputType,
        data: event.data,
        offset: target ? target.offset : 0,
        oldText: target && target.node ? (target.node.nodeValue || "") : "",
        oldNode: target ? target.node : null
      });
    }
  }

  function handleInput(event) {
    if (!enabled || isApplying || event.isComposing) return;
    const el = event.target;
    if (shouldIgnore(el)) return;
    processElement(el);
  }

  function wireDocument(doc) {
    if (!doc || doc.__miniUniKeyWired) return;
    doc.__miniUniKeyWired = true;

    doc.addEventListener("beforeinput", handleBeforeInput, true);
    doc.addEventListener("input", handleInput, true);
    doc.addEventListener("compositionend", handleInput, true);
    doc.addEventListener("paste", () => {
      const el = doc.activeElement;
      if (el) setTimeout(() => {
        clearState(el);
        processElement(el);
      }, 0);
    }, true);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.shadowRoot) {
            try { wireDocument(node.shadowRoot); } catch (_) {}
          }
          if (node.tagName === "IFRAME") {
            try { if (node.contentDocument) wireDocument(node.contentDocument); } catch (_) {}
          }
          const descendants = node.querySelectorAll ? node.querySelectorAll("*") : [];
          for (const el of descendants) {
            if (el.shadowRoot) {
              try { wireDocument(el.shadowRoot); } catch (_) {}
            }
            if (el.tagName === "IFRAME") {
              try { if (el.contentDocument) wireDocument(el.contentDocument); } catch (_) {}
            }
          }
        }
      }
    });
    observer.observe(doc, { childList: true, subtree: true });

    const iframes = doc.querySelectorAll ? doc.querySelectorAll("iframe") : [];
    for (const iframe of iframes) {
      try { if (iframe.contentDocument) wireDocument(iframe.contentDocument); } catch (_) {}
    }
    const all = doc.querySelectorAll ? doc.querySelectorAll("*") : [];
    for (const el of all) {
      if (el.shadowRoot) {
        try { wireDocument(el.shadowRoot); } catch (_) {}
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => wireDocument(document), { once: true });
  } else {
    wireDocument(document);
  }
})();
