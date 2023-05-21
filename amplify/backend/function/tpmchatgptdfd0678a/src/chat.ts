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

    // //create chain
    const chain = makeChain(vectorStore);

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
