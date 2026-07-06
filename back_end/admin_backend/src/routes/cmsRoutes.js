const express = require('express');

const router = express.Router();

async function safeQuery(db, sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result.rows;
  } catch (error) {
    console.error('CMS Query Error:', error.message);
    return [];
  }
}

// ====== GET CMS Pages ======
router.get('/pages', async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        title,
        slug,
        status,
        meta_description AS content,
        meta_title AS seo_title,
        meta_description AS seo_description,
        '' AS seo_keywords,
        created_at,
        updated_at,
        published_at
      FROM cms_pages
      ORDER BY created_at DESC
    `;
    
    const pages = await safeQuery(req.db, sql);
    
    return res.json({
      success: true,
      data: pages
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS pages',
      error: error.message
    });
  }
});

// ====== GET CMS Sections ======
router.get('/sections', async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        page_id,
        COALESCE(heading, section_key) AS title,
        COALESCE(body, content::text) AS content,
        section_type,
        sort_order AS display_order,
        created_at,
        updated_at
      FROM cms_sections
      ORDER BY sort_order ASC, created_at ASC
    `;
    
    const sections = await safeQuery(req.db, sql);
    
    return res.json({
      success: true,
      data: sections
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS sections',
      error: error.message
    });
  }
});

// ====== GET CMS Navigation ======
router.get('/navigation', async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        label,
        href AS url,
        parent_id,
        sort_order AS display_order,
        is_active,
        created_at,
        updated_at
      FROM cms_navigation
      WHERE is_active = true
      ORDER BY sort_order ASC, created_at ASC
    `;
    
    const navigation = await safeQuery(req.db, sql);
    
    return res.json({
      success: true,
      data: navigation
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch navigation',
      error: error.message
    });
  }
});

// ====== GET CMS Assets (Banners, Images) ======
router.get('/assets', async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        file_name,
        file_url,
        COALESCE(mime_type, asset_type) AS file_type,
        asset_type,
        'active' AS status,
        asset_type AS location,
        file_name AS alt_text,
        created_at,
        created_at AS updated_at,
        NULL::timestamp AS published_at
      FROM cms_assets
      ORDER BY created_at DESC
    `;
    
    const assets = await safeQuery(req.db, sql);
    
    return res.json({
      success: true,
      data: assets
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS assets',
      error: error.message
    });
  }
});

// ====== CREATE CMS Asset ======
router.post('/assets', async (req, res) => {
  try {
    const {
      title,
      fileUrl,
      mimeType,
      fileSize
    } = req.body;

    if (!title || !fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required asset fields'
      });
    }

    const insertSql = `
      INSERT INTO cms_assets (
        asset_type,
        file_name,
        file_url,
        mime_type,
        file_size,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, asset_type, file_name, file_url, mime_type, file_size, created_at
    `;

    const result = await req.db.query(insertSql, [
      'image',
      title,
      fileUrl,
      mimeType,
      fileSize
    ]);

    const asset = result.rows[0];
    return res.json({
      success: true,
      data: {
        ...asset,
        status: 'active',
        location: 'homepage',
        alt_text: title
      }
    });
  } catch (error) {
    console.error('Failed to create CMS asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create CMS asset',
      error: error.message
    });
  }
});

// ====== UPDATE CMS Asset ======
router.put('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, fileUrl, mimeType, fileSize } = req.body;

    if (!title || !fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'Missing required asset fields'
      });
    }

    const updateSql = `
      UPDATE cms_assets
      SET file_name = $1,
          file_url = $2,
          mime_type = $3,
          file_size = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING id, asset_type, file_name, file_url, mime_type, file_size, created_at, updated_at
    `;

    const result = await req.db.query(updateSql, [
      title,
      fileUrl,
      mimeType,
      fileSize,
      id
    ]);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'CMS asset not found'
      });
    }

    const asset = result.rows[0];
    return res.json({
      success: true,
      data: {
        ...asset,
        status: 'active',
        location: 'homepage',
        alt_text: title
      }
    });
  } catch (error) {
    console.error('Failed to update CMS asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update CMS asset',
      error: error.message
    });
  }
});

