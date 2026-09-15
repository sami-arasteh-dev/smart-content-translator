# Universal Translator Engine

A lightweight, reusable JavaScript translation engine for Persian-to-English website translation.

This project is designed to provide a **single shared translator script** that can be loaded directly into multiple HTML, PHP, or other web projects without duplicating the translation logic in every project.

## Features

* 🇮🇷 → 🇬🇧 Persian-to-English website translation
* 🔄 English ↔ Persian toggle without page reload
* ⚡ In-memory translation cache
* 💾 Persistent `localStorage` cache
* 🗄️ Persistent IndexedDB cache
* 🔐 SHA-256 based cache keys
* 📦 Batch translation to reduce API requests
* 📖 Custom glossary / forced translations
* 🌐 Dynamic DOM translation using `MutationObserver`
* 🏷️ Translation of:

  * Text nodes
  * `placeholder`
  * `title`
  * `aria-label`
  * `alt`
* 🚫 Automatic exclusion of scripts, styles, code blocks, SVG, canvas, and other non-translatable elements
* 🖥️ Built-in floating translation button
* 🧪 Cache diagnostics and cache clearing utilities

## How It Works

The translator scans the current page for Persian text and sends untranslated content to the configured AI translation API.

Translations are cached locally so previously translated content does not need to be translated again.

The engine uses multiple cache layers:

```text
Memory Cache
     ↓
localStorage
     ↓
IndexedDB
     ↓
AI Translation API
```

This architecture helps reduce unnecessary API requests and improves translation speed for repeated content.

## Installation

No build process or package manager is required.

Simply include the shared `translation.js` file in your webpage:

```html
<script src="https://raw.githubusercontent.com/YOUR_USERNAME/ai-page-translator/main/translation.js"></script>
```

Replace `YOUR_USERNAME` with your GitHub username.

Once loaded, the translator initializes automatically.

## Usage

Add the script before the closing `</body>` tag:

```html
<script src="https://raw.githubusercontent.com/YOUR_USERNAME/ai-page-translator/main/translation.js"></script>
</body>
</html>
```

The translator automatically detects Persian content and provides a floating translation button.

No additional initialization code is required.

## Configuration

The main configuration is located inside `translation.js`.

Example:

```javascript
const CONFIG = {
    apiKey: "YOUR_API_KEY",
    endpoint: "https://api.gapgpt.app/v1/chat/completions",
    model: "YOUR_MODEL",

    defaultLanguage: "en",

    batchSize: 25,
    maxCharsPerRequest: 7000
};
```

You can adjust:

* API endpoint
* AI model
* Default language
* Batch size
* Maximum characters per request
* Cache identifiers
* Ignored HTML elements
* Translatable attributes
* Glossary terms

## Custom Glossary

Permanent terminology can be defined in the glossary.

Example:

```javascript
glossary: {
    "شبکه افکار": "Thought Network",
    "آینه مجازی": "Virtual Mirror",
    "مسئول فنی": "Technical Manager"
}
```

Glossary entries take priority over AI translation and can be used to maintain consistent terminology throughout multiple projects.

## Dynamic Content

The translator monitors the page for dynamically added content.

This allows it to translate content generated after the initial page load, including content inserted by JavaScript or other dynamic interfaces.

## Programmatic API

The translator exposes a small public API through:

```javascript
window.UniversalTranslator
```

Available methods include:

```javascript
UniversalTranslator.translate();
UniversalTranslator.restore();
UniversalTranslator.cacheInfo();
UniversalTranslator.clearCache();
```

### Translate the Page

```javascript
UniversalTranslator.translate();
```

### Restore Persian

```javascript
UniversalTranslator.restore();
```

### View Cache Information

```javascript
UniversalTranslator.cacheInfo();
```

### Clear Translation Cache

```javascript
UniversalTranslator.clearCache();
```

## Project Structure

A minimal repository structure is sufficient:

```text
ai-page-translator/
│
├── translation.js
└── README.md
```

The same `translation.js` can then be reused by multiple independent web projects.

Example:

```text
GitHub
│
├── ai-page-translator
│   └── translation.js
│
├── project-one
│   └── index.html
│
├── project-two
│   └── index.php
│
└── project-three
    └── index.html
```

Each project can load the same centralized translator:

```html
<script src="https://raw.githubusercontent.com/YOUR_USERNAME/ai-page-translator/main/translation.js"></script>
```

This makes it possible to maintain and improve the translator in one central location.

## Important Security Note

If the JavaScript file contains an API key, that key should be considered **public** when the file is served to a browser or stored in a public repository.

For private projects and controlled environments, this architecture may be acceptable.

For production websites or publicly accessible projects, the recommended architecture is to keep the API key on a server-side backend and let the JavaScript client communicate with that backend instead of exposing the API key directly.

## Current Version

**Universal Translator Engine v3**

The project is intended to evolve as a reusable translation component for personal web projects and AI-powered interfaces.

## License

This project is intended for personal and private project use unless a separate license is added to this repository.
