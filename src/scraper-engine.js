import { chromium } from 'playwright-core';
import { AppError } from './errors.js';

/**
 * Normalizes and cleans image URLs.
 */
function cleanImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim();
  if (cleaned.startsWith('//')) cleaned = 'https:' + cleaned;
  if (!cleaned.startsWith('http')) return null;

  // Clean Shopee resize/thumbnail suffixes
  cleaned = cleaned.replace(/_tn$/, '').replace(/_cover$/, '').split('@')[0];

  // Exclude non-product images & icons
  const lower = cleaned.toLowerCase();
  if (
    lower.includes('avatar') ||
    lower.includes('avt-') ||
    lower.includes('badge') ||
    lower.includes('.svg') ||
    lower.includes('star') ||
    lower.includes('icon') ||
    lower.includes('logo') ||
    lower.includes('arrow') ||
    lower.includes('banner') ||
    lower.includes('data:image')
  ) {
    return null;
  }

  return cleaned;
}

/**
 * Extracts Shopee ShopID, ItemID, or username from URL.
 */
export function extractShopeeIds(urlStr) {
  try {
    const url = new URL(urlStr);
    // Pattern: -i.12345.67890
    const slugMatch = url.pathname.match(/-i\.(\d+)\.(\d+)/);
    if (slugMatch) {
      return { shopId: slugMatch[1], itemId: slugMatch[2] };
    }
    // Pattern: /product/12345/67890
    const productMatch = url.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (productMatch) {
      return { shopId: productMatch[1], itemId: productMatch[2] };
    }
    // Pattern: /{shop_username}/{itemId} (e.g. /beatriceclothing.official/44667564390)
    const userMatch = url.pathname.match(/^\/([^/]+)\/(\d+)/);
    if (
      userMatch &&
      !['product', 'search', 'cart', 'buyer', 'user', 'flash_sale', 'mall'].includes(userMatch[1])
    ) {
      return { username: userMatch[1], itemId: userMatch[2] };
    }
  } catch {}
  return null;
}

/**
 * Parses Shopee initial SSR HTML response and text/mfe-initial-data.
 */
