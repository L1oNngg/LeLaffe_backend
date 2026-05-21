import { config } from 'dotenv'
config()

import { NextResponse, NextRequest } from 'next/server'
import { POST } from '@/app/api/admin/products/route'

async function runTest() {
  const req = new NextRequest('http://localhost:3000/api/admin/products', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMSIsInJvbGUiOiJBRE1JTiJ9.9wXIyQOaWigEq2ao0JUp-2qHw8WQ9I-6OyNQZjnT23g',
      'content-type': 'application/json',
      'x-user-id': '01'
    },
    body: JSON.stringify({
      name: 'Test Product ' + Date.now(),
      price: 100,
      stock: 10,
      slug: 'test-product-' + Date.now(),
      category_id: 'eb79e2dc-21fc-4ee6-b9a3-559e875630d7' 
    })
  })

  try {
     const res = await POST(req)
     const resJson = await res.json()
     console.log('STATUS:', res.status)
     console.log('RESPONSE:', JSON.stringify(resJson, null, 2))
  } catch (e) {
     console.error('ERROR:', e)
  }
}

runTest()
