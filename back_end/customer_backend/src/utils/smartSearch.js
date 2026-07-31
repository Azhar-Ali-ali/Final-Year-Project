/**
 * Smart Search Utility
 * Hybrid search: Database first, Gemini fallback
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const pluralize = require('pluralize');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Extract keywords and synonyms from search query using Gemini
 * Called only when database search returns no results
 */
async function extractSearchKeywords(searchQuery) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('GEMINI_API_KEY not set, skipping Gemini keyword extraction');
      return null;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are a shopping assistant. Extract important keywords and synonyms from this search query.

User search:
"${searchQuery}"

Return ONLY valid JSON (no markdown, no code blocks):
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "synonyms": ["synonym1", "synonym2"]
}

Be concise. Include singular forms only.
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    // Remove markdown code blocks if present
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(jsonText);

    if (Array.isArray(parsed.keywords)) {
      // Singularize keywords
      const singularKeywords = parsed.keywords.map(k => 
        pluralize.singular(String(k || '').toLowerCase().trim())
      ).filter(Boolean);
      
      // Combine keywords and synonyms
      const allTerms = [
        ...new Set([
          ...singularKeywords,
          ...(Array.isArray(parsed.synonyms) ? parsed.synonyms.map(s => 
            pluralize.singular(String(s || '').toLowerCase().trim())
          ) : [])
        ])
      ].filter(Boolean);

      return allTerms;
    }

    return null;
  } catch (error) {
    console.error('Gemini keyword extraction failed:', error.message);
    return null;
  }
}

/**
 * Smart search: Database first, Gemini fallback
 * @param {Object} db - PostgreSQL connection
 * @param {string} query - Search query
 * @param {Array} categories - Optional category filters
 * @returns {Array} - Search results
 */
async function smartSearchProducts(db, query, categories = []) {
  try {
    const searchTerm = String(query || '').trim().toLowerCase();
    if (!searchTerm) return [];

    // STEP 1: Try normal database search
    console.log(`[Smart Search] Database search for: "${searchTerm}"`);
    
    const dbResults = await normalDatabaseSearch(db, searchTerm, categories);
    
    if (dbResults.length > 0) {
      console.log(`[Smart Search] Found ${dbResults.length} results from database`);
      return dbResults;
    }

    console.log(`[Smart Search] No database results. Calling Gemini for keyword extraction...`);

    // STEP 2: Extract keywords from Gemini
    const keywords = await extractSearchKeywords(searchTerm);
    
    if (!keywords || keywords.length === 0) {
      console.log('[Smart Search] Gemini returned no keywords, returning empty results');
      return [];
    }

    console.log(`[Smart Search] Gemini extracted keywords: ${keywords.join(', ')}`);

    // STEP 3: Search database again with extracted keywords
    const geminiResults = await keywordDatabaseSearch(db, keywords, categories);
    
    console.log(`[Smart Search] Found ${geminiResults.length} results using Gemini keywords`);
    return geminiResults;

  } catch (error) {
    console.error('Smart search failed:', error.message);
    return [];
  }
}

/**
 * Normal database search on name + description + tags
 */
async function normalDatabaseSearch(db, searchTerm, categories = []) {
  try {
    const values = [`%${searchTerm}%`];
    let whereClause = `
      (LOWER(p.name) LIKE $1
       OR LOWER(p.description) LIKE $1
       OR LOWER(b.name) LIKE $1
       OR p.tags && ARRAY[${Array(5).fill('?').join(',')}])
    `;

    // Add category filter if provided
    if (categories.length > 0) {
      const normalizedCategories = categories.map(c => String(c || '').trim().toLowerCase());
      values.push(normalizedCategories);
      whereClause += ` AND (LOWER(c.name) = ANY($${values.length}::text[]) OR LOWER(c.slug) = ANY($${values.length}::text[]))`;
    }

    const sql = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.base_price as price,
        p.compare_price as originalPrice,
        p.average_rating as rating,
        p.total_reviews as reviewCount,
        c.name as category,
        b.name as brand,
        p.tags,
        COALESCE(img.image_url, '') as image,
        sp.store_name as sellerName
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC
        LIMIT 1
      ) img ON TRUE
      WHERE p.status = 'active' AND ${whereClause}
      LIMIT 20
    `;

    const result = await db.query(sql, values);
    return result.rows || [];
  } catch (error) {
    console.warn('Normal database search error:', error.message);
    return [];
  }
}

/**
 * Keyword-based database search using Gemini extracted keywords
 */
async function keywordDatabaseSearch(db, keywords, categories = []) {
  try {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    const values = [];
    const conditions = [];

    // Search for each keyword in name, description, or tags
    keywords.forEach((keyword, idx) => {
      const searchPattern = `%${keyword}%`;
      values.push(searchPattern);
      conditions.push(`(LOWER(p.name) LIKE $${idx + 1} OR LOWER(p.description) LIKE $${idx + 1} OR $${idx + 1}::text = ANY(p.tags))`);
    });

    let whereClause = `(${conditions.join(' OR ')})`;

    // Add category filter if provided
    if (categories.length > 0) {
      const normalizedCategories = categories.map(c => String(c || '').trim().toLowerCase());
      values.push(normalizedCategories);
      whereClause += ` AND (LOWER(c.name) = ANY($${values.length}::text[]) OR LOWER(c.slug) = ANY($${values.length}::text[]))`;
    }

    const sql = `
      SELECT 
        p.id,
        p.name,
        p.description,
        p.base_price as price,
        p.compare_price as originalPrice,
        p.average_rating as rating,
        p.total_reviews as reviewCount,
        c.name as category,
        b.name as brand,
        p.tags,
        COALESCE(img.image_url, '') as image,
        sp.store_name as sellerName
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.seller_profiles sp ON sp.user_id = p.seller_id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM public.product_images
        WHERE product_id = p.id
        ORDER BY is_primary DESC
        LIMIT 1
      ) img ON TRUE
      WHERE p.status = 'active' AND ${whereClause}
      LIMIT 20
    `;

    const result = await db.query(sql, values);
    return result.rows || [];
  } catch (error) {
    console.warn('Keyword database search error:', error.message);
    return [];
  }
}

module.exports = {
  smartSearchProducts,
  extractSearchKeywords,
  normalDatabaseSearch,
  keywordDatabaseSearch
};
