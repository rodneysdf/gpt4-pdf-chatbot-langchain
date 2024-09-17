import 'source-map-support/register'

import { collection, purge } from './collection'
import { add, upload } from './ingest'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './common/interfaces'
import { auth, tokenPayload } from './common/auth'
import { loadUser } from './common/user'
import { loadCredentials } from './common/credentials'

console.log('env', process.env)

// Lambda entry point
export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResponse> => {
  if (!(event?.requestContext?.http?.method === 'POST' || event?.requestContext?.http?.method === 'GET')) {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: 'Method not allowed'
      })
    }
  }

  let err = await auth(event)
  if (err?.statusCode !== 200) {
    return err
  }

  err = await loadUser(tokenPayload.sub)
  if (err?.statusCode !== 200) {
    return err
  }

  const { error, credentials } = await loadCredentials()
  if (error?.statusCode !== 200) {
    return error
  }

  console.log(event?.requestContext?.http?.path)
  // route the request
  switch (event?.requestContext?.http?.path) {
    case '/api/upload':
      return await upload(event, credentials)
    case '/api/add':
      return await add(event, credentials)
    case '/api/purge':
      return await purge(event, credentials)
    case '/api/collection':
      return await collection(event, credentials)
  }

  // if it gets to here it is an error return
  return {
    statusCode: 400,
    body: JSON.stringify({
      error: 'unknown request'
    })
  }
}
