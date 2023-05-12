import { APIGatewayProxyResult } from 'aws-lambda';
import 'source-map-support/register';
import { LambdaFunctionURLEvent } from "./lambdafunctionurlevent";
import { Convert, QuestionHistory } from "./questionhistory";
import { initPinecone } from './util/pineconeclient';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { makeChain } from './util/make-chain';


export const handler = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  if (event.requestContext.http.method !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({
        "error": "Method not allowed"
      })
    }
  }

  let questionHistory: QuestionHistory
  try {
    let inputBody: string;
    console.log("event.body:", event.body)
    if (event.isBase64Encoded) {
      questionHistory = Convert.toQuestionHistory(atob(event.body));
    } else {
      questionHistory = Convert.toQuestionHistory(event.body);
    }
    console.log("questionHistory:", questionHistory);
  } catch (error) {
    console.log("cauth error converting to questionHistory :", error);

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

  if (event.requestContext.http.path === '/api/chat') {
    // env var's
    const OPENAI_API_KEY = ""
    const PineconeNamespace = "pdf-test"
    const PineconeEnvironment = "asia-southeast1-gcp-free"
    const PineconeIndexName = "tpm"
    const PineconeApiKey = ""

    // Start of logic
    console.log('question', questionHistory.question);
    console.log('history', questionHistory.history);

    // OpenAI recommends replacing newlines with spaces for best results
    const sanitizedQuestion = questionHistory.question.trim().replaceAll('\n', ' ');

    try {
      const pinecone = await initPinecone(PineconeEnvironment, PineconeApiKey)
      const index = pinecone.Index(PineconeIndexName);

      /* create vectorstore*/
      const vectorStore = await PineconeStore.fromExistingIndex(
        new OpenAIEmbeddings({
          openAIApiKey: OPENAI_API_KEY,
        }),
        {
          pineconeIndex: index,
          textKey: 'text',
          namespace: PineconeNamespace, //namespace comes from your config folder
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

  // if it gets to here it is an error return
  return {
    statusCode: 400,
    body: JSON.stringify({
      "error": "unknown request"
    })
  }
}