// ====== DELETE CMS Asset ======
router.delete('/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deleteSql = `
      DELETE FROM cms_assets
      WHERE id = $1
      RETURNING id
    `;

    const result = await req.db.query(deleteSql, [id]);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'CMS asset not found'
      });
    }

    return res.json({
      success: true,
      data: {
        id: result.rows[0].id
      }
    });
  } catch (error) {
    console.error('Failed to delete CMS asset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete CMS asset',
      error: error.message
    });
  }
});

// ====== CREATE OR UPDATE CMS Section ======
router.post('/sections', async (req, res) => {
  try {
    const {
      pageSlug,
      sectionKey,
      heading,
      body,
      content,
      sectionType = 'hero',
      sortOrder = 1,
      isVisible = true
    } = req.body;

    if (!pageSlug || !sectionKey || !heading) {
      return res.status(400).json({
        success: false,
        message: 'Missing required section fields'
      });
    }

    const pageResult = await req.db.query(
      `SELECT id FROM cms_pages WHERE slug = $1 LIMIT 1`,
      [pageSlug]
    );

    if (!pageResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Page not found for CMS section'
      });
    }

    const pageId = pageResult.rows[0].id;
    const sectionResult = await req.db.query(
      `SELECT id FROM cms_sections WHERE page_id = $1 AND section_key = $2 LIMIT 1`,
      [pageId, sectionKey]
    );

    const jsonContent = content ? JSON.stringify(content) : null;
    let section;

    if (sectionResult.rows.length) {
      const updateSql = `
        UPDATE cms_sections
        SET heading = $1,
            body = $2,
            content = $3::json,
            section_type = $4,
            sort_order = $5,
            is_visible = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING id, page_id, section_key, section_type, heading, body, content, sort_order, is_visible, created_at, updated_at
      `;

      const updateRes = await req.db.query(updateSql, [
        heading,
        body,
        jsonContent,
        sectionType,
        sortOrder,
        isVisible,
        sectionResult.rows[0].id
      ]);
      section = updateRes.rows[0];
    } else {
      const insertSql = `
        INSERT INTO cms_sections (
          page_id,
          section_key,
          section_type,
          heading,
          body,
          content,
          sort_order,
          is_visible,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6::json, $7, $8, NOW(), NOW())
        RETURNING id, page_id, section_key, section_type, heading, body, content, sort_order, is_visible, created_at, updated_at
      `;

      const insertRes = await req.db.query(insertSql, [
        pageId,
        sectionKey,
        sectionType,
        heading,
        body,
        jsonContent,
        sortOrder,
        isVisible
      ]);
      section = insertRes.rows[0];
    }

    return res.json({
      success: true,
      data: section
    });
  } catch (error) {
    console.error('Failed to create or update CMS section:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save CMS section',
      error: error.message
    });
  }
});

// ====== GET CMS Announcements ======
router.get('/announcements', async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        title,
        body AS content,
        audience AS announcement_type,
        CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status,
        ROW_NUMBER() OVER (ORDER BY created_at DESC)::int AS display_order,
        starts_at,
        ends_at,
        created_at,
        updated_at
      FROM cms_announcements
      ORDER BY created_at DESC
    `;
    
    const announcements = await safeQuery(req.db, sql);
    
    return res.json({
      success: true,
      data: announcements
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements',
      error: error.message
    });
  }
});

// ====== GET Single Page with Sections ======
router.get('/pages/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const pageSql = `
      SELECT
        id,
        title,
        slug,
        status,
        meta_description AS content,
        meta_title AS seo_title,
        meta_description AS seo_description,
        '' AS seo_keywords,
        created_at, updated_at, published_at
      FROM cms_pages
      WHERE id = $1
      LIMIT 1
    `;

    const sectionsSql = `
      SELECT
        id,
        page_id,
        COALESCE(heading, section_key) AS title,
        COALESCE(body, content::text) AS content,
        section_type,
        sort_order AS display_order,
        created_at,
        updated_at
      FROM cms_sections
      WHERE page_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `;

    const [pageRows, sectionsRows] = await Promise.all([
      safeQuery(req.db, pageSql, [id]),
      safeQuery(req.db, sectionsSql, [id])
    ]);

    if (!pageRows.length) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    const page = pageRows[0];
    page.sections = sectionsRows;

    return res.json({
      success: true,
      data: page
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch page details',
      error: error.message
    });
  }
});

// ====== GET Summary Stats ======
router.get('/stats', async (req, res) => {
  try {
    const [pagesResult, assetsResult, announcementsResult] = await Promise.all([
      safeQuery(req.db, `SELECT COUNT(*)::int AS total FROM cms_pages`),
      safeQuery(req.db, `SELECT COUNT(*)::int AS total FROM cms_assets`),
      safeQuery(req.db, `SELECT COUNT(*)::int AS total FROM cms_announcements`)
    ]);

    return res.json({
      success: true,
      data: {
        totalPages: pagesResult[0]?.total || 0,
        totalAssets: assetsResult[0]?.total || 0,
        totalAnnouncements: announcementsResult[0]?.total || 0
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch CMS stats',
      error: error.message
    });
  }
});

module.exports = router;
