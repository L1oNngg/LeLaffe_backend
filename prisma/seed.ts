/**
 * PRISMA SEED SCRIPT — Imperial Skin
 * Run: npm run seed
 *
 * Inserts 3 luxury skincare products with:
 *   - 1 Category each (shared: "duong-da", "lam-sach", "chong-nang")
 *   - 2 Media items per product (1 IMAGE + 1 VIDEO, both READY)
 *   - 3 Story Blocks per product (HERO_FULLSCREEN, PARALLAX_IMAGE, SPLIT_SCREEN_TEXT)
 *
 * Media CDN URLs use placeholder CDN paths — replace with real CloudFront domain.
 * raw_s3_key uses realistic bucket key format for reference.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import 'dotenv/config'
import { BlockType, MediaType, MediaStatus } from '@prisma/client'

// ── Prisma v7: requires Driver Adapter ──────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

// ----------------------------------------------------------------
// Seed Data Definitions
// ----------------------------------------------------------------

const CDN_BASE = 'https://cdn.imperial-skin.example.com'
const S3_BASE = 'imperial-skin-media'

const categories = [
  { name: 'Dưỡng Da', slug: 'duong-da' },
  { name: 'Làm Sạch', slug: 'lam-sach' },
  { name: 'Chống Nắng', slug: 'chong-nang' },
]

const products = [
  {
    name: 'Imperial Sérum 4K',
    slug: 'imperial-serum-4k',
    categorySlug: 'duong-da',
    price: '2850000',
    stock: 50,
    media: [
      {
        mediaType: MediaType.IMAGE,
        rawS3Key: `${S3_BASE}/products/serum-4k/cover.webp`,
        cdnUrl: `${CDN_BASE}/products/serum-4k/cover.webp`,
        thumbnailUrl: null,
        resolutions: { variants: ['original', '800w', '400w'] },
        status: MediaStatus.READY,
      },
      {
        mediaType: MediaType.VIDEO,
        rawS3Key: `${S3_BASE}/products/serum-4k/story.mp4`,
        cdnUrl: `${CDN_BASE}/products/serum-4k/hls/master.m3u8`,
        thumbnailUrl: `${CDN_BASE}/products/serum-4k/thumbnail.webp`,
        resolutions: { variants: ['1080p', '720p', '480p'] },
        status: MediaStatus.READY,
      },
    ],
    storyBlocks: [
      {
        blockType: BlockType.HERO_FULLSCREEN,
        textContent: {
          title: 'Cảm nhận sự trẻ trung vĩnh cửu',
          subtitle: 'Công nghệ Nano-Encapsulation đưa dưỡng chất vào tận lớp biểu bì thứ 7',
          cta: 'Khám phá ngay',
        },
        orderIndex: 1,
        mediaIndex: 1, // VIDEO
      },
      {
        blockType: BlockType.PARALLAX_IMAGE,
        textContent: {
          title: 'Chiết xuất từ 24 loại thảo mộc quý',
          body: 'Mỗi giọt sérum là kết tinh của 3 năm nghiên cứu tại phòng lab Thụy Sĩ.',
        },
        orderIndex: 2,
        mediaIndex: 0, // IMAGE
      },
      {
        blockType: BlockType.SPLIT_SCREEN_TEXT,
        textContent: {
          left: { heading: 'Trước', description: 'Da xỉn màu, nếp nhăn sâu sau 40 tuổi' },
          right: { heading: 'Sau 30 ngày', description: 'Da căng bóng, tông đều, giảm 68% nếp nhăn' },
        },
        orderIndex: 3,
        mediaIndex: 0, // IMAGE
      },
    ],
  },
  {
    name: 'Velvet Cleansing Balm',
    slug: 'velvet-cleansing-balm',
    categorySlug: 'lam-sach',
    price: '980000',
    stock: 120,
    media: [
      {
        mediaType: MediaType.IMAGE,
        rawS3Key: `${S3_BASE}/products/cleansing-balm/cover.webp`,
        cdnUrl: `${CDN_BASE}/products/cleansing-balm/cover.webp`,
        thumbnailUrl: null,
        resolutions: { variants: ['original', '800w', '400w'] },
        status: MediaStatus.READY,
      },
      {
        mediaType: MediaType.VIDEO,
        rawS3Key: `${S3_BASE}/products/cleansing-balm/story.mp4`,
        cdnUrl: `${CDN_BASE}/products/cleansing-balm/hls/master.m3u8`,
        thumbnailUrl: `${CDN_BASE}/products/cleansing-balm/thumbnail.webp`,
        resolutions: { variants: ['1080p', '720p'] },
        status: MediaStatus.READY,
      },
    ],
    storyBlocks: [
      {
        blockType: BlockType.HERO_FULLSCREEN,
        textContent: {
          title: 'Làm sạch như tơ nhung',
          subtitle: 'Double-cleanse trong một bước — tan chảy mọi lớp makeup không cần cọ rửa',
          cta: 'Trải nghiệm',
        },
        orderIndex: 1,
        mediaIndex: 1, // VIDEO
      },
      {
        blockType: BlockType.PARALLAX_IMAGE,
        textContent: {
          title: 'Công thức Zero-Foam',
          body: 'Không xà phòng, không SLS — chỉ có dầu hoa hồng Maroc và bơ Shea hữu cơ.',
        },
        orderIndex: 2,
        mediaIndex: 0, // IMAGE
      },
      {
        blockType: BlockType.SPLIT_SCREEN_TEXT,
        textContent: {
          left: { heading: 'pH 5.5', description: 'Cân bằng hoàn hảo với làn da tự nhiên' },
          right: { heading: '30 giây', description: 'Thời gian massage khuyến nghị để đạt hiệu quả tối đa' },
        },
        orderIndex: 3,
        mediaIndex: 0, // IMAGE
      },
    ],
  },
  {
    name: 'Aurora Shield SPF 50+',
    slug: 'aurora-shield-spf50',
    categorySlug: 'chong-nang',
    price: '1450000',
    stock: 75,
    media: [
      {
        mediaType: MediaType.IMAGE,
        rawS3Key: `${S3_BASE}/products/spf50/cover.webp`,
        cdnUrl: `${CDN_BASE}/products/spf50/cover.webp`,
        thumbnailUrl: null,
        resolutions: { variants: ['original', '800w', '400w'] },
        status: MediaStatus.READY,
      },
      {
        mediaType: MediaType.VIDEO,
        rawS3Key: `${S3_BASE}/products/spf50/story.mp4`,
        cdnUrl: `${CDN_BASE}/products/spf50/hls/master.m3u8`,
        thumbnailUrl: `${CDN_BASE}/products/spf50/thumbnail.webp`,
        resolutions: { variants: ['4k', '1080p', '720p'] },
        status: MediaStatus.READY,
      },
    ],
    storyBlocks: [
      {
        blockType: BlockType.HERO_FULLSCREEN,
        textContent: {
          title: 'Lá chắn vô hình trước ánh nắng',
          subtitle: 'Công nghệ Photostable Filter — bảo vệ UVA/UVB/HEV 12 giờ liên tục',
          cta: 'Mua ngay',
        },
        orderIndex: 1,
        mediaIndex: 1, // VIDEO
      },
      {
        blockType: BlockType.PARALLAX_IMAGE,
        textContent: {
          title: 'Không dầu. Không trắng bệch.',
          body: 'Texture gel-water siêu nhẹ, thẩm thấu trong 30 giây, không để lại cast trắng trên mọi tông da.',
        },
        orderIndex: 2,
        mediaIndex: 0, // IMAGE
      },
      {
        blockType: BlockType.SPLIT_SCREEN_TEXT,
        textContent: {
          left: { heading: 'PA++++', description: 'Mức bảo vệ UVA cao nhất theo tiêu chuẩn Nhật Bản' },
          right: { heading: 'Reef-Safe', description: 'Không chứa Oxybenzone — thân thiện với hệ sinh thái biển' },
        },
        orderIndex: 3,
        mediaIndex: 0, // IMAGE
      },
    ],
  },
]

// ----------------------------------------------------------------
// Main Seed Function
// ----------------------------------------------------------------

async function main() {
  console.log('🌱 Starting Imperial Skin seed...\n')

  // ── Clean existing dev data (idempotent seed) ──────────────────
  // Order matters due to FK constraints
  await prisma.order_Item.deleteMany()
  await prisma.order.deleteMany()
  await prisma.product_Story_Block.deleteMany()
  await prisma.media.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  console.log('🗑️  Cleared existing seed data\n')

  // ── Insert Categories ──────────────────────────────────────────
  const categoryMap = new Map<string, string>() // slug → id

  for (const cat of categories) {
    const created = await prisma.category.create({ data: cat })
    categoryMap.set(cat.slug, created.id)
    console.log(`✅ Category: ${cat.name} (${cat.slug})`)
  }

  console.log()

  // ── Insert Products with Media & Story Blocks ──────────────────
  for (const productDef of products) {
    const categoryId = categoryMap.get(productDef.categorySlug)!

    // 1. Create Product
    const product = await prisma.product.create({
      data: {
        name: productDef.name,
        slug: productDef.slug,
        category_id: categoryId,
        price: productDef.price,
        stock: productDef.stock,
        is_published: true,
      },
    })
    console.log(`📦 Product: ${product.name} (id: ${product.id})`)

    // 2. Create Media — track IDs for Story Block references
    const mediaIds: string[] = []
    for (const mediaDef of productDef.media) {
      const media = await prisma.media.create({
        data: {
          product_id: product.id,
          media_type: mediaDef.mediaType,
          raw_s3_key: mediaDef.rawS3Key,
          cdn_url: mediaDef.cdnUrl,
          thumbnail_url: mediaDef.thumbnailUrl,
          resolutions: mediaDef.resolutions,
          status: mediaDef.status,
        },
      })
      mediaIds.push(media.id)
      console.log(`   🖼️  Media: ${mediaDef.mediaType} — ${media.cdn_url}`)
    }

    // 3. Create Story Blocks (BR-05: max 10 per product — seed uses 3)
    for (const blockDef of productDef.storyBlocks) {
      await prisma.product_Story_Block.create({
        data: {
          product_id: product.id,
          media_id: mediaIds[blockDef.mediaIndex],
          block_type: blockDef.blockType,
          text_content: blockDef.textContent,
          order_index: blockDef.orderIndex,
        },
      })
      console.log(`   📖 Block [${blockDef.orderIndex}]: ${blockDef.blockType}`)
    }

    console.log()
  }

  console.log('✨ Seed completed successfully!')
  console.log(`   Categories: ${categories.length}`)
  console.log(`   Products:   ${products.length}`)
  console.log(`   Media:      ${products.length * 2}`)
  console.log(`   Blocks:     ${products.length * 3}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
