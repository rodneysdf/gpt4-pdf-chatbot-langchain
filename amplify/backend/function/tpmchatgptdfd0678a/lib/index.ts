import { APIGatewayProxyResult } from 'aws-lambda';
import 'source-map-support/register';
import { initPinecone } from './util/pineconeclient';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { makeChain } from './util/make-chain';
import { getParameter } from './util/parameterStore';
import { Convert, Credentials, LambdaFunctionURLEvent, QuestionHistory } from "./datamodels";
import { env } from 'node:process';
import jwkToBuffer from 'jwk-to-pem';



// Lambda entry point
export const handler = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  if (!(event.requestContext.http.method === 'POST' || event.requestContext.http.method === 'GET')) {
    return {
      statusCode: 405,
      body: JSON.stringify({
        "error": "Method not allowed"
      })
    }
  }
console.log("request:", event)
  // perform auth
  const region: string = process.env["REGION"] || ""
  const authName: string = process.env["AUTHNAME"] || ""
  const userPoolId: string = process.env[`AUTH_${authName}_USERPOOLID`] || ""
  let iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId;

  console.log("iss", iss)

  const pemOptions: PemOptions = {
    url: iss + '/.well-known/jwks.json',
    json: true,
    transform: _include_headers
  };

  // let pems = await downloadPem(undefined, pemOptions);
  const response = await fetch(pemOptions.url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();

  console.log("pems data:", data);

  // try {
  //   // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
  //   const credentialsSecret: string = process.env["credentials"] || ""
  //   const credentialsJSON: string = await getParameter(credentialsSecret, true) || "";
  //   credentials = Convert.toCredentials(credentialsJSON);
  // } catch (error) {
  //   console.log("error accessing credentials :", error);

  //   return {
  //     statusCode: 400,
  //     body: JSON.stringify({
  //       "error": "could not get configuration"
  //     })
  //   }
  // }

  // route the request
  if (event.requestContext.http.path === '/api/chat') {
    return chat(event);
  }
  switch (event.requestContext.http.path) {
    case '/api/chat':
      return chat(event);
      break;
    case '/api/upload':
      return upload(event);
      break;
    case '/api/add':
      return add(event);
      break;
    case '/api/purge':
      return purge(event);
      break;
    case '/api/profile':
      return profile(event);
      break;
  }

  // if it gets to here it is an error return
  return {
    statusCode: 400,
    body: JSON.stringify({
      "error": "unknown request"
    })
  }
}

// '/api/chat'
const chat = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  let questionHistory: QuestionHistory
  try {
    let inputBody: string;
    if (event.isBase64Encoded) {
      questionHistory = Convert.toQuestionHistory(Buffer.from(event.body, 'base64').toString("utf8"));
    } else {
      questionHistory = Convert.toQuestionHistory(event.body);
    }
  } catch (error) {
    console.log("error converting to questionHistory :", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No question in the request"
      })
    }
  }
  if (!questionHistory.question) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No question in the request"
      })
    }
  }

  // load credentials needed to call ChatGPT
  let credentials: Credentials
  try {
    // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
    const credentialsSecret: string = process.env["credentials"] || ""
    const credentialsJSON: string = await getParameter(credentialsSecret, true) || "";
    credentials = Convert.toCredentials(credentialsJSON);
  } catch (error) {
    console.log("error accessing credentials :", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "could not get configuration"
      })
    }
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey;

  //
  // Start of logic
  console.log('question', questionHistory);

  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = questionHistory.question.trim().replaceAll('\n', ' ');

  try {
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName);

    /* create vectorstore*/
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: 'text',
        namespace: credentials.pinecone.namespace, //namespace comes from your config folder
      },
    );

    // //create chain
    const chain = makeChain(vectorStore);

    //Ask a question using chat history
    const response = await chain.call({
      question: sanitizedQuestion,
      chat_history: questionHistory.history || [],
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    }
  } catch (error: any) {
    console.log('error', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        "error": error.message || 'Something went wrong'
      })
    }
  }
}

const upload = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: "ok"
  }
}

const add = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: "ok"
  }
}

const purge = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: "ok"
  }
}

const profile = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: "ok"
  }
}



interface PemOptions {
  url: string;
  json: boolean;
  transform: (body: any, response: any, resolveWithFullResponse: boolean) => any;
}

const _include_headers = function (body: any, response: any, resolveWithFullResponse: boolean) {
  return { 'headers': response.headers, 'body': body };
};


// async function downloadPem(pems: any, pemOptions: PemOptions): Promise<any> {
//   return new Promise((resolve, reject) => {
//     if (pems === undefined) {
//       const response = await fetch(pemOptions.url, {
//         method: 'GET',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//       });
//       const data = await response.json();

//       fetch(pemOptions.url)
//         .then(response => response.json())
//         .then(response => {
//           pems = {};
//           var keys = response['keys'];
//           for (var i = 0; i < keys.length; i++) {
//             // Convert each key to PEM
//             var key_id = keys[i].kid;
//             var modulus = keys[i].n;
//             var exponent = keys[i].e;
//             var key_type = keys[i].kty;
//             var jwk = { kty: key_type, n: modulus, e: exponent };
//             var pem = jwkToBuffer(jwk);
//             pems[key_id] = pem;
//           }
//           resolve(pems);
//         })
//         .catch((reason) => {
//           reject(reason);
//         });
//     } else {
//       resolve(pems);
//     }
//   });
// }


// export async function http(
//   request: RequestInfo
// ): Promise<any> {
//   const response = await fetch(request);
//   const body = await response.json();
//   return body;
// }

// // example consuming code
// const data = await http(
//   "https://jsonplaceholder.typicode.com/todos"
// );
