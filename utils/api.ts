import axios from 'axios';
import { AWS_API_URL } from '../config/aws-amplify';
import { TTLCache } from '@brokerloop/ttlcache';

const axiosInstance = axios.create({
  baseURL: AWS_API_URL,
});
axiosInstance.defaults.headers.common['Accept'] = "application/json";

// 10 minute cache
export const cache = new TTLCache<string, number>({
  ttl: 10 * 60 * 1000,
  max: Infinity,
  clock: Date
});


const authedApiCall = async (
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    body?: any;
    headers?: any;
  }, auth: any
) => {
  const reqHeaders = options.headers ? options.headers : {};

  if (auth) {
    const accessToken = await auth.getAccessToken();
    if (accessToken) {
      reqHeaders.authorization = "Bearer " + accessToken;
    } else {
      console.log("no accessToken!")
    }
  } else {
    console.log("no auth header!")
  }
  return await axiosInstance.request({
    method: options.method,
    url: options.url,
    data: options.body,
    headers: reqHeaders
  });
}

type PostChatBody = {
  question: string;
  model: string;
  algo: string;
  history: [string, string][];
  openAiKey: string;    // optional
  anthropicKey: string;
};

// const chat = (body: any, auth: any) => makeMutation<PostChatBody>({
//   method: 'POST',
//   url: '/api/chat',
// }, auth);

export const makePostChat = (handlers: {
  onSuccess(response: any, question: string): void;
  onError(response: any): void;
}, auth: any) => {
  return async (body: PostChatBody) => {
    try {
      const chatResponse = await authedApiCall({
        method: 'POST',
        url: '/api/chat',
        body,
      }, auth);

      handlers.onSuccess(chatResponse.data, body.question);
    } catch (err: any) {
      handlers.onError(err);
    }
  };
};

export const postUploadFiles = async (files: File[], openAiKey: string, anthropicKey: string, auth: any) => {
  const formData = new FormData();
  files.forEach(file => {
    formData.append("arrayOfFilesName", file);
  });

  return authedApiCall({
    method: 'POST',
    url: '/api/upload',
    headers: {
      "Content-Type": "multipart/form-data",
      "x-key-openai": openAiKey,
      "x-key-anthropic": anthropicKey
    },
    body: formData,
  }, auth);

}

export const postSendUrl = async (url: string, openAiKey: string, anthropicKey: string, auth: any) => authedApiCall({
  method: 'POST',
  url: '/api/add',
  body: {
    url,
    openAiKey,
    anthropicKey
  }
}, auth);

export const postPurgeDocuments = async (auth: any) => authedApiCall({
  method: 'POST',
  url: '/api/purge',
}, auth);

// This API supports cached values, since the value on changes when adding or uploading
export const getCollection = async (auth: any) => {

  const exists = cache.has('vectorCount')
  let vectorCount: any = 0
  if (exists) {
    // console.log("getCollection responds from cache")
    vectorCount = cache.get('vectorCount')
  } else {
    // console.log("getCollection calls the lambda")
    const response = await authedApiCall({
      method: 'GET',
      url: '/api/collection',
    }, auth);

    if (response) {
      if (response.data?.size || response.data?.size === 0) {
        vectorCount = response.data.size
        cache.set('vectorCount', vectorCount)
      }
    }
  }

  return {
    "data": {
      "size": vectorCount,
      "max": 100
    }
  }
}
