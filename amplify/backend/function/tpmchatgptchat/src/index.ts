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
        'Cache-Control': 'no-cache, no-transform'
      }
    }
    // @ts-expect-error
    responseStream = awslambda.HttpResponseStream.from(responseStream, httpResponseMetadata)

    console.log(event?.requestContext?.http?.path)
    // route the request
    if (event?.requestContext?.http?.path === '/api/chat') {
      err = await chat(event, credentials, responseStream)
      if (err.statusCode !== 200) {
        consoleLogDebug('chat returned err', err)
        streamErrorMsg(responseStream, err)
        await new Promise(f => setTimeout(f, 3000))
        console.log('after sleep')
        responseStream.end()
        return
      }
    } else {
      streamErrorMsg(responseStream, {
        statusCode: 400,
        body: JSON.stringify({
          error: 'unknown request query'
        })
      })
      await new Promise(f => setTimeout(f, 3000))
      console.log('after sleep')
      responseStream.end()
      return
    }
    responseStream.end()
  })

// Note this can only be called before HttpResponseStream.from is called
function streamError(responseStream: Writable, err: LambdaFunctionURLResponse): void {
  console.log('ending with error:', err)
  console.log('ending with error:', err.body)
  if (err instanceof Error) {
    console.log('name-message:', `${err.name} - ${err.message}`)
  }
  console.log('ending with err.statusCode:', err.statusCode)

  const httpResponseMetadata = {
    statusCode: err.statusCode,
    headers: {
      'x-error-reason': err.body,
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream'
    }
  }
  // @ts-expect-error
  responseStream = awslambda.HttpResponseStream.from(responseStream, httpResponseMetadata)
  responseStream.write(`data: [ERROR] ${err.body as string}\n\n`)
  responseStream.end()
}

function streamErrorMsg(responseStream: Writable, err: LambdaFunctionURLResponse): void {
  console.log('streamErrorMsg with error:', err)
  console.log('streamErrorMsg with error:', err.body)
  const msg = JSON.parse(err?.body ?? '')
  console.log('streamErrorMsg writing msg:', `[ERROR] ${msg.error as string}`)

  responseStream.write(`data: [ERROR] ${msg.error as string}\n\n`)
  // must wait for client to get the message
}

const logLevelDebug: boolean = true
export function consoleLogDebug(...args: any[]): void {
  if (logLevelDebug) {
    const message = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
      .join(' ')

    console.log(message)
  }
}
