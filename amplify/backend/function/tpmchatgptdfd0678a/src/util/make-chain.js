"use strict";
exports.__esModule = true;
exports.makeChain = void 0;
var openai_1 = require("langchain/llms/openai");
var chains_1 = require("langchain/chains");
var CONDENSE_PROMPT = "Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.\n\nChat History:\n{chat_history}\nFollow Up Input: {question}\nStandalone question:";
var QA_PROMPT = "You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.\nIf you don't know the answer, just say you don't know. DO NOT try to make up an answer.\nIf the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.\n\n{context}\n\nQuestion: {question}\nHelpful answer in markdown:";
var makeChain = function (vectorstore) {
    var model = new openai_1.OpenAI({
        temperature: 0,
        modelName: 'gpt-3.5-turbo'
    });
    var chain = chains_1.ConversationalRetrievalQAChain.fromLLM(model, vectorstore.asRetriever(), {
        qaTemplate: QA_PROMPT,
        questionGeneratorTemplate: CONDENSE_PROMPT,
        returnSourceDocuments: true
    });
    return chain;
};
exports.makeChain = makeChain;
