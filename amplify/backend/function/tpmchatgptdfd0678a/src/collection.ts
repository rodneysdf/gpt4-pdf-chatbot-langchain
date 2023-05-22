import axios from 'axios';
import { Credentials, LambdaFunctionURLEvent } from "./datamodels";
import { LambdaFunctionURLResponse } from "./interfaces";
import { initPinecone } from './util/pineconeclient';

// import { PineconeStore } from 'langchain/vectorstores/pinecone';
// import { describeIndexStatsRequest } from '@pinecone-database/pinecone';
const axiosInstance = axios.create({
});


// Purge the vector db of data
export const purge = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {

  const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
  const index = pinecone.Index(credentials.pinecone.indexName);

  try {
    await index.delete1({
      deleteAll: true,
      namespace: credentials.pinecone.namespace,
    });
    console.log(`Deleted all vectors in namespace: ${credentials.pinecone.namespace}`);
  } catch (error) {
    console.error(
      `Error deleting vectors in namespace: ${credentials.pinecone.namespace}`,
      error
    );
  }

  return collection(nullLambdaFunctionURLEvent(), credentials)
}


// Get the current size of the vector db
// equivalent to:
// curl -X GET https://tpm-cd087dc.svc.asia-southeast1-gcp-free.pinecone.io/describe_index_stats \
// -H 'Api-Key: xxx'
export const collection = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {

  const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
  const index = pinecone.Index(credentials.pinecone.indexName);

  const statsRaw = await index.describeIndexStats({
    describeIndexStatsRequest: {
      filter: {
      },
    },
  })
  let vectorCount: number = 0
  console.log("collection:index.describeIndexStats():", statsRaw)

  // test for the namespace existence first
  if (statsRaw?.namespaces && statsRaw?.namespaces?.[credentials.pinecone.namespace] !== undefined) {
    if (statsRaw?.namespaces?.[credentials.pinecone.namespace]?.vectorCount !== undefined) {
      vectorCount = statsRaw?.namespaces?.[credentials.pinecone.namespace].vectorCount || 0;
    }
  }

  console.log('Returning vectorCount=', vectorCount)
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "size": vectorCount,
      "max": 100
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

export function nullLambdaFunctionURLEvent(): LambdaFunctionURLEvent {
  return {
    version: '',
    routeKey: '',
    rawPath: '',
    rawQueryString: '',
    headers: {
      authorization: '',
      "x-amzn-lambda-proxying-cell": '',
      "content-length": '',
      referer: '',
      "x-amzn-tls-version": '',
      "sec-fetch-site": '',
      origin: '',
      "x-forwarded-port": '',
      "x-amzn-lambda-proxy-auth": '',
      "x-amzn-tls-cipher-suite": '',
      "sec-ch-ua-mobile": '',
      host: '',
      "content-type": '',
      "x-amzn-lambda-forwarded-host": '',
      "sec-fetch-mode": '',
      "accept-language": '',
      "x-forwarded-proto": '',
      dnt: '',
      "x-forwarded-for": '',
      accept: '',
      "x-amzn-lambda-forwarded-client-ip": '',
      "sec-ch-ua": '',
      "x-amzn-trace-id": '',
      "sec-ch-ua-platform": '',
      "accept-encoding": '',
      "sec-fetch-dest": '',
      "user-agent": '',
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
        userAgent: '',
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