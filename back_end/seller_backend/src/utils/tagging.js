const { GoogleGenAI } = (() => {
  try {
    return require('@google/genai');
  } catch (e) {
    return {};
  }
})();

function extractJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    return null;
  }
}

const tryPluralize = (() => {
  try {
    return require('pluralize');
  } catch (e) {
    return null;
  }
})();

function normalizeTag(t) {
  if (!t) return null;
  let s = String(t).trim().toLowerCase();
  s = s.replace(/^["']+|["']+$/g, '');
  s = s.replace(/\s+/g, ' ');
  // canonicalize to singular form when possible
  try {
    if (tryPluralize && typeof tryPluralize.singular === 'function') {
      s = tryPluralize.singular(s);
    }
  } catch (e) {
    // ignore pluralize errors
  }
  return s;
}

async function generateTags(text) {
  try {
    if (!GoogleGenAI) {
      console.warn('Missing @google/genai package; returning empty tags');
      return [];
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not set; returning empty tags');
      return [];
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Generate 15–25 unique, lowercase, canonical search tags for this clothing product based on its name and description. Include tags for product type, category, gender, brand, color, material, pattern, fit, style, occasion, season, neckline, sleeve type, length, closure, features, and other relevant clothing attributes. Use singular/canonical forms (e.g., "pant" not "pants", "top" not "tops"), remove duplicates, and return ONLY a valid JSON array of strings with no explanations or markdown.


Product Description:
${text}

Example output:
["men","tshirt","black","cotton","casual","summer","gym","nike"]`;

    const response = await ai.responses.create({ model: 'gpt-5', input: prompt });

    // Try common SDK shapes
    const rawText = response?.output_text || (response?.output && response.output[0] && response.output[0].content && response.output[0].content[0] && response.output[0].content[0].text) || JSON.stringify(response);

    let parsed = extractJsonArray(rawText);
    if (!parsed) {
      // try to find JSON array inside any string fields
      parsed = extractJsonArray(String(rawText));
    }

    if (!parsed) {
      // fallback: extract comma separated words
      const fallback = String(rawText || '')
        .replace(/\n/g, ' ')
        .split(/[,;\n]/)
        .map((s) => normalizeTag(s))
        .filter(Boolean);
      parsed = fallback;
    }

    const normalized = Array.isArray(parsed) ? parsed.map(normalizeTag).filter(Boolean) : [];
    // Deduplicate while preserving order
    const seen = new Set();
    const uniq = [];
    for (const t of normalized) {
      if (!seen.has(t)) {
        seen.add(t);
        uniq.push(t);
      }
      if (uniq.length >= 25) break;
    }

    return uniq;
  } catch (error) {
    console.error('generateTags error:', error?.message || error);
    return [];
  }
}

module.exports = { generateTags };
const TAG_KEYWORDS = [
  { tag: 'men', keywords: ['men', 'mens', 'male', 'gents', 'boy', 'boys'] },
  { tag: 'women', keywords: ['women', 'woman', 'female', 'ladies', 'girl', 'girls'] },
  { tag: 'kids', keywords: ['kids', 'kid', 'children', 'child', 'baby', 'babies', 'toddler', 'infant', 'newborn', 'junior', 'teen'] },
  { tag: 'accessories', keywords: ['accessories', 'accessory', 'bag', 'bags', 'purse', 'wallet', 'watch', 'watches', 'belt', 'belts', 'scarf', 'scarves', 'sunglasses', 'hat', 'hats', 'cap', 'caps', 'gloves', 'jewelry', 'necklace', 'ring', 'earrings', 'bracelet', 'hair clip', 'hairband'] },

  { tag: 'tshirt', keywords: ['t-shirt', 'tshirt', 'tee', 'crew neck', 'v neck', 'graphic tee', 'oversized tee', 'cotton tee', 't-shirts', 'tees'] },
  { tag: 'shirt', keywords: ['shirt', 'dress shirt', 'oxford', 'checked shirt', 'linen shirt', 'formal shirt', 'casual shirt', 'shirts'] },
  { tag: 'polo', keywords: ['polo', 'golf shirt', 'collar shirt'] },
  { tag: 'hoodie', keywords: ['hoodie', 'pullover', 'zip hoodie', 'fleece hoodie', 'hooded sweatshirt', 'hoodies'] },
  { tag: 'sweatshirt', keywords: ['sweatshirt', 'crewneck', 'oversized sweatshirt', 'sweatshirts'] },
  { tag: 'jeans', keywords: ['jeans', 'denim', 'skinny', 'straight', 'slim fit', 'relaxed', 'mom jeans'] },
  { tag: 'trousers', keywords: ['trousers', 'pants', 'formal pants', 'chinos', 'cotton trousers', 'slacks'] },
  { tag: 'shorts', keywords: ['shorts', 'cargo shorts', 'sports shorts', 'running shorts'] },
  { tag: 'dress', keywords: ['dress', 'gown', 'maxi', 'mini', 'midi', 'bodycon', 'party dress', 'dresses'] },
  { tag: 'skirt', keywords: ['skirt', 'mini skirt', 'maxi skirt', 'pencil skirt', 'pleated skirt', 'skirts'] },
  { tag: 'leggings', keywords: ['leggings', 'yoga pants', 'gym leggings', 'running leggings'] },
  { tag: 'jumpsuit', keywords: ['jumpsuit', 'romper', 'playsuit'] },
  { tag: 'jacket', keywords: ['jacket', 'bomber', 'denim jacket', 'puffer', 'windbreaker', 'jackets', 'blazer', 'blazers', 'cardigan', 'cardigans'] },
  { tag: 'coat', keywords: ['coat', 'parka', 'trench coat', 'winter coat', 'overcoat', 'coats'] },

  { tag: 'casual', keywords: ['casual', 'daily', 'everyday', 'weekend', 'loungewear'] },
  { tag: 'office', keywords: ['office', 'business', 'work', 'professional'] },
  { tag: 'formal', keywords: ['formal', 'ceremony', 'meeting', 'executive'] },
  { tag: 'party', keywords: ['party', 'celebration', 'birthday', 'evening', 'festive'] },
  { tag: 'wedding', keywords: ['wedding', 'bridal', 'groom', 'nikah', 'reception', 'bride', 'wedding dress', 'bridesmaid'] },
  { tag: 'sports', keywords: ['sports', 'gym', 'fitness', 'football', 'cricket', 'running', 'training', 'athleisure', 'activewear', 'workout'] },
  { tag: 'travel', keywords: ['travel', 'vacation', 'holiday', 'resort'] },
  { tag: 'outdoor', keywords: ['outdoor', 'camping', 'hiking', 'trekking'] },

  { tag: 'summer', keywords: ['summer', 'lightweight', 'breathable', 'cotton'] },
  { tag: 'winter', keywords: ['winter', 'warm', 'fleece', 'wool', 'thermal'] },

  { tag: 'black', keywords: ['black'] },
  { tag: 'white', keywords: ['white'] },
  { tag: 'blue', keywords: ['blue', 'navy'] },
  { tag: 'red', keywords: ['red', 'maroon'] },
  { tag: 'green', keywords: ['green', 'olive'] },
  { tag: 'pink', keywords: ['pink'] },
  { tag: 'purple', keywords: ['purple'] },
  { tag: 'yellow', keywords: ['yellow'] },
  { tag: 'brown', keywords: ['brown', 'tan'] },
  { tag: 'grey', keywords: ['grey', 'gray'] },
  { tag: 'beige', keywords: ['beige'] },
  { tag: 'gold', keywords: ['gold'] },
  { tag: 'silver', keywords: ['silver'] },

  { tag: 'xs', keywords: ['xs'] },
  { tag: 's', keywords: ['s', 'small'] },
  { tag: 'm', keywords: ['m', 'medium'] },
  { tag: 'l', keywords: ['l', 'large'] },
  { tag: 'xl', keywords: ['xl'] },
  { tag: 'xxl', keywords: ['xxl'] },
  { tag: 'xxxl', keywords: ['xxxl'] },

  { tag: 'cotton', keywords: ['cotton', 'cotton blend'] },
  { tag: 'denim', keywords: ['denim', 'jeans'] },
  { tag: 'wool', keywords: ['wool'] },
  { tag: 'polyester', keywords: ['polyester'] },
  { tag: 'linen', keywords: ['linen'] },
  { tag: 'leather', keywords: ['leather'] },
  { tag: 'faux-leather', keywords: ['faux leather'] },
  { tag: 'silk', keywords: ['silk', 'satin'] },
  { tag: 'satin', keywords: ['satin'] },
  { tag: 'fleece', keywords: ['fleece'] },
  { tag: 'metal', keywords: ['metal'] },
  { tag: 'stainless-steel', keywords: ['stainless steel'] },

  { tag: 'nike', keywords: ['nike'] },
  { tag: 'adidas', keywords: ['adidas'] },
  { tag: 'zara', keywords: ['zara'] },
  { tag: 'hm', keywords: ['h&m', 'hm'] },
  { tag: 'levis', keywords: ["levi's", 'levis'] },
  { tag: 'puma', keywords: ['puma'] },
  { tag: 'uniqlo', keywords: ['uniqlo'] },
  { tag: 'gucci', keywords: ['gucci'] },
  { tag: 'prada', keywords: ['prada'] },
  { tag: 'mango', keywords: ['mango'] },
  { tag: 'chanel', keywords: ['chanel'] },
  { tag: 'carters', keywords: ["carter's", 'carters'] },
  { tag: 'gap', keywords: ['gap'] },

  { tag: 'cartoon', keywords: ['cartoon', 'mickey', 'minnie', 'peppa', 'tom and jerry', 'pokemon'] },
  { tag: 'superhero', keywords: ['superhero', 'spiderman', 'batman', 'superman', 'iron man', 'captain america'] },
  { tag: 'animal', keywords: ['animal', 'bear', 'cat', 'dog', 'lion', 'dinosaur'] },
  { tag: 'princess', keywords: ['princess', 'frozen', 'elsa', 'anna', 'barbie'] },
  { tag: 'anime', keywords: ['anime', 'manga', 'naruto', 'one piece'] },

  { tag: 'watch', keywords: ['watch', 'smartwatch', 'analog', 'digital'] },
  { tag: 'sunglasses', keywords: ['sunglasses', 'aviator', 'wayfarer', 'polarized'] },
  { tag: 'bag', keywords: ['bag', 'handbag', 'backpack', 'crossbody', 'tote'] },
  { tag: 'wallet', keywords: ['wallet', 'bifold', 'card holder'] },
  { tag: 'jewelry', keywords: ['ring', 'necklace', 'bracelet', 'earrings', 'chain'] },
  { tag: 'cap', keywords: ['cap', 'hat', 'beanie', 'fedora', 'bucket hat'] },
  { tag: 'scarf', keywords: ['scarf', 'shawl'] },
  { tag: 'gloves', keywords: ['gloves', 'thermal gloves'] }
];

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTagValue(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function keywordMatchesText(text, keyword) {
  const normalizedText = String(text || '').toLowerCase();
  const normalizedKeyword = String(keyword || '').toLowerCase().trim();
  if (!normalizedText || !normalizedKeyword) return false;
  if (normalizedText.includes(normalizedKeyword)) return true;
  const escaped = escapeRegExp(normalizedKeyword);
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return regex.test(normalizedText);
}

function generateTags(productText) {
  const normalizedText = String(productText || '').toLowerCase();
  const tags = new Set();

  if (!normalizedText) {
    return [];
  }

  for (const { tag, keywords } of TAG_KEYWORDS) {
    for (const keyword of keywords) {
      if (keywordMatchesText(normalizedText, keyword)) {
        tags.add(normalizeTagValue(tag));
        break;
      }
    }
  }

  return Array.from(tags);
}

module.exports = {
  generateTags
};
