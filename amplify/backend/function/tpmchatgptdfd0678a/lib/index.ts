import { APIGatewayProxyResult } from 'aws-lambda';
import 'source-map-support/register';
import { initPinecone } from './util/pineconeclient';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { makeChain } from './util/make-chain';
import { getParameter } from './util/parameterStore';
import { Convert, Credentials, LambdaFunctionURLEvent, QuestionHistory } from "./datamodels";
import { env } from 'node:process';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import awsmobile from "./aws-exports";

// auth - must be done outside of lambda handler for cache to be effective
const region: string = process.env["REGION"] || ""
const authNameRaw: string = process.env["AUTHNAME"] || ""
const authName: string = authNameRaw.toUpperCase()
const userPoolId: string = process.env[`AUTH_${authName}_USERPOOLID`] || ""
console.log("userPoolId", userPoolId)
const iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId;
console.log("iss", iss)
console.log("awsmobile.aws_user_pools_web_client_id", awsmobile.aws_user_pools_web_client_id)
// Create the verifier outside the Lambda handler (= during cold start),
// so the cache can be reused for subsequent invocations. Then, only during the
// first invocation, will the verifier actually need to fetch the JWKS.
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "access",
  clientId: awsmobile.aws_user_pools_web_client_id,
  scope: ["openid", "profile"]
});


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
  // console.log("request:", event)

  if (!event.headers || !event.headers.authorization || !event.headers.authorization.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }
  const accessToken = event.headers.authorization.substring(7);
  let payload;
  try {
    // https://github.com/awslabs/aws-jwt-verify
    // https://repost.aws/knowledge-center/decode-verify-cognito-json-token
    // If the token is not valid, an error is thrown:
    payload = await jwtVerifier.verify(accessToken);
    console.log("Token is valid. Payload:", payload);
  } catch {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

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
