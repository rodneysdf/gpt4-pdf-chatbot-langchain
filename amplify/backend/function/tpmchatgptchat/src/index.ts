import 'source-map-support/register'
import { chat } from './chat'
import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './common/interfaces'
import { auth, tokenPayload } from './common/auth'
import { loadUser } from './common/user'
import { loadCredentials } from './common/credentials'
import { Context } from 'aws-lambda'
import { Writable } from 'stream'

// console.log('env', process.env)

// Lambda entry point
// @ts-expect-error
exports.handler = awslambda.streamifyResponse(
  async (event: LambdaFunctionURLEvent, responseStream: Writable, context: Context) => {
    if (!(event?.requestContext?.http?.method === 'POST')) {
      console.log('Handler got event:', event)
      return streamError(responseStream, {
        statusCode: 405,
        body: JSON.stringify({
          error: 'Method not allowed'
        })
      })
    }
    // const { question, history, model, algo, openAiKey, anthropicKey } = event.body;
    // console.log(question)
    // console.log(history)
    // console.log(model)
    // console.log(algo)
    // console.log(openAiKey)
    // console.log(anthropicKey)

    let err = await auth(event)
    if (err?.statusCode !== 200) {
      return streamError(responseStream, err)
    }

    err = await loadUser(tokenPayload.sub)
    if (err?.statusCode !== 200) {
      return streamError(responseStream, err)
    }

    const { error, credentials } = await loadCredentials()
    if (error?.statusCode !== 200) {
      return streamError(responseStream, error)
    }

    // Set headers before starting the chain
    const httpResponseMetadata = {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    }
    // @ts-expect-error
    responseStream = awslambda.HttpResponseStream.from(responseStream, httpResponseMetadata)

    console.log(event?.requestContext?.http?.path)
    // route the request
    if (event?.requestContext?.http?.path === '/api/chat') {
      err = await chat(event, credentials, responseStream)
    } else {
      err.statusCode = 400
      err.body = JSON.stringify({
        error: 'unknown request'
      })
    }
    // overwrite the previous statusCode and error
    if (err.statusCode !== 200) {
      return streamError(responseStream, error)
    }
    responseStream.end()
  })

async function sleep(millis: number): Promise<void> {
  const promise = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, millis)
  })
  return await promise
}

function streamError(responseStream: Writable, err: LambdaFunctionURLResponse): void {
  const httpResponseMetadata = {
    statusCode: err.statusCode,
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'close'
    }
  }
  // @ts-expect-error
  responseStream = awslambda.HttpResponseStream.from(responseStream, httpResponseMetadata)
  responseStream.write(err.body)
  responseStream.end()
}
