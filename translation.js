/*
 * Universal Translator Engine v3
 * Persian -> English
 *
 * Private-project mode:
 * API key is intentionally stored in this JS file.
 *
 * Features:
 * - In-memory cache
 * - localStorage persistent cache
 * - IndexedDB persistent cache
 * - SHA-256 cache keys
 * - Batch translation
 * - Glossary / forced translations
 * - Dynamic DOM translation
 * - Placeholder/title/aria-label/alt
 * - English <-> Persian toggle without reload
 */

(() => {
  "use strict";

  const CONFIG = {
    apiKey: "sk-K0UYE8QlMeFGcQ14afhOIXGy4MM2OjXGoaVH34aQqC7t2w0H",
    endpoint: "https://api.gapgpt.app/v1/chat/completions",
    model: "gapgpt-qwen-3.6",

    defaultLanguage: "en",

    batchSize: 25,
    maxCharsPerRequest: 7000,

    localStorageKey: "universal_translator_cache_v3",
    languageKey: "universal_translator_language_v3",

    dbName: "UniversalTranslatorDB",
    dbVersion: 1,
    storeName: "translations",

    ignoredTags: new Set([
      "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME",
      "OBJECT", "CODE", "PRE", "SVG", "CANVAS"
    ]),

    attributes: ["placeholder", "title", "aria-label", "alt"],

    glossary: {
      // Add your permanent terminology here:
      // "شبکه افکار": "Thought Network",
      // "آینه مجازی": "Virtual Mirror",
      // "مسئول فنی": "Technical Manager"
    }
  };

  const state = {
    memoryCache: new Map(),
    originalNodes: new WeakMap(),
    originalAttributes: new WeakMap(),
    translatedNodes: new Set(),
    translatedElements: new Set(),
    observer: null,
    processing: false,
    initialized: false,
    db: null
  };

  /* ---------------- Utilities ---------------- */

  const normalize = text =>
    String(text ?? "")
      .replace(/\u200c/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const isPersian = text =>
    /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || "");

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function ignored(el) {
    if (!el || !el.tagName) return true;
    if (CONFIG.ignoredTags.has(el.tagName)) return true;
    if (el.closest?.("[data-no-translate]")) return true;
    if (el.id === "universal-translator-button") return true;
    return false;
  }

  /* ---------------- SHA-256 ---------------- */

  async function hash(text) {
    const data = new TextEncoder().encode(normalize(text));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* ---------------- IndexedDB ---------------- */

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        resolve(null);
        return;
      }

      const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONFIG.storeName)) {
          db.createObjectStore(CONFIG.storeName, { keyPath: "hash" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(key) {
    if (!state.db) return Promise.resolve(null);

    return new Promise(resolve => {
      try {
        const tx = state.db.transaction(CONFIG.storeName, "readonly");
        const req = tx.objectStore(CONFIG.storeName).get(key);
        req.onsuccess = () => resolve(req.result?.translation || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function idbSet(key, source, translation) {
    if (!state.db) return Promise.resolve();

    return new Promise(resolve => {
      try {
        const tx = state.db.transaction(CONFIG.storeName, "readwrite");
        tx.objectStore(CONFIG.storeName).put({
          hash: key,
          source,
          translation,
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /* ---------------- localStorage fallback/cache ---------------- */

  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(CONFIG.localStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  const localCache = loadLocalCache();

  function saveLocalCache() {
    try {
      localStorage.setItem(
        CONFIG.localStorageKey,
        JSON.stringify(localCache)
      );
    } catch (e) {
      console.warn("[Translator] localStorage write failed:", e);
    }
  }

  /* ---------------- Glossary ---------------- */

  function glossaryLookup(source) {
    const exact = normalize(source);

    if (Object.prototype.hasOwnProperty.call(CONFIG.glossary, exact)) {
      return CONFIG.glossary[exact];
    }

    return null;
  }

  /* ---------------- Cache ---------------- */

  async function cacheGet(source) {
    const text = normalize(source);
    if (!text) return null;

    if (state.memoryCache.has(text)) {
      return state.memoryCache.get(text);
    }

    const key = await hash(text);

    // localStorage first
    if (localCache[key]) {
      state.memoryCache.set(text, localCache[key]);
      return localCache[key];
    }

    // IndexedDB
    const idbValue = await idbGet(key);
    if (idbValue) {
      state.memoryCache.set(text, idbValue);
      localCache[key] = idbValue;
      saveLocalCache();
      return idbValue;
    }

    return null;
  }

  async function cacheSet(source, translation) {
    const text = normalize(source);
    const result = normalize(translation);
    if (!text || !result) return;

    const key = await hash(text);

    state.memoryCache.set(text, result);
    localCache[key] = result;
    saveLocalCache();

    await idbSet(key, text, result);
  }

  /* ---------------- DOM collection ---------------- */

  function collectTextNodes(root = document.body) {
    const result = [];
    if (!root) return result;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || ignored(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          const value = normalize(node.nodeValue);
          if (!value || !isPersian(value)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) result.push(node);
    return result;
  }

  function collectAttributes(root = document.body) {
    const result = [];
    if (!root?.querySelectorAll) return result;

    for (const el of root.querySelectorAll("*")) {
      if (ignored(el)) continue;

      for (const attr of CONFIG.attributes) {
        if (!el.hasAttribute(attr)) continue;

        const value = normalize(el.getAttribute(attr));
        if (!value || !isPersian(value)) continue;

        result.push({ el, attr, value });
      }
    }

    return result;
  }

  /* ---------------- API ---------------- */

  function stripFences(text) {
    return String(text)
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  async function callAPI(texts) {
    if (!CONFIG.apiKey || CONFIG.apiKey === "YOUR_API_KEY") {
      throw new Error("API key is not configured in translation.js");
    }

    const response = await fetch(CONFIG.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CONFIG.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: [
          {
            role: "system",
            content:
              "You are a professional Persian-to-English website translator. " +
              "Translate each item naturally and accurately. Preserve names, " +
              "numbers, punctuation, URLs, technical terms and placeholders. " +
              "Return ONLY a JSON array of strings, exactly one output per input."
          },
          {
            role: "user",
            content: JSON.stringify(texts)
          }
        ],
        temperature: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`API HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = await response.json();

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";

    if (!content) throw new Error("Empty translation response");

    let parsed;

    try {
      parsed = JSON.parse(stripFences(content));
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("Invalid JSON array returned by model");
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Translation response is not an array");
    }

    return parsed.map(x => String(x ?? ""));
  }

  /* ---------------- Batch translation ---------------- */

  async function translateTexts(texts) {
    const unique = [...new Set(texts.map(normalize).filter(Boolean))];
    const result = {};
    const missing = [];

    // Glossary + cache
    for (const text of unique) {
      const glossary = glossaryLookup(text);

      if (glossary) {
        result[text] = glossary;
        await cacheSet(text, glossary);
        continue;
      }

      const cached = await cacheGet(text);

      if (cached) {
        result[text] = cached;
      } else {
        missing.push(text);
      }
    }

    if (!missing.length) return result;

    const groups = [];
    let current = [];
    let chars = 0;

    for (const text of missing) {
      const size = text.length + 40;

      if (
        current.length >= CONFIG.batchSize ||
        (chars + size > CONFIG.maxCharsPerRequest && current.length)
      ) {
        groups.push(current);
        current = [];
        chars = 0;
      }

      current.push(text);
      chars += size;
    }

    if (current.length) groups.push(current);

    for (const group of groups) {
      const translated = await callAPI(group);

      for (let i = 0; i < group.length; i++) {
        const source = group[i];
        const target = normalize(translated[i] || source);

        result[source] = target;

        // Persist immediately.
        await cacheSet(source, target);
      }

      await sleep(10);
    }

    return result;
  }

  /* ---------------- Translation / restore ---------------- */

  async function translatePage() {
    if (state.processing) return;

    state.processing = true;
    setBusy(true);

    try {
      const nodes = collectTextNodes();
      const attrs = collectAttributes();

      const all = [
        ...nodes.map(n => normalize(n.nodeValue)),
        ...attrs.map(x => x.value)
      ];

      const translations = await translateTexts(all);

      for (const node of nodes) {
        if (!state.originalNodes.has(node)) {
          state.originalNodes.set(node, node.nodeValue);
        }

        const source = normalize(node.nodeValue);
        const target = translations[source];

        if (target && target !== source) {
          node.nodeValue = target;
          state.translatedNodes.add(node);
        }
      }

      for (const item of attrs) {
        let map = state.originalAttributes.get(item.el);

        if (!map) {
          map = {};
          state.originalAttributes.set(item.el, map);
        }

        if (!(item.attr in map)) {
          map[item.attr] = item.value;
        }

        const target = translations[item.value];

        if (target && target !== item.value) {
          item.el.setAttribute(item.attr, target);
          state.translatedElements.add(item.el);
        }
      }

      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
      localStorage.setItem(CONFIG.languageKey, "en");
      updateButton("🇮🇷", "بازگشت به فارسی");
    } catch (error) {
      console.error("[Universal Translator]", error);
      showError(error.message);
    } finally {
      state.processing = false;
      setBusy(false);
    }
  }

  function restorePage() {
    for (const node of state.translatedNodes) {
      const original = state.originalNodes.get(node);
      if (original != null && node.isConnected) {
        node.nodeValue = original;
      }
    }

    for (const el of state.translatedElements) {
      const map = state.originalAttributes.get(el);
      if (!map || !el.isConnected) continue;

      for (const [attr, value] of Object.entries(map)) {
        el.setAttribute(attr, value);
      }
    }

    state.translatedNodes.clear();
    state.translatedElements.clear();

    document.documentElement.lang = "fa";
    document.documentElement.dir = "rtl";
    localStorage.setItem(CONFIG.languageKey, "fa");

    updateButton("🇬🇧", "Translate to English");
  }

  /* ---------------- Dynamic content ---------------- */

  function setupObserver() {
    if (state.observer || !document.body) return;

    let timer = null;

    state.observer = new MutationObserver(mutations => {
      const language =
        localStorage.getItem(CONFIG.languageKey) ||
        CONFIG.defaultLanguage;

      if (language !== "en") return;

      clearTimeout(timer);

      timer = setTimeout(async () => {
        if (state.processing) return;

        const nodes = [];

        for (const mutation of mutations) {
          for (const added of mutation.addedNodes) {
            if (added.nodeType === Node.TEXT_NODE) {
              if (isPersian(added.nodeValue)) nodes.push(added);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              nodes.push(...collectTextNodes(added));
            }
          }
        }

        if (!nodes.length) return;

        state.processing = true;
        setBusy(true);

        try {
          for (const node of nodes) {
            if (!state.originalNodes.has(node)) {
              state.originalNodes.set(node, node.nodeValue);
            }
          }

          const translations = await translateTexts(
            nodes.map(n => normalize(n.nodeValue))
          );

          for (const node of nodes) {
            const source = normalize(node.nodeValue);
            const target = translations[source];

            if (target && target !== source) {
              node.nodeValue = target;
              state.translatedNodes.add(node);
            }
          }
        } catch (error) {
          console.error("[Universal Translator observer]", error);
        } finally {
          state.processing = false;
          setBusy(false);
        }
      }, 300);
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /* ---------------- UI ---------------- */

  function createButton() {
    if (document.getElementById("universal-translator-button")) return;

    const button = document.createElement("button");
    button.id = "universal-translator-button";
    button.type = "button";
    button.textContent = "🇬🇧";
    button.title = "Translate to English";
    button.setAttribute("aria-label", "Translate to English");

    Object.assign(button.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      width: "42px",
      height: "42px",
      border: "0",
      borderRadius: "50%",
      background: "rgba(20,20,20,.92)",
      color: "#fff",
      cursor: "pointer",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "20px",
      lineHeight: "1",
      padding: "0",
      boxShadow: "0 4px 16px rgba(0,0,0,.25)",
      transition: "transform .15s ease, opacity .15s ease"
    });

    button.addEventListener("mouseenter", () => {
      button.style.transform = "scale(1.08)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "scale(1)";
    });

    button.addEventListener("click", () => {
      const language =
        localStorage.getItem(CONFIG.languageKey) ||
        CONFIG.defaultLanguage;

      if (language === "en") {
        restorePage();
      } else {
        translatePage();
      }
    });

    document.body.appendChild(button);
  }

  function updateButton(icon, title) {
    const button =
      document.getElementById("universal-translator-button");

    if (!button) return;

    button.textContent = icon;
    button.title = title;
    button.setAttribute("aria-label", title);
  }

  function setBusy(busy) {
    const button =
      document.getElementById("universal-translator-button");

    if (!button) return;

    button.disabled = busy;
    button.style.opacity = busy ? ".55" : "1";
    button.style.cursor = busy ? "wait" : "pointer";
  }

  function showError(message) {
    document.getElementById("universal-translator-error")?.remove();

    const box = document.createElement("div");
    box.id = "universal-translator-error";

    Object.assign(box.style, {
      position: "fixed",
      right: "16px",
      bottom: "68px",
      maxWidth: "380px",
      padding: "10px 12px",
      borderRadius: "10px",
      background: "#2b1111",
      color: "#ffdede",
      font: "13px/1.5 Arial,sans-serif",
      zIndex: "2147483647",
      boxShadow: "0 5px 20px rgba(0,0,0,.25)"
    });

    box.textContent = "Translator: " + message;
    document.body.appendChild(box);

    setTimeout(() => box.remove(), 8000);
  }

  /* ---------------- Diagnostics ---------------- */

  async function cacheInfo() {
    const localEntries = Object.keys(localCache).length;
    let idbEntries = null;

    if (state.db) {
      idbEntries = await new Promise(resolve => {
        try {
          const tx = state.db.transaction(CONFIG.storeName, "readonly");
          const req = tx.objectStore(CONFIG.storeName).count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    const info = {
      memoryEntries: state.memoryCache.size,
      localStorageEntries: localEntries,
      indexedDBEntries: idbEntries,
      language:
        localStorage.getItem(CONFIG.languageKey) ||
        CONFIG.defaultLanguage
    };

    console.table(info);
    return info;
  }

  async function clearCache() {
    state.memoryCache.clear();

    for (const key of Object.keys(localCache)) {
      delete localCache[key];
    }

    localStorage.removeItem(CONFIG.localStorageKey);

    if (state.db) {
      await new Promise(resolve => {
        try {
          const tx = state.db.transaction(CONFIG.storeName, "readwrite");
          tx.objectStore(CONFIG.storeName).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    console.info("[Universal Translator] All translation caches cleared.");
  }

  /* ---------------- Init ---------------- */

  async function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      state.db = await openDB();
    } catch {
      state.db = null;
    }

    createButton();
    setupObserver();

    const language =
      localStorage.getItem(CONFIG.languageKey) ||
      CONFIG.defaultLanguage;

    if (language === "fa") {
      updateButton("🇬🇧", "Translate to English");
      document.documentElement.lang = "fa";
      document.documentElement.dir = "rtl";
      return;
    }

    setTimeout(() => translatePage(), 150);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }

  window.UniversalTranslator = {
    translate: translatePage,
    restore: restorePage,
    cacheInfo,
    clearCache,
    config: CONFIG
  };
})();
