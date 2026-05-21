export class AdminDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminDatabaseError'
  }
}

export class ProductNotFoundError extends Error {
  constructor(public readonly productId: string) {
    super(`Product with ID ${productId} not found.`)
    this.name = 'ProductNotFoundError'
  }
}

export class DuplicateSlugError extends Error {
  constructor(public readonly slug: string) {
    super(`Product with slug ${slug} already exists.`)
    this.name = 'DuplicateSlugError'
  }
}
