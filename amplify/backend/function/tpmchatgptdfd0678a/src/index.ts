import { CognitoJwtVerifier } from 'aws-jwt-verify';
import 'source-map-support/register';
import awsmobile from "./aws-exports";
import { chat } from './chat';
import { add, collection, purge, upload } from './collection';
import { LambdaFunctionURLEvent } from "./datamodels";
import { LambdaFunctionURLResponse } from "./interfaces";

console.log('INDEX');

// DEVELOPER ONLY
const disableAuth: Boolean = true;

// auth - must be done outside of lambda handler for cache to be effective
const region: string = process.env["REGION"] || ""
const authNameRaw: string = process.env["AUTHNAME"] || ""
const authName: string = authNameRaw.toUpperCase()
const userPoolId: string = process.env[`AUTH_${authName}_USERPOOLID`] || ""
const iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId;
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
export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
  if (!(event.requestContext.http.method === 'POST' || event.requestContext.http.method === 'GET')) {
    return {
      statusCode: 405,
      body: JSON.stringify({
        "error": "Method not allowed"
      })
    }
  }

  if (!disableAuth) {
    // Authenticate
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
      console.log('upload')
      return upload(event);
      break;
    case '/api/add':
      return add(event);
      break;
    case '/api/purge':
      return purge(event);
      break;
    case '/api/collection':
      return collection(event);
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


function sleep(msDuration: number) {
  return new Promise((resolve) => setTimeout(resolve, msDuration));
}