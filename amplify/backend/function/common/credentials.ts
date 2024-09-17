import { LambdaFunctionURLResponse } from './interfaces'
import { getParameter } from './parameterStore'
import { Convert, Credentials } from './datamodels'
import { user } from './user'

export interface CredentialsError {
  credentials: Credentials
  error: LambdaFunctionURLResponse
}

let credentialsMemo: Credentials

export async function loadCredentials (): Promise<CredentialsError> {
  if (credentialsMemo !== undefined) {
    return {
      credentials: credentialsMemo,
      error: {
        statusCode: 200,
        body: JSON.stringify({
          message: 'ok'
        })
      }
    }
  }

  let credentials = {} as Credentials
  try {
    // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
    // const credentialsSecret: string = process.env.credentials ?? ''
    const credentialPath: string = process.env.credentialpath ?? ''
    const env: string = process.env.ENV ?? ''
    const credentialName: string = process.env.credentialname ?? ''
    const credentialsJSON: string = await getParameter(`${credentialPath}${env}${credentialName}`, true) ?? ''

    credentials = Convert.toCredentials(credentialsJSON)
  } catch (error) {
    console.log('error accessing credentials :', error)

    return {
      credentials,
      error: {
        statusCode: 400,
        body: JSON.stringify({
          error: 'could not get configuration'
        })
      }
    }
  }

  // overrite default credentials with per-user
  credentials.pinecone.namespace = user.namespace
  credentialsMemo = credentials

  return {
    credentials,
    error: {
      statusCode: 200,
      body: JSON.stringify({
        message: 'ok'
      })
    }
  }
}