function parseShopeeHtml(html) {
  let title = '';
  let description = '';
  let rating = '';
  let soldCount = '';
  let shopName = '';
  let videoUrl = '';
  const productImages = [];
  const reviewImages = [];

  // 1. Try parsing text/mfe-initial-data (Shopee's full SSR hydration payload)
  const mfeMatch = html.match(/<script[^>]*type=["']text\/mfe-initial-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (mfeMatch) {
    try {
      const data = JSON.parse(mfeMatch[1]);
      const bffMap = data?.initialState?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap || {};
      const itemBff = Object.values(bffMap)[0]?.item;
      const itemState = Object.values(data?.initialState?.item?.items || {})[0];
      const item = itemBff || itemState;

      if (item) {
        title = item.title || item.name || '';
        shopName = item.shop_vouchers?.[0]?.shop_name || '';

        // Product description & attributes
        const descParts = [];
        if (item.description && item.description.trim()) {
          descParts.push(item.description.trim());
        } else {
          const metaDescMatch =
            html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
          if (metaDescMatch) {
            descParts.push(metaDescMatch[1].replace(/&amp;/g, '&').trim());
          }
        }

        const attrLines = (item.attributes || [])
          .map((a) => (a.name && a.value ? `${a.name}: ${a.value}` : null))
          .filter(Boolean);

        if (attrLines.length > 0) {
          descParts.push('--- Spesifikasi Produk ---\n' + attrLines.join('\n'));
        }

        const varLines = (item.tier_variations || [])
          .map((tv) => {
            const opts = (tv.options || []).filter(Boolean).join(', ');
            return opts ? `${tv.name || 'Varian'}: ${opts}` : null;
          })
          .filter(Boolean);

        if (varLines.length > 0) {
          descParts.push('--- Pilihan Varian ---\n' + varLines.join('\n'));
        }

        description = descParts.join('\n\n');

        // Main & long catalog photos
        const rawImages = [
          ...(item.images || []),
          ...(item.long_images || []),
        ];
        for (const imgId of rawImages) {
          if (imgId) {
            const cleanId = String(imgId).replace(/_tn$/, '').replace(/_cover$/, '');
            productImages.push(`https://down-id.img.susercontent.com/file/${cleanId}`);
          }
        }

        // Tier variation photos are PRODUCT/VARIANT photos (added to product gallery)
        for (const tv of item.tier_variations || []) {
          if (Array.isArray(tv.images)) {
            for (const imgId of tv.images) {
              if (imgId) {
                const cleanId = String(imgId).replace(/_tn$/, '').replace(/_cover$/, '');
                productImages.push(`https://down-id.img.susercontent.com/file/${cleanId}`);
              }
            }
          }
        }

        // Rich text description infographic photos
        if (item.rich_text_description?.paragraph_list) {
          for (const p of item.rich_text_description.paragraph_list) {
            if (p.img_id) {
              productImages.push(`https://down-id.img.susercontent.com/file/${p.img_id}`);
            }
          }
        }

        // Product video
        videoUrl =
          item.video_info_list?.[0]?.default_format?.url ||
          item.video_info_list?.[0]?.formats?.[0]?.url ||
          '';

        // Rating & Sold (strictly real data, never fake dummy defaults)
        if (item.item_rating?.rating_star && item.item_rating.rating_star > 0) {
          rating = `${item.item_rating.rating_star.toFixed(1)}/5`;
        }
        if (item.historical_sold && item.historical_sold > 0) {
          soldCount =
            item.historical_sold > 1000
              ? `${(item.historical_sold / 1000).toFixed(1)}k terjual`
              : `${item.historical_sold} terjual`;
        }
      }
    } catch (e) {
      console.warn('[ScraperEngine] Failed to parse mfe-initial-data:', e.message);
    }
  }

  // 2. Fallbacks from meta tags
  if (!title) {
    const titleMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1];
    }
  }

  // Clean title (remove "Jual " prefix and "| Shopee Indonesia" suffix)
  title = title
    .replace(/^Jual\s+/i, '')
    .replace(/\s*\|\s*Shopee.*$/i, '')
    .trim();

  // If title was default Shopee page title, reset
  if (title.includes('Situs Belanja Online Terlengkap') || title.includes('Shopee Indonesia')) {
    title = '';
  }

  if (!description) {
    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) {
      description = descMatch[1].replace(/&amp;/g, '&').trim();
    }
  }

  // 3. Fallback to image regex scan if productImages is still empty
  if (productImages.length === 0) {
    const hashes = [
      ...html.matchAll(/(?:https:)?\/\/down-id\.img\.susercontent\.com\/file\/([a-zA-Z0-9_-]+)/g),
    ].map((m) => m[1]);
    for (const h of hashes) {
      const cleanH = h.replace(/_tn$/, '').replace(/_cover$/, '');
      if (!cleanH.includes('avatar') && !cleanH.includes('icon')) {
        productImages.push(`https://down-id.img.susercontent.com/file/${cleanH}`);
      }
    }
  }

  return {
    platform: 'shopee',
    title,
    description,
    shopName,
    rating,
    soldCount,
    videoUrl,
    images: Array.from(new Set(productImages.map(cleanImageUrl).filter(Boolean))),
    reviewImages: Array.from(new Set(reviewImages.map(cleanImageUrl).filter(Boolean))).slice(0, 15),
  };
}

/**
 * Deep headless scraper using Playwright to extract metadata, product images,
 * and review photos for Shopee, TikTok Shop, Tokopedia, or general e-commerce.
 */
