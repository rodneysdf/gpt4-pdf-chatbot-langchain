import { getUser, User } from './storage'
import { LambdaFunctionURLResponse } from './interfaces'

export let user: User

export async function loadUser (sub: string): Promise<LambdaFunctionURLResponse> {
  // get user data
  user = await getUser(sub)
  console.log(`user: ${user.sub}, namespace=${user.namespace}`)
  if (user.sub === '' || user.namespace === '') {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'unknown user' })
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'ok' })
  }
}
