const fs = require("fs");
const path = require("path");

const isDevelopment = process.env.NODE_ENV === 'development';

const WORDLIST_DIR = path.join(__dirname, "..", "moderation", "wordlists");
const RAW_WORDLIST_FILES = [
  path.join(WORDLIST_DIR, "swears.txt"),
  path.join(WORDLIST_DIR, "karaliste.txt"),
];

const POLICY_SENSITIVE_WORDS = [
  "sigara",
  "cigara",
  "tütün",
  "tutun",
  "nikotin",
  "alkol",
  "bira",
  "rakı",
  "raki",
  "viski",
  "whisky",
  "vodka",
  "wine",
  "beer",
  "uyuşturucu",
  "uyusturucu",
  "esrar",
  "kokain",
  "cocaine",
  "eroin",
  "heroin",
  "ecstasy",
  "extacy",
  "hap",
  "silah",
  "tabanca",
  "mermi",
  "kumar",
  "bahis",
  "casino",
];

const LOVE_WORDS = [
  "aşk",
  "ask",
  "aşkım",
  "askim",
  "seviyorum",
  "seni seviyorum",
  "canım",
  "canim",
  "bebeğim",
  "bebegim",
  "hayatım",
  "hayatim",
  "tatlım",
  "tatlim",
  "özledim",
  "ozledim",
  "bitanem",
  "bir tanem",
];

const WHITELIST = [
  "sigorta",
  "sigortacı",
  "sigortaci",
  "sigortalı",
  "sigortali",
  "sigortam",
  "sigortası",
  "sigortasi",
  "alkolsüz",
  "alkolsuz",
  "silahlı kuvvetler",
  "silahsan",
  "meslek",
  "saksofon",
];

const IGNORE_FROM_RAW_LISTS = new Set([
  "",
  "allah",
  "allahsız",
  "muhammed",
  "hz.muhammed",
  "hz.ömer",
  "din",
  "müslüman",
  "musluman",
  "hristiyan",
  "yahudi",
  "musevi",
  "israil",
  "israil",
  "irsail",
  "izrail",
  "ısrail",
  "israıl",
  "peygamber",
  "akp",
  "tayyip",
  "pkk",
  "kürdistan",
  "kurdistan",
  "komünizm",
  "komunist",
  "komünist",
  "faşizm",
  "fasizm",
  "ülkücü",
  "boykot",
  "protesto",
  "takip",
  "beğen",
  "begen",
  "iş fırsatı",
  "kariyer fırsatı",
  "çalışmak istermisiniz?",
  "farmasi",
  "oriflame",
  "avon",
  "sayfa",
  "fırsat",
  "firsat",
  "edit",
  "31",
  "18+",
  "30+1",
]);

const FORCE_HARD_BLOCK = new Set([
  "amk",
  "amq",
  "aq",
  "oç",
  "oc",
  "orospu",
  "oruspu",
  "piç",
  "pic",
  "sik",
  "sikerim",
  "sikeyim",
  "siktir",
  "yarak",
  "yarrak",
  "göt",
  "got",
  "ibne",
  "ipne",
  "kahpe",
  "kaltak",
  "pezevenk",
  "puşt",
  "pust",
  "fuck",
  "fucking",
  "motherfucker",
  "shit",
  "bitch",
  "asshole",
  "slut",
  "whore",
]);

const FORCE_SENSITIVE = new Set(POLICY_SENSITIVE_WORDS);

const LEET_CHAR_MAP = {
  a: "[a4@]",
  b: "[b8]",
  c: "[cç<({\\[]",
  d: "[d]",
  e: "[e3€]",
  f: "[f]",
  g: "[g69ğ]",
  h: "[h]",
  i: "[i1!|ıİl]",
  j: "[j]",
  k: "[k]",
  l: "[l1!|]",
  m: "[m]",
  n: "[n]",
  o: "[o0ö]",
  p: "[p]",
  q: "[q]",
  r: "[r]",
  s: "[s5$ş]",
  t: "[t7+]",
  u: "[uüv]",
  v: "[vüu]",
  w: "[w]",
  x: "[x]",
  y: "[y]",
  z: "[z2]",
};

const EMOJI_REGEX =
  /[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]/gu;

let cachedWordConfig = null;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripInvisibleChars(value) {
  return String(value).replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function removeEmojis(value) {
  return String(value || "").replace(EMOJI_REGEX, "");
}

function normalizeTurkishChars(value) {
  return String(value)
    .replace(/ç/gi, "c")
    .replace(/ğ/gi, "g")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/gi, "o")
    .replace(/ş/gi, "s")
    .replace(/ü/gi, "u");
}

function normalizeLeetspeak(value) {
  return String(value)
    .replace(/@/g, "a")
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/\$/g, "s")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g")
    .replace(/2/g, "z");
}

