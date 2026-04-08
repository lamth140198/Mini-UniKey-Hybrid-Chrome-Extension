
(() => {
  const TONE_KEYS = new Set(["s", "f", "r", "x", "j"]);
  const TONE_MARKS = {
    s: "\u0301",
    f: "\u0300",
    r: "\u0309",
    x: "\u0303",
    j: "\u0323",
  };
  const DOUBLE_TRANSFORMS = { a: "â", e: "ê", o: "ô", d: "đ" };
  const W_TRANSFORMS = { a: "ă", o: "ơ", u: "ư" };
  const VOWELS = new Set(["a", "e", "i", "o", "u", "y", "ă", "â", "ê", "ô", "ơ", "ư"]);

  function stripTone(ch) {
    return ch.normalize("NFD").replace(/[\u0300\u0301\u0303\u0309\u0323]/g, "").normalize("NFC");
  }

  function isVowelChar(ch) {
    return VOWELS.has(stripTone(ch).toLowerCase());
  }

  function applyTone(ch, toneKey) {
    const base = stripTone(ch);
    return (base.normalize("NFD") + TONE_MARKS[toneKey]).normalize("NFC");
  }

  function hasAnyVowel(chars) {
    return chars.some((ch) => isVowelChar(ch));
  }

  function findLastConvertibleIndex(result, allowedBases) {
    for (let i = result.length - 1; i >= 0; i--) {
      const base = stripTone(result[i]).toLowerCase();
      if (allowedBases.includes(base)) return i;
    }
    return -1;
  }

  function tryDoubleTransform(result, currentChar, state) {
    const base = currentChar.toLowerCase();
    const target = DOUBLE_TRANSFORMS[base];
    if (!target) return false;

    if (
      state.lastTransform &&
      state.lastTransform.kind === "double" &&
      state.lastTransform.key === base &&
      state.lastTransform.index >= 0 &&
      state.lastTransform.index < result.length
    ) {
      result[state.lastTransform.index] = currentChar;
      result.push(currentChar);
      state.lastTransform = null;
      state.lastToneInfo = null;
      return true;
    }

    const idx = findLastConvertibleIndex(result, [base]);
    if (idx !== -1) {
      result[idx] = result[idx] === result[idx].toUpperCase() ? target.toUpperCase() : target;
      state.lastTransform = { kind: "double", key: base, index: idx };
      state.lastToneInfo = null;
      return true;
    }
    return false;
  }

  function tryTransformWithW(result, state) {
    if (
      state.lastTransform &&
      state.lastTransform.kind === "w" &&
      state.lastTransform.key &&
      state.lastTransform.index >= 0 &&
      state.lastTransform.index < result.length
    ) {
      const originalBase = state.lastTransform.key;
      const originalChar = result[state.lastTransform.index] === result[state.lastTransform.index].toUpperCase()
        ? originalBase.toUpperCase()
        : originalBase;
      result[state.lastTransform.index] = originalChar;
      result.push("w");
      state.lastTransform = null;
      state.lastToneInfo = null;
      return true;
    }

    for (let i = result.length - 1; i >= 0; i--) {
      const base = stripTone(result[i]).toLowerCase();
      if (W_TRANSFORMS[base]) {
        const target = W_TRANSFORMS[base];
        result[i] = result[i] === result[i].toUpperCase() ? target.toUpperCase() : target;
        state.lastTransform = { kind: "w", key: base, index: i };
        state.lastToneInfo = null;
        return true;
      }
    }
    return false;
  }

  function tryTransformUoToUow(result, state) {
    if (
      state.lastTransform &&
      state.lastTransform.kind === "uow" &&
      state.lastTransform.uIndex >= 0 &&
      state.lastTransform.oIndex >= 0 &&
      state.lastTransform.uIndex < result.length &&
      state.lastTransform.oIndex < result.length
    ) {
      const uOriginal = result[state.lastTransform.uIndex] === result[state.lastTransform.uIndex].toUpperCase() ? "U" : "u";
      const oOriginal = result[state.lastTransform.oIndex] === result[state.lastTransform.oIndex].toUpperCase() ? "O" : "o";
      result[state.lastTransform.uIndex] = uOriginal;
      result[state.lastTransform.oIndex] = oOriginal;
      result.push("w");
      state.lastTransform = null;
      state.lastToneInfo = null;
      return true;
    }

    const vowelPositions = [];
    for (let i = 0; i < result.length; i++) {
      if (isVowelChar(result[i])) vowelPositions.push(i);
    }
    if (vowelPositions.length < 2) return false;

    const lastIdx = vowelPositions[vowelPositions.length - 1];
    const prevIdx = vowelPositions[vowelPositions.length - 2];
    const lastBase = stripTone(result[lastIdx]).toLowerCase();
    const prevBase = stripTone(result[prevIdx]).toLowerCase();

    if (lastIdx === prevIdx + 1 && prevBase === "u" && lastBase === "o") {
      result[prevIdx] = result[prevIdx] === result[prevIdx].toUpperCase() ? "Ư" : "ư";
      result[lastIdx] = result[lastIdx] === result[lastIdx].toUpperCase() ? "Ơ" : "ơ";
      state.lastTransform = { kind: "uow", uIndex: prevIdx, oIndex: lastIdx };
      state.lastToneInfo = null;
      return true;
    }
    return false;
  }

  function findTonePosition(chars) {
    let vowelPositions = [];
    let vowelBases = [];
    for (let i = 0; i < chars.length; i++) {
      const base = stripTone(chars[i]).toLowerCase();
      if (VOWELS.has(base)) {
        vowelPositions.push(i);
        vowelBases.push(base);
      }
    }
    if (!vowelPositions.length) return -1;

    const wordLower = chars.map((ch) => stripTone(ch).toLowerCase()).join("");

    if (wordLower.startsWith("qu") && vowelPositions.length > 1) {
      const fp = [], fb = [];
      for (let i = 0; i < vowelPositions.length; i++) {
        if (vowelPositions[i] === 1 && vowelBases[i] === "u") continue;
        fp.push(vowelPositions[i]); fb.push(vowelBases[i]);
      }
      vowelPositions = fp; vowelBases = fb;
    }

    if (wordLower.startsWith("gi") && vowelPositions.length > 1) {
      const fp = [], fb = [];
      for (let i = 0; i < vowelPositions.length; i++) {
        if (vowelPositions[i] === 1 && vowelBases[i] === "i") continue;
        fp.push(vowelPositions[i]); fb.push(vowelBases[i]);
      }
      vowelPositions = fp; vowelBases = fb;
    }

    if (!vowelPositions.length) return -1;

    for (let i = 0; i < vowelPositions.length; i++) {
      if (["ê", "ô", "ơ"].includes(vowelBases[i])) return vowelPositions[i];
    }
    for (let i = 0; i < vowelPositions.length; i++) {
      if (["ă", "â"].includes(vowelBases[i])) return vowelPositions[i];
    }

    if (vowelPositions.length === 1) return vowelPositions[0];
    if (vowelPositions.length >= 3) return vowelPositions[1];

    const lastCharBase = stripTone(chars[chars.length - 1]).toLowerCase();
    return VOWELS.has(lastCharBase) ? vowelPositions[0] : vowelPositions[1];
  }

  function processWord(word) {
    const result = [];
    const state = { lastToneInfo: null, lastTransform: null };

    for (const ch of word) {
      const lower = ch.toLowerCase();

      if (TONE_KEYS.has(lower)) {
        if (
          state.lastToneInfo &&
          state.lastToneInfo.toneKey === lower &&
          state.lastToneInfo.index >= 0 &&
          state.lastToneInfo.index < result.length
        ) {
          result[state.lastToneInfo.index] = stripTone(result[state.lastToneInfo.index]);
          result.push(ch);
          state.lastToneInfo = null;
          state.lastTransform = null;
          continue;
        }

        if (hasAnyVowel(result)) {
          const toneIdx = findTonePosition(result);
          if (toneIdx !== -1) {
            result[toneIdx] = applyTone(result[toneIdx], lower);
            state.lastToneInfo = { index: toneIdx, toneKey: lower };
            state.lastTransform = null;
            continue;
          }
        }

        result.push(ch);
        state.lastToneInfo = null;
        state.lastTransform = null;
        continue;
      }

      if (lower === "w") {
        if (tryTransformUoToUow(result, state)) continue;
        if (tryTransformWithW(result, state)) continue;
        result.push(ch);
        state.lastToneInfo = null;
        state.lastTransform = null;
        continue;
      }

      if (DOUBLE_TRANSFORMS[lower]) {
        if (tryDoubleTransform(result, ch, state)) continue;
        result.push(ch);
        state.lastToneInfo = null;
        state.lastTransform = null;
        continue;
      }

      result.push(ch);
      state.lastToneInfo = null;
      state.lastTransform = null;
    }

    return result.join("");
  }

  function processText(text) {
    return text.replace(/\p{L}+/gu, (word) => processWord(word));
  }

  window.MiniUniKeyEngine = { processText, processWord, stripTone, isVowelChar };
})();
