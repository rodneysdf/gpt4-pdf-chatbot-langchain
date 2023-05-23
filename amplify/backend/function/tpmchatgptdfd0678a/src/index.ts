import { CognitoJwtVerifier } from 'aws-jwt-verify'
import 'source-map-support/register'
import awsmobile from './aws-exports'
import { chat } from './chat'
import { collection, purge } from './collection'
import { Convert, Credentials, LambdaFunctionURLEvent } from './datamodels'
import { add, upload } from './ingest'
import { LambdaFunctionURLResponse } from './interfaces'
import { getParameter } from './util/parameterStore'
import { isLambdaMock } from './runtype'

// Disable auth when running as an amplify mock
const performAuth: boolean = !isLambdaMock

console.log(`isLambdaMock=${isLambdaMock}, performAuth=${performAuth}`)

// auth - must be done outside of lambda handler for cache to be effective
const region: string = process.env.REGION || ''
const authNameRaw: string = process.env.AUTHNAME || ''
const authName: string = authNameRaw.toUpperCase()
const userPoolId: string = process.env[`AUTH_${authName}_USERPOOLID`] || ''
const iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId
// Create the verifier outside the Lambda handler (= during cold start),
// so the cache can be reused for subsequent invocations. Then, only during the
// first invocation, will the verifier actually need to fetch the JWKS.
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: 'access',
  clientId: awsmobile.aws_user_pools_web_client_id,
  scope: ['openid', 'profile']
})

// Lambda entry point
export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
  if (!(event.requestContext.http.method === 'POST' || event.requestContext.http.method === 'GET')) {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: 'Method not allowed'
      })
    }
  }

  if (performAuth) {
    // Authenticate
    if (!event.headers || !event.headers.authorization || !event.headers.authorization.startsWith('Bearer ')) {
      console.log('no auth header')
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized - no token' })
      }
    }
    const accessToken = event.headers.authorization.substring(7)
    // console.log("auth token: ", accessToken)

    let tokenPayload
    try {
      // https://github.com/awslabs/aws-jwt-verify
      // https://repost.aws/knowledge-center/decode-verify-cognito-json-token
      // If the token is not valid, an error is thrown:
      tokenPayload = await jwtVerifier.verify(accessToken)
      console.log('Token is valid:', tokenPayload)
    } catch (error) {
      console.log('error validating authorization:', error)

      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      }
    }
  }

  // load credentials needed to call ChatGPT
  let credentials: Credentials
  try {
    // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
    const credentialsSecret: string = process.env.credentials || ''
    const credentialsJSON: string = await getParameter(credentialsSecret, true) || ''

    credentials = Convert.toCredentials(credentialsJSON)
  } catch (error) {
    console.log('error accessing credentials :', error)

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'could not get configuration'
      })
    }
  }

  // route the request
  switch (event.requestContext.http.path) {
    case '/api/chat':
      return await chat(event, credentials)
      break
    case '/api/upload':
      return await upload(event, credentials)
      break
    case '/api/add':
      return await add(event, credentials)
      break
    case '/api/purge':
      return await purge(event, credentials)
      break
    case '/api/collection':
      return await collection(event, credentials)
      break
  }

  // if it gets to here it is an error return
  return {
    statusCode: 400,
    body: JSON.stringify({
      error: 'unknown request'
    })
  }
}
