import { APIGatewayProxyResult } from 'aws-lambda';
import { initPinecone } from './util/pineconeclient';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { makeChain } from './util/make-chain';
import { getParameter } from './util/parameterStore';
import { Convert, Credentials, LambdaFunctionURLEvent, QuestionHistory } from "./datamodels";
import { env } from 'node:process';

// '/api/chat'
export const chat = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
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

  // load credentials needed to call ChatGPT
  let credentials: Credentials
  try {
    // see https://docs.amplify.aws/cli/function/secrets/#configuring-secret-values
    const credentialsSecret: string = process.env["credentials"] || ""
    const credentialsJSON: string = await getParameter(credentialsSecret, true) || "";
    credentials = Convert.toCredentials(credentialsJSON);
  } catch (error) {
    console.log("error accessing credentials :", error);

    return {
      statusCode: 400,
      body: JSON.stringify({
        "error": "could not get configuration"
      })
    }
  }
  // write OPENAI_API_KEY env var to the process because:
  // OPENAI_API_KEY is required to be an ENV var by current code dependency
  env.OPENAI_API_KEY = credentials.openAiApiKey;

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
