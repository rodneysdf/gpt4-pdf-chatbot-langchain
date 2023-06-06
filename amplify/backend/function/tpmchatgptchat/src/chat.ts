import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './common/interfaces'
import { initPinecone } from './common/pineconeclient'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { makeChain } from './make-chain'
import { ChainValues } from 'langchain/schema'
import { Convert, Credentials, QuestionHistory } from './common/datamodels'
import { env } from 'node:process'
import { Document } from 'langchain/document'
import { DESTINATION_DIR } from './common/runtype'
import { validateOpenAIKey } from './common/validate'
import axios from 'axios'
import { Writable } from 'stream'
import { consoleLogDebug } from './index'

// '/api/chat'
export const chat = async (event: LambdaFunctionURLEvent,
  credentials: Credentials,
  responseStream: Writable): Promise<LambdaFunctionURLResponse> => {
  let questionHistory: QuestionHistory
  try {
    const body = event?.body ?? ''
    if (event?.isBase64Encoded ?? false) {
      questionHistory = Convert.toQuestionHistory(Buffer.from(body, 'base64').toString('utf8'))
    } else {
      questionHistory = Convert.toQuestionHistory(body)
    }
  } catch (error) {
    console.log('error converting to questionHistory :', error)

    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No question in the request'
      })
    }
  }
  if (questionHistory.question.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'No question in the request'
      })
    }
  }
  // personal key overides
  if (questionHistory.openAiKey.length !== 0) {
    credentials.openAiApiKey = questionHistory.openAiKey
    console.log('personal openai key', credentials.openAiApiKey)
    const ret = await validateOpenAIKey(credentials.openAiApiKey)
    if (ret != null) {
      return ret
    }
  }
  if (questionHistory.anthropicKey.length !== 0) {
    credentials.anthropicKey = questionHistory.anthropicKey
    console.log('personal anthropic key', credentials.anthropicKey)
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey

  const modelError = validateModelAndAlgo(questionHistory.model, questionHistory.algo)
  if (modelError.length !== 0) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: modelError
      })
    }
  }

  // util functions
  const sendData = (data: string): void => {
    responseStream.write(`data: ${data}\n\n`)
  }
  const streaming: boolean = true
  // streaming handlers

  //
  // Start of logic

  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = questionHistory.question.trim().replaceAll('\n', ' ')
  console.log('question:', questionHistory)

  try {
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName)

    /* create vectorstore */
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: 'text',
        namespace: credentials.pinecone.namespace
      }
    )

    // create chain
    const chain = makeChain(
      vectorStore,
      questionHistory.documentCount,
      questionHistory.model,
      streaming,
      (token: string) => {
        // console.log('token received', token)
        if (typeof token === 'string') {
          sendData(token)
        } else {
          console.log('error', 'Invalid token:', token)
        }
      })
    console.log('makeChain returned', chain)

    // Ask a question using chat history
    let response = await chain.call({
      question: sanitizedQuestion,
      chat_history: questionHistory.history
    })
    if (response === null) {
      console.log('error', 'GPT API error, not enough tokens left to generate a response.')
      sendData('[OUT_OF_TOKENS]')
      return {
        statusCode: 200,
        body: JSON.stringify('GPT API error, likely out of tokens')
      }
    }
    console.log('chain.call returned', response)

    if (response?.sourceDocuments !== undefined) {
      response = stripPathFromSourceDocuments(response)
    }
    console.log('Full response:', response)
    // console.log('response lenSourceDoc=', response.sourceDocuments.length, 'len respText=', response.text.length)
    // console.log('info', '\n===\nResponse: \n', response.text, '\n===\nSource Documents:', response.sourceDocuments, '\n===\n')

    sendData(JSON.stringify({ sourceDocs: response.sourceDocuments }))
    sendData('[DONE]')

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    }
  } catch (error) {
    console.log('caught error', error)
    if (axios.isAxiosError(error)) {
      consoleLogDebug('is Axios: ', error.response?.data?.error?.code, error.response?.data?.error?.message)
      consoleLogDebug('is Axios: status', error?.response?.status)

      // oversize is:
    //   "error": {
    //     "message": "This model's maximum context length is 4097 tokens. However, your messages resulted in 12617 tokens. Please reduce the length of the messages.",
    //     "type": "invalid_request_error",
    //     "param": "messages",
    //     "code": "context_length_exceeded"
    // }
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `${error.response?.data?.error?.code} - ${error.response?.data?.error?.message}`
        })
      }
    }

    console.log('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error
      })
    }
  }
}

// make the output sleeker for the user by cleaning up the unnecessary '/tmp/' in the source reference.
function stripPathFromSourceDocuments(response: ChainValues): ChainValues {
  if (response?.sourceDocuments !== undefined) {
    for (const doc of response?.sourceDocuments) {
      const srcDoc = doc as Document
      if (srcDoc.metadata.source.startsWith(DESTINATION_DIR) === true) {
        srcDoc.metadata.source = srcDoc.metadata.source.slice(DESTINATION_DIR.length + 1)
      }
    }
  }
  return response
}

function validateModelAndAlgo(model: string, algo: string): string {
  // Allowed models for lc-ConversationalRetrievalChain
  const allowedValuesConversationalRetrievalChain: string[] = [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-4',
    'gpt-4-0314',
    'anthropic'
  ]

  // Allowed models for ConversationalRetrievalQAChain-lc
  const allowedValuesConversationalRetrievalQAChain: string[] = [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-4',
    'gpt-4-0314',
    'anthropic'
  ]

  let allowList: string[] = []
  let algoName: string = ''
  switch (algo) {
    case 'ConversationalRetrievalChain-lc': {
      allowList = allowedValuesConversationalRetrievalChain
      algoName = 'ConversationalRetrievalChain'
      break
    }
    case 'ConversationalRetrievalQAChain-lc': {
      allowList = allowedValuesConversationalRetrievalQAChain
      algoName = 'ConversationalRetrievalQAChain'
      break
    }
    default: {
      return 'Algorithm not recognized'
    }
  }

  // Check if model is in the per-algo allowed values
  if (allowList.includes(model)) {
    return ''
  }

  // return a user-readable error
  return `'${model}' model not allowed with '${algoName}'`
}