function collapseRepeatingChars(value) {
  return String(value).replace(/(.)\1{2,}/g, "$1");
}

function normalizeText(value) {
  const input = String(value || "").trim().toLowerCase();

  return collapseRepeatingChars(
    normalizeLeetspeak(
      normalizeTurkishChars(stripInvisibleChars(removeEmojis(input)))
    )
  )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeLoose(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function shouldKeepRawWord(word) {
  if (!word) return false;
  if (IGNORE_FROM_RAW_LISTS.has(word)) return false;

  const normalized = normalizeText(word);
  if (!normalized) return false;
  if (IGNORE_FROM_RAW_LISTS.has(normalized)) return false;

  if (normalized.length < 3 && !FORCE_HARD_BLOCK.has(normalized)) {
    return false;
  }

  return true;
}

function parseRawWordFile(filePath) {
  if (!fs.existsSync(filePath)) {
    if (isDevelopment) console.warn(`Wordlist dosyası bulunamadı: ${filePath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => normalizeText(line))
      .filter(shouldKeepRawWord);
  } catch (error) {
    if (isDevelopment) console.error(`Wordlist okuma hatası (${filePath}):`, error.message);
    return [];
  }
}

function loadWordConfig() {
  if (cachedWordConfig) return cachedWordConfig;

  const rawWords = RAW_WORDLIST_FILES.flatMap(parseRawWordFile);
  const dedupedRawWords = [...new Set(rawWords)];

  const hardBlocked = new Set();
  const sensitive = new Set();
  const loveWords = new Set();

  for (const word of dedupedRawWords) {
    if (FORCE_SENSITIVE.has(word)) {
      sensitive.add(word);
      continue;
    }

    if (FORCE_HARD_BLOCK.has(word)) {
      hardBlocked.add(word);
      continue;
    }

    if (
      word.includes("sigara") ||
      word.includes("alkol") ||
      word.includes("rakı") ||
      word.includes("raki") ||
      word.includes("uyuşturucu") ||
      word.includes("uyusturucu") ||
      word.includes("silah") ||
      word.includes("bahis") ||
      word.includes("kumar")
    ) {
      sensitive.add(word);
      continue;
    }

    hardBlocked.add(word);
  }

  for (const item of LOVE_WORDS) {
    loveWords.add(normalizeText(item));
  }

  for (const item of POLICY_SENSITIVE_WORDS) {
    sensitive.add(normalizeText(item));
  }

  for (const item of FORCE_HARD_BLOCK) {
    hardBlocked.add(normalizeText(item));
  }

  cachedWordConfig = {
    hardBlockedWords: [...hardBlocked].sort((a, b) => b.length - a.length),
    sensitiveWords: [...sensitive].sort((a, b) => b.length - a.length),
    loveWords: [...loveWords].sort((a, b) => b.length - a.length),
    whitelistWords: [...new Set(WHITELIST.map((x) => normalizeText(x)))],
  };

  return cachedWordConfig;
}

function buildFlexiblePattern(word) {
  const normalized = makeLoose(word);
  const parts = [];

  for (const char of normalized) {
    const token = LEET_CHAR_MAP[char] || escapeRegExp(char);
    parts.push(`${token}[\\s\\W_]*`);
  }

  return parts.join("");
}

function buildFlexibleRegex(word) {
  return new RegExp(buildFlexiblePattern(word), "giu");
}

function containsWhitelistedContent(text, whitelistWords) {
  const normalized = normalizeText(text);
  const loose = makeLoose(text);

  return whitelistWords.some((item) => {
    const normalizedItem = normalizeText(item);
    const looseItem = makeLoose(item);

    return (
      normalized.includes(normalizedItem) ||
      loose.includes(looseItem)
    );
  });
}

function findMatchedWords(text, words) {
  const cleanedText = removeEmojis(String(text || ""));
  const found = [];

  for (const word of words) {
    const regex = buildFlexibleRegex(word);
    if (regex.test(cleanedText)) {
      found.push(word);
    }
  }

  return [...new Set(found)];
}

function createMask(length) {
  return "*".repeat(Math.max(3, Math.min(length, 10)));
}

function maskMatchedWords(originalText, wordsToMask) {
  let result = String(originalText || "");

  for (const word of [...new Set(wordsToMask)].sort((a, b) => b.length - a.length)) {
    const regex = buildFlexibleRegex(word);
    result = result.replace(regex, (match) =>
      createMask(String(match || "").replace(/\s+/g, "").length)
    );
  }

  return result;
}

function detectSensitiveEntities(text) {
  const originalText = String(text || "");

  const matches = {
    phones: [],
    emails: [],
    urls: [],
    usernames: [],
  };

  const phoneRegex =
    /(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{3,4}\)?[\s\-]?)?\d{3}[\s\-]?\d{2,4}[\s\-]?\d{2,4}/g;

  const emailRegex =
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

  const urlRegex =
    /\b(?:https?:\/\/|www\.)[^\s]+/gi;

  const usernameRegex =
    /(^|\s)@[a-zA-Z0-9._]{3,}/g;

  matches.phones = originalText.match(phoneRegex) || [];
  matches.emails = originalText.match(emailRegex) || [];
  matches.urls = originalText.match(urlRegex) || [];
  matches.usernames = (originalText.match(usernameRegex) || []).map((item) =>
    item.trim()
  );

  return matches;
}

function maskSensitiveEntities(text, entities) {
  let result = String(text || "");

  for (const value of entities.phones || []) {
    result = result.replaceAll(value, "***");
  }

  for (const value of entities.emails || []) {
    result = result.replaceAll(value, "***");
  }

  for (const value of entities.urls || []) {
    result = result.replaceAll(value, "***");
  }

  for (const value of entities.usernames || []) {
    result = result.replaceAll(value, "***");
  }

  return result;
}

function moderateMessage(text) {
  const originalText = String(text || "").trim();
  const textWithoutEmoji = removeEmojis(originalText).trim();

  if (!textWithoutEmoji) {
    return {
      allowed: false,
      action: "reject",
      riskLevel: "high",
      reason: "Mesaj bos olamaz.",
      sanitizedText: "",
      normalizedText: "",
      matchedHardBlocked: [],
      matchedSensitive: [],
      matchedLoveWords: [],
      removedEmoji: originalText !== textWithoutEmoji,
      entityMatches: {
        phones: [],
        emails: [],
        urls: [],
        usernames: [],
      },
    };
  }

  const normalizedText = normalizeText(textWithoutEmoji);
  const { hardBlockedWords, sensitiveWords, loveWords, whitelistWords } =
    loadWordConfig();

  const hasWhitelist = containsWhitelistedContent(textWithoutEmoji, whitelistWords);

  const matchedHardBlocked = hasWhitelist
    ? []
    : findMatchedWords(textWithoutEmoji, hardBlockedWords);

  if (matchedHardBlocked.length > 0) {
    return {
      allowed: false,
      action: "reject",
      riskLevel: "high",
      reason: "Mesaj uygun olmayan ifadeler iceriyor.",
      sanitizedText: "",
      normalizedText,
      matchedHardBlocked,
      matchedSensitive: [],
      matchedLoveWords: [],
      removedEmoji: originalText !== textWithoutEmoji,
      entityMatches: {
        phones: [],
        emails: [],
        urls: [],
        usernames: [],
      },
    };
  }

  const matchedLoveWords = hasWhitelist
    ? []
    : findMatchedWords(textWithoutEmoji, loveWords);

  if (matchedLoveWords.length > 0) {
    return {
      allowed: false,
      action: "reject",
      riskLevel: "medium",
      reason: "Ask veya romantik ifadeler kullanilamaz.",
      sanitizedText: "",
      normalizedText,
      matchedHardBlocked: [],
      matchedSensitive: [],
      matchedLoveWords,
      removedEmoji: originalText !== textWithoutEmoji,
      entityMatches: {
        phones: [],
        emails: [],
        urls: [],
        usernames: [],
      },
    };
  }

  const matchedSensitive = hasWhitelist
    ? []
    : findMatchedWords(textWithoutEmoji, sensitiveWords);

  const entityMatches = detectSensitiveEntities(textWithoutEmoji);

  const hasSensitiveEntities =
    entityMatches.phones.length > 0 ||
    entityMatches.emails.length > 0 ||
    entityMatches.urls.length > 0 ||
    entityMatches.usernames.length > 0;

  let sanitizedText = textWithoutEmoji;

  if (matchedSensitive.length > 0) {
    sanitizedText = maskMatchedWords(sanitizedText, matchedSensitive);
  }

  if (hasSensitiveEntities) {
    sanitizedText = maskSensitiveEntities(sanitizedText, entityMatches);
  }

  return {
    allowed: true,
    action:
      matchedSensitive.length > 0 ||
      hasSensitiveEntities ||
      originalText !== textWithoutEmoji
        ? "mask"
        : "allow",
    riskLevel:
      matchedSensitive.length > 0 || hasSensitiveEntities ? "medium" : "low",
    reason: null,
    sanitizedText,
    normalizedText,
    matchedHardBlocked: [],
    matchedSensitive,
    matchedLoveWords: [],
    removedEmoji: originalText !== textWithoutEmoji,
    entityMatches,
  };
}

module.exports = {
  normalizeText,
  moderateMessage,
  loadWordConfig,
  removeEmojis,
};