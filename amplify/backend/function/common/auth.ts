import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { isLambdaMock } from './runtype'
import awsmobile from './aws-exports'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './interfaces'

// Disable auth when running as an amplify mock
const performAuth: boolean = !isLambdaMock

console.log('isLambdaMock=', isLambdaMock, 'performAuth=', performAuth)

// auth - must be placed outside of lambda handler for cache to be effective
const authNameRaw: string = process.env.AUTHNAME ?? ''
const authName: string = authNameRaw.toUpperCase()
const userPoolId: string = process.env[`AUTH_${authName}_USERPOOLID`] ?? ''
// const region: string = process.env.REGION ?? ''
// const iss = 'https://cognito-idp.' + region + '.amazonaws.com/' + userPoolId
// Create the verifier outside the Lambda handler (= during cold start),
// so the cache can be reused for subsequent invocations. Then, only during the
// first invocation, will the verifier actually need to fetch the JWKS.
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: 'access',
  clientId: awsmobile.aws_user_pools_web_client_id,
  scope: ['openid', 'profile'],
  graceSeconds: 5
})
export interface TokenInterface {
  sub: string
  iss?: string
  version?: number
  client_id?: string
  origin_jti?: string
  token_use?: string
  scope?: string
  auth_time?: number
  exp?: number
  iat?: number
  jti?: string
  username: string
}

export let tokenPayload: TokenInterface // returned from Cognito

export async function auth (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> {
  if (performAuth) {
    // Authenticate
    if (event?.headers?.authorization == null || !event.headers.authorization.startsWith('Bearer ')) {
      console.log('no auth header')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized - no token' })
      }
    }
    const accessToken = event.headers.authorization.substring(7)
    // console.log("auth token: ", accessToken)

    try {
      // https://github.com/awslabs/aws-jwt-verify
      // https://repost.aws/knowledge-center/decode-verify-cognito-json-token
      // If the token is not valid, an error is thrown:
      tokenPayload = await jwtVerifier.verify(accessToken)
      // console.log(`User: ${tokenPayload.sub}, ${tokenPayload.username}`)
    } catch (error) {
      console.log('error validating authorization:', error)

      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' })
      }
    }
  } else {
    tokenPayload = {
      sub: 'fakeuser',
      username: 'fakeusername'
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'ok' })
  }
}
