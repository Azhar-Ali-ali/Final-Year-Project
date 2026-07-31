# Smart Search Architecture

## Overview

This implements a **hybrid search strategy** that's fast, cheap, and consistent:

1. **Database-first**: Normal search on name + description + tags (fast, free)
2. **Gemini fallback**: Only if database returns no results
3. **Keyword extraction**: Gemini extracts keywords/synonyms from query
4. **Search again**: Uses those keywords to find products

## Why This Approach?

### ✅ Benefits
- **Fast**: Most searches complete without API call
- **Cheap**: Gemini only called when needed
- **Consistent**: No AI randomness for common searches
- **Scalable**: Works with growing product catalog

### ❌ Avoids
- Calling Gemini for every search (expensive + slow)
- Inconsistent results from AI-only search
- Rate limiting issues
- Dependency on external API

## Flow Chart

```
User searches "black cargo pants"
    ↓
Try database search on:
  - Product name
  - Description  
  - Tags
    ↓
    ├─ Found products? 
    │  └─ YES → Return immediately ✅
    │
    └─ NO results
       ↓
    Call Gemini to extract:
      - Keywords: ["black", "cargo", "pants"]
      - Synonyms: ["dark", "tactical", "trousers"]
       ↓
    Search database again with keywords
       ↓
    Return products ✅
```

## Database Search

### First attempt (normal search)

```sql
WHERE
  LOWER(name) LIKE LOWER('%black cargo pants%')
  OR LOWER(description) LIKE LOWER('%black cargo pants%')
  OR tag = ANY(tags)
```

### Second attempt (keyword search)

```sql
WHERE
  (LOWER(name) LIKE '%black%' OR name_tag = ANY(tags))
  OR (LOWER(name) LIKE '%cargo%' OR cargo_tag = ANY(tags))
  OR (LOWER(name) LIKE '%pants%' OR pants_tag = ANY(tags))
```

## Gemini Prompt

When database returns no results, ask Gemini:

```
The user searched:
"black cargo pants"

Extract the important shopping keywords and synonyms.

Return JSON only:
{
  "keywords": [],
  "synonyms": []
}
```

Gemini returns:
```json
{
  "keywords": ["black", "cargo", "pants"],
  "synonyms": ["dark", "tactical", "trousers"]
}
```

## API Response

```javascript
GET /api/products/search?q=black+cargo+pants

{
  "success": true,
  "data": [...products],
  "source": "database",  // or "gemini"
  "totalResults": 12
}
```

## Implementation Details

### File: `src/utils/smartSearch.js`

- `smartSearchProducts(db, query, categories)` - Main search orchestrator
- `normalDatabaseSearch()` - First attempt
- `keywordDatabaseSearch()` - Second attempt with keywords
- `extractSearchKeywords()` - Calls Gemini for keyword extraction

### Updated: `src/routes/productsRoutes.js`

- `/search` route now uses `smartSearchProducts`
- Falls back to mock data if database unavailable
- Handles category filters

## Configuration

Set Gemini API key:

```bash
# .env
GEMINI_API_KEY=your_key_here
```

If key not set, smart search only does database search (no Gemini fallback).

## Testing

```bash
$env:GEMINI_API_KEY = "your_key"
node scripts/test_smart_search.js
```

## Performance Considerations

### Typical case (product found immediately)
- Database search: ~50-200ms
- No API call
- **Total: ~50-200ms** ✅

### Fallback case (Gemini needed)
- Database search: ~50ms (no results)
- Gemini API call: ~500-2000ms
- Keyword database search: ~50ms
- **Total: ~600-2050ms** (acceptable for rare case)

### Cost
- Database searches: FREE
- Gemini calls: Only when database fails (~10-20% of searches)
- **Estimated cost**: 80-90% reduction vs. Gemini-for-every-search

## Future Improvements

1. **Cache Gemini results**: Store keyword maps for common searches
2. **ML model**: Train local model for keyword extraction (no API)
3. **Product analytics**: Track which searches fail to improve database indexing
4. **A/B testing**: Compare database-only vs. hybrid results
