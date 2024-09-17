import { Credentials } from './common/datamodels'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './common/interfaces'
import { initPinecone } from './common/pineconeclient'

// Purge the vector db of data
export const purge = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
  const index = pinecone.Index(credentials.pinecone.indexName)

  try {
    await index.delete1({
      deleteAll: true,
      namespace: credentials.pinecone.namespace
    })
    console.log(`Deleted all vectors in namespace: ${credentials.pinecone.namespace}`)
  } catch (error) {
    console.error(
      `Error deleting vectors in namespace: ${credentials.pinecone.namespace}`,
      error
    )
  }

  return await collection(nullLambdaFunctionURLEvent(), credentials)
}

// Get the current size of the vector db
// equivalent to:
// curl -X GET https://tpm-cd087dc.svc.asia-southeast1-gcp-free.pinecone.io/describe_index_stats \
// -H 'Api-Key: xxx'
export const collection = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
  const index = pinecone.Index(credentials.pinecone.indexName)

  const statsRaw = await index.describeIndexStats({
    describeIndexStatsRequest: {
      filter: {
      }
    }
  })
  let vectorCount: number = 0
  console.log('collection:index.describeIndexStats():', statsRaw)

  // test for the namespace existence first
  if (statsRaw?.namespaces?.[credentials.pinecone.namespace] !== undefined) {
    if (statsRaw?.namespaces?.[credentials.pinecone.namespace]?.vectorCount !== undefined) {
      vectorCount = statsRaw?.namespaces?.[credentials.pinecone.namespace].vectorCount ?? 0
    }
  }

  console.log('Returning vectorCount=', vectorCount)
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      size: vectorCount,
      max: 100
    })
  }
}

// Example filters:
// plain:
// stats {
//   namespaces: { 'pdf-test': { vectorCount: 73 } },
//   dimension: 1536,
//   indexFullness: 0,
//   totalVectorCount: 73
// }

// "namespaces": "pdf-test":
// stats {
//   namespaces: {},
//   dimension: 1536,
//   indexFullness: 0,
//   totalVectorCount: 73
// }

export function nullLambdaFunctionURLEvent (): LambdaFunctionURLEvent {
  return {
    version: '',
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    headers: {
    },
    requestContext: {
      accountId: '',
      apiId: '',
      domainName: '',
      domainPrefix: '',
      http: {
        method: '',
        path: '',
        protocol: '',
        sourceIp: '',
        userAgent: ''
      },
      requestId: '',
      routeKey: '',
      stage: '',
      time: '',
      timeEpoch: 0
    },
    body: '',
    isBase64Encoded: false
  }
}
