import { OpenAI } from 'langchain/llms/openai'
import { PineconeStore } from 'langchain/vectorstores/pinecone'
import { ConversationalRetrievalQAChain } from 'langchain/chains'
import { CallbackManager } from 'langchain/callbacks'

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`

const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

Question: {question}
Helpful answer:`

export const makeChain = (
  vectorstore: PineconeStore,
  documentCount: number,
  modelNameParam: string,
  streaming: boolean,
  onTokenStream?: (token: string) => void
): ConversationalRetrievalQAChain => {
  let extraSpaceRequired: boolean = false // extra space for subsequent LLM starts to separate the sentences
  const model = new OpenAI({
    temperature: 0.1, // increase temepreature to get more creative answers
    modelName: modelNameParam, // change this to gpt-4 if you have access
    streaming,
    callbackManager: (onTokenStream != null)
      ? CallbackManager.fromHandlers({
        async handleLLMStart (llm, prompts, runId, parentRunId, extraParams) {
          // console.log('handleLLMStart', llm, prompts, runId, parentRunId, extraParams)
          // start?
          onTokenStream('[START]')
          if (extraSpaceRequired) {
            const token: string = ' '
            onTokenStream(JSON.stringify({ token }))
          } else {
            extraSpaceRequired = true
          }
        },
        async handleLLMNewToken (token, runId, parentRunId) {
          // console.log('handleLLMNewToken', token, runId, parentRunId)
          onTokenStream(JSON.stringify({ token }))
        }

        // async handleLLMEnd(output, runId, parentRunId) {
        //   console.log('handleLLMEnd', output, runId, parentRunId)
        //   onTokenStream('[LLMEnd]')
        // },
        // async handleChatModelStart(llm, messages, runId, parentRunId, extraParams) {
        //   console.log('handleChatModelStart', llm, messages, runId, parentRunId, extraParams)
        //   onTokenStream('[handleChatModelStart]')
        // },
        // async handleChainStart(chain, inputs, runId, parentRunId) {
        //   console.log('handleChainStart', chain, inputs, runId, parentRunId)
        //   onTokenStream('[handleChainStart]')
        // },
        // async handleChainEnd(outputs, runId, parentRunId) {
        //   console.log('handleChainEnd', outputs, runId, parentRunId)
        //   onTokenStream('[handleChainEnd]')
        // },

      })
      : undefined
  })
  console.log('makeChain new OpenAI completed')

  const chain = ConversationalRetrievalQAChain.fromLLM(
    model,
    vectorstore.asRetriever(documentCount),
    {
      qaTemplate: QA_PROMPT,
      questionGeneratorTemplate: CONDENSE_PROMPT,
      returnSourceDocuments: true // The number of source documents returned is 4 by default
    }
  )
  return chain
}
