import { LambdaFunctionURLResponse } from "./interfaces";
import { initPinecone } from './util/pineconeclient';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { makeChain } from './util/make-chain';
import { Convert, Credentials, LambdaFunctionURLEvent, QuestionHistory } from "./datamodels";

// '/api/chat'
export const chat = async (event: LambdaFunctionURLEvent,
  credentials: Credentials): Promise<LambdaFunctionURLResponse> => {
  let questionHistory: QuestionHistory
  try {
    let inputBody: string;
    if (event.isBase64Encoded) {
      questionHistory = Convert.toQuestionHistory(Buffer.from(event.body, 'base64').toString("utf8"));
    } else {
      questionHistory = Convert.toQuestionHistory(event.body);
    }
  } catch (error) {
    console.log("error converting to questionHistory :", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No question in the request"
      })
    }
  }
  if (!questionHistory.question) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "No question in the request"
      })
    }
  }

  //
  // Start of logic
  console.log('question', questionHistory);

  // OpenAI recommends replacing newlines with spaces for best results
  const sanitizedQuestion = questionHistory.question.trim().replaceAll('\n', ' ');

  try {
    const pinecone = await initPinecone(credentials.pinecone.environment, credentials.pinecone.apiKey)
    const index = pinecone.Index(credentials.pinecone.indexName);

    /* create vectorstore*/
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: 'text',
        namespace: credentials.pinecone.namespace, //namespace comes from your config folder
      },
    );

    const modelError = validateModelAndAlgo(questionHistory.model, questionHistory.algo)
    if (modelError) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          "error": modelError
        })
      }
    }

    // //create chain
    const chain = makeChain(vectorStore, questionHistory.model);

    //Ask a question using chat history
    const response = await chain.call({
      question: sanitizedQuestion,
      chat_history: questionHistory.history || [],
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response)
    }
  } catch (error: any) {
    console.log('error', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        "error": error.message || 'Something went wrong'
      })
    }
  }
}

function validateModelAndAlgo(model: string, algo: string): string {
  // Allowed models for lc-ConversationalRetrievalChain
  const allowedValuesConversationalRetrievalChain: string[] = [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-4',
    'gpt-4-0314',
    'anthropic'
  ];

  // Allowed models for lc-ConversationalRetrievalQAChain
  const allowedValuesConversationalRetrievalQAChain: string[] = [
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-4',
    'gpt-4-0314',
    'anthropic'
  ];


  let allowList: string[] = []
  let algoName: string = ''
  switch (algo) {
    case 'lc-ConversationalRetrievalChain': {
      allowList = allowedValuesConversationalRetrievalChain;
      algoName = 'ConversationalRetrievalChain'
      break;
    }
    case 'lc-ConversationalRetrievalQAChain': {
      allowList = allowedValuesConversationalRetrievalQAChain;
      algoName = 'ConversationalRetrievalQAChain'
      break;
    }
    default: {
      return "Algorithm not recognized"
      break;
    }
  }

  // Check if model is in the per-algo allowed values
  if (allowList.includes(model)) {
    return "";
  }

  // return a user-readable error
  return `'${model}' model not allowed with '${algoName}'`;
}

