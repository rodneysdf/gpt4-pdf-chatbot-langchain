import { PineconeClient } from '@pinecone-database/pinecone'

export async function initPinecone (environment: string, apiKey: string) {
  try {
    const pinecone = new PineconeClient()

    await pinecone.init({
      environment: environment ?? '', // this is in the dashboard
      apiKey
    })

    return pinecone
  } catch (error) {
    console.log('error', error)
    throw new Error('Failed to initialize Pinecone Client')
  }
}
