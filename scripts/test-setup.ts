import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding test data...')

  // Upsert user 01
  const user = await prisma.user.upsert({
    where: { id: '01' },
    update: { role: 'ADMIN' },
    create: {
      id: '01',
      email: 'admin01@imperial.com',
      password_hash: 'mocked',
      role: 'ADMIN',
    },
  })
  console.log('User created:', user.id)

  // Upsert a category
  const category = await prisma.category.upsert({
    where: { slug: 'test-category' },
    update: {},
    create: {
      name: 'Test Category',
      slug: 'test-category',
    },
  })
  console.log('Category created:', category.id)

  const media = await prisma.media.create({
    data: {
      product_id: '',
      media_type: 'IMAGE',
      cdn_url: 'https://test/image.webp',
      status: 'READY'
    }
  }).catch(() => null)
  
  if (media) {
     console.log('Media created for testing')
  }

  process.exit(0)
}

main().catch(console.error)
