import { LambdaFunctionURLEvent, LambdaFunctionURLResponse } from './interfaces'
import { initPinecone } from './util/pineconeclient'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import { OpenAIEmbeddings } from 'langchain/embeddings/openai'
import { makeChain } from './util/make-chain'
import { ChainValues } from 'langchain/schema'
import { Convert, Credentials, QuestionHistory } from './datamodels'
import { env } from 'node:process'
import { Document } from 'langchain/document'
import { DESTINATION_DIR } from './ingest'
import { validateOpenAIKey } from './index'

// '/api/chat'
export const chat = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
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

  //
  // Start of logic
  console.log('question', questionHistory)

  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = questionHistory.question.trim().replaceAll('\n', ' ')

  try {
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName)

    /* create vectorstore */
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: 'text',
        namespace: credentials.pinecone.namespace // namespace comes from your config folder
      }
    )

    const modelError = validateModelAndAlgo(questionHistory.model, questionHistory.algo)
    if (modelError.length !== 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: modelError
        })
      }
    }

    // create chain
    const chain = makeChain(vectorStore, questionHistory.model)

    // Ask a question using chat history
    let response = await chain.call({
      question: sanitizedQuestion,
      chat_history: questionHistory.history
    })

    if (response?.sourceDocuments !== undefined) {
      response = stripPathFromSourceDocuments(response)
    }
    console.log(response)

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    }
  } catch (error) {
    console.log('error', error)
    // todo put in the type of error and fix 'error.message' below
    console.log(typeof error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'error.message'
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

  // Allowed models for lc-ConversationalRetrievalQAChain
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
    case 'lc-ConversationalRetrievalChain': {
      allowList = allowedValuesConversationalRetrievalChain
      algoName = 'ConversationalRetrievalChain'
      break
    }
    case 'lc-ConversationalRetrievalQAChain': {
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