async function scrapeWithPlaywright(targetUrl, chromePath) {
  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();

    let capturedShopeeHtml = '';
    const reviewPhotosCaptured = [];
    const isShopee = targetUrl.includes('shopee') || targetUrl.includes('shp.ee');
    const isTikTok =
      targetUrl.includes('tiktok') ||
      targetUrl.includes('tokopedia') ||
      targetUrl.includes('shop-id');

    // Intercept network responses
    page.on('response', async (response) => {
      try {
        const resUrl = response.url();

        // Shopee SSR HTML capture
        if (
          isShopee &&
          resUrl.includes('shopee.co.id') &&
          !capturedShopeeHtml &&
          response.status() === 200
        ) {
          const text = await response.text();
          if (text.includes('mfe-initial-data') || text.includes('<title')) {
            capturedShopeeHtml = text;
          }
        }

        // Reviews / ratings API intercept for Shopee & TikTok
        if (
          resUrl.includes('get_ratings') ||
          resUrl.includes('rating') ||
          resUrl.includes('comment') ||
          resUrl.includes('review') ||
          resUrl.includes('product/detail')
        ) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            const ratings =
              json?.data?.ratings ||
              json?.data?.reviews ||
              json?.data?.items ||
              json?.data?.review_list ||
              json?.data?.comments ||
              [];
            for (const r of ratings) {
              if (Array.isArray(r.images)) reviewPhotosCaptured.push(...r.images);
              if (Array.isArray(r.review_images)) reviewPhotosCaptured.push(...r.review_images);
              if (r.image && typeof r.image === 'string') reviewPhotosCaptured.push(r.image);
            }
          }
        }
      } catch {}
    });

    // Navigate to target URL
    await page.goto(targetUrl, {
      waitUntil: 'commit',
      timeout: 25000,
    });

    // If Shopee, wait for HTML capture
    if (isShopee) {
      for (let i = 0; i < 20; i++) {
        if (capturedShopeeHtml && capturedShopeeHtml.includes('mfe-initial-data')) break;
        await page.waitForTimeout(200);
      }

      if (capturedShopeeHtml) {
        const result = parseShopeeHtml(capturedShopeeHtml);

        // Also scroll down to trigger Shopee ratings and review photos hydration
        try {
          await page.evaluate(() => {
            const el = document.querySelector(
              '.shopee-product-rating, [class*="product-rating"], .product-ratings, [class*="rating-comment"]'
            );
            if (el) el.scrollIntoView();
            else window.scrollTo(0, document.body.scrollHeight / 2);
          });
          await page.waitForTimeout(1500);

          const domReviews = await page.evaluate(() => {
            const list = [];
            // 1. Direct review image tags
            document
              .querySelectorAll(
                '.shopee-product-rating img, [class*="rating-media"] img, [class*="shopee-product-rating__main"] img, [class*="shopee-rating-image"] img'
              )
              .forEach((img) => {
                const src = img.src || img.getAttribute('data-src') || '';
                if (src && !src.includes('avatar') && !src.includes('icon') && !src.includes('star')) {
                  list.push(src);
                }
              });

            // 2. Shopee review elements with background-image style
            document
              .querySelectorAll(
                '.shopee-rating-image__content, [class*="rating"] [style*="background-image"], [style*="down-id.img.susercontent.com/file/"]'
              )
              .forEach((el) => {
                const style = el.getAttribute('style') || '';
                const match = style.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/i);
                if (match && match[1] && !match[1].includes('avatar') && !match[1].includes('icon') && !match[1].includes('star')) {
                  list.push(match[1]);
                }
              });

            return list;
          });

          if (domReviews.length > 0) {
            reviewPhotosCaptured.push(...domReviews);
          }
        } catch {}

        // Add any review photos
        if (reviewPhotosCaptured.length > 0) {
          const reviewUrls = reviewPhotosCaptured.map((id) =>
            id.startsWith('http') ? id : `https://down-id.img.susercontent.com/file/${id}`
          );
          result.reviewImages = Array.from(new Set([...result.reviewImages, ...reviewUrls])).slice(0, 15);
        }

        return result;
      }
    }

    // For TikTok Shop / Tokopedia Shop
    if (isTikTok) {
      await page.waitForTimeout(2200);

      // Scroll to reviews section to trigger review hydration
      try {
        await page.evaluate(() => {
          const revHeader = Array.from(document.querySelectorAll('h2, h3, div')).find(
            (el) =>
              el.innerText?.trim() === 'Customer reviews' ||
              el.innerText?.trim() === 'Ulasan Pelanggan' ||
              el.innerText?.trim() === 'Reviews'
          );
          if (revHeader) revHeader.scrollIntoView();
        });
        await page.waitForTimeout(1200);
      } catch {}

      const tiktokData = await page.evaluate(() => {
        const getMeta = (prop) =>
          document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
          document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
          '';

        const ogTitle = getMeta('og:title') || getMeta('twitter:title');
        const h1 = document.querySelector('h1')?.innerText?.trim();
        const rawTitle = ogTitle || h1 || document.title || '';
        const title = rawTitle
          .replace(/\s*-\s*Shop\s*\|\s*Tokopedia.*$/i, '')
          .replace(/\s*\|\s*TikTok\s*Shop.*$/i, '')
          .trim();

        const ogDesc = getMeta('og:description') || getMeta('description');

        // Extract genuine seller product description (specifications, materials, benefits)
        let description = '';

        // Strategy 1: Find heading like "Product description" / "Deskripsi produk" / "Description"
        const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span'));
        const descHeader = allElements.find((el) => {
          const t = el.innerText?.trim();
          return (
            t === 'Product description' ||
            t === 'Deskripsi produk' ||
            t === 'Deskripsi Produk' ||
            t === 'Description'
          );
        });

        if (descHeader) {
          const next = descHeader.nextElementSibling || descHeader.parentElement?.nextElementSibling;
          if (next && next.innerText && next.innerText.trim().length > 15) {
            description = next.innerText.trim();
          }
        }

        // Strategy 2: Containers containing product description or expandable sections
        if (!description) {
          const containers = document.querySelectorAll(
            '[class*="productDescription"], [class*="product-desc"], [class*="expandableSection"], [data-qa="product_desc"]'
          );
          for (const c of containers) {
            const t = c.innerText?.trim() || '';
            // Avoid small snippets like "Size guide" or single word badges
            if (t.length > 30 && !t.startsWith('Size guide')) {
              description = t;
              break;
            }
          }
        }

        // Strategy 3: Clean up common UI action labels
        if (description) {
          description = description
            .replace(/^Product description\s*/i, '')
            .replace(/^Deskripsi produk\s*/i, '')
            .replace(/\n\s*(?:View more|Lihat lainnya|See more|View details)\s*$/i, '')
            .trim();
        }

        // Strategy 4: Fallback to og:description only if no rich seller text exists
        if (!description) {
          description = (ogDesc || '').trim();
        }

        const ogImg = getMeta('og:image') || getMeta('twitter:image');

        // Extract targeted product gallery images
        const galleryUrls = [];
        if (ogImg) galleryUrls.push(ogImg);

        document.querySelectorAll('img').forEach((img) => {
          const cls = (img.className || '') + ' ' + (img.parentElement?.className || '');
          const src = img.src || '';
          if (!src.startsWith('http')) return;

          // Exclude recommendations / cross-sell tiles
          if (
            cls.includes('rounded-8') ||
            cls.includes('recommend') ||
            cls.includes('suggest') ||
            cls.includes('similar') ||
            cls.includes('feed_list')
          ) {
            return;
          }

          // Exclude avatars, badges, svgs
          if (src.includes('avatar') || src.includes('avt-') || cls.includes('rounded-20')) return;

          // Product gallery matches: main slider, zoomable image, swatches
          if (
            cls.includes('cursor-zoom-in') ||
            (cls.includes('flex-none') && cls.includes('object-contain')) ||
            (cls.includes('aspect-square') && cls.includes('cursor-pointer')) ||
            (cls.includes('rounded-4') && cls.includes('object-cover'))
          ) {
            galleryUrls.push(src);
          }
        });

        // Extract real buyer review photos
        const reviewUrls = [];
        document.querySelectorAll('img').forEach((img) => {
          const alt = img.alt || '';
          const src = img.src || '';
          const cls = img.className || '';

          if (src.includes('avatar') || src.includes('avt-') || cls.includes('rounded-20')) return;

          if (
            alt.startsWith('Product Review') ||
            (cls.includes('cursor-pointer') && src.includes('crop-webp'))
          ) {
            reviewUrls.push(src);
          }
        });

        // Rating
        let rating = '';
        document.querySelectorAll('span, div').forEach((el) => {
          const text = el.innerText?.trim() || '';
          if (/^[0-5]\.[0-9]$/.test(text) && !rating) {
            rating = text + '/5';
          }
        });

        // Sold count
        let soldCount = '';
        document.querySelectorAll('span, div').forEach((el) => {
          const text = el.innerText?.trim() || '';
          const match = text.match(/([\d.]+[kK]?)\s*(?:sold|terjual)/i);
          if (match && !soldCount) {
            soldCount = match[1].toLowerCase() + ' terjual';
          }
        });

        // Shop name
        let shopName = '';
        const soldByEl = Array.from(document.querySelectorAll('div, span, a')).find((el) =>
          el.innerText?.trim().startsWith('Sold by')
        );
        if (soldByEl) {
          shopName = soldByEl.innerText.replace(/^Sold by\s*/i, '').trim();
        }

        return {
          title,
          description,
          shopName,
          rating,
          soldCount,
          images: Array.from(new Set(galleryUrls)),
          reviewImages: Array.from(new Set(reviewUrls)),
        };
      });

      const cleanImgs = tiktokData.images.map(cleanImageUrl).filter(Boolean);
      let cleanReviews = tiktokData.reviewImages.map(cleanImageUrl).filter(Boolean);

      if (reviewPhotosCaptured.length > 0) {
        const moreReviews = reviewPhotosCaptured.map((id) =>
          id.startsWith('http') ? id : `https://p16-oec-sg.ibyteimg.com/${id}`
        );
        cleanReviews = Array.from(new Set([...cleanReviews, ...moreReviews]));
      }

      return {
        platform: 'tiktok',
        title: tiktokData.title,
        description: tiktokData.description,
        shopName: tiktokData.shopName,
        price: '',
        rating: tiktokData.rating,
        soldCount: tiktokData.soldCount,
        images: cleanImgs.slice(0, 20),
        reviewImages: cleanReviews.slice(0, 15),
      };
    }

    // General e-commerce fallback
    await page.waitForTimeout(2000);

    const pageData = await page.evaluate(() => {
      const getMeta = (prop) =>
        document.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') ||
        document.querySelector(`meta[name="${prop}"]`)?.getAttribute('content') ||
        '';

      const title =
        getMeta('og:title') ||
        getMeta('twitter:title') ||
        document.querySelector('h1')?.innerText?.trim() ||
        document.title?.split('|')[0]?.trim() ||
        '';

      const description =
        getMeta('og:description') ||
        getMeta('description') ||
        document.querySelector('[data-qa="product_desc"]')?.innerText?.trim() ||
        document.querySelector('.product-description')?.innerText?.trim() ||
        '';

      const images = new Set();
      const ogImg = getMeta('og:image');
      if (ogImg) images.add(ogImg);

      document.querySelectorAll('img').forEach((img) => {
        const src = img.src || img.getAttribute('data-src') || '';
        const rect = img.getBoundingClientRect();
        if (rect.width >= 200 && rect.height >= 200) {
          images.add(src);
        }
      });

      return {
        title,
        description,
        images: Array.from(images),
        reviewImages: [],
      };
    });

    return {
      platform: 'general',
      title: pageData.title?.trim() || '',
      description: pageData.description?.trim() || '',
      price: '',
      rating: '',
      soldCount: '',
      images: pageData.images.map(cleanImageUrl).filter(Boolean).slice(0, 15),
      reviewImages: [],
    };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Main scraper entry point for Affiliate Studio.
 * Strictly extracts real product data without injecting dummy defaults.
 */
export async function scrapeAffiliateProduct(targetUrl, { chromePath } = {}) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new AppError(400, 'invalid_url', 'URL produk Shopee atau TikTok Shop wajib diisi');
  }

  const cleanUrl = targetUrl.trim();

  // Headless Playwright Scraper
  if (chromePath) {
    try {
      const liveData = await scrapeWithPlaywright(cleanUrl, chromePath);
      if (liveData && (liveData.title || liveData.images.length > 0)) {
        return {
          ...liveData,
          sourceUrl: cleanUrl,
          scrapedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('[ScraperEngine] Playwright scrape error:', err.message);
    }
  }

  throw new AppError(
    422,
    'product_not_found',
    'Tidak dapat mengekstrak data dari link ini. Pastikan link produk aktif dan dapat dibuka, atau masukkan foto & deskripsi secara manual.'
  );
}
