import axios from 'axios';
import { AWS_API_URL } from '../config/aws-amplify';

const axiosInstance = axios.create({
  baseURL: AWS_API_URL,
});
axiosInstance.defaults.headers.common['Accept'] = "application/json";

const authedApiCall = async (
  options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      url: string;
      body?: any;
      headers?: any;
  }, auth: any
) => {
  const reqHeaders = options.headers? options.headers : {};

  if (auth) {
    const accessToken = await auth.getAccessToken();
    if (accessToken) {
      reqHeaders.authorization =  "Bearer " + accessToken;
    }
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

export const postUploadFiles = async(files: File[], auth: any) => {
  const formData = new FormData();
  files.forEach(file=>{
    formData.append("arrayOfFilesName", file);
  });

  return authedApiCall({
    method: 'POST',
    url: '/api/upload',
    headers: {
      "Content-Type": "multipart/form-data"
    },
    body: formData,
  }, auth);

}

export const postSendUrl = async(url: string, auth: any) => authedApiCall({
  method: 'POST',
  url: '/api/add',
  body: {
    url
  }
}, auth);

export const postPurgeDocuments = async(auth: any) => authedApiCall({
  method: 'POST',
  url: '/api/purge',
}, auth);

export const getCollection = async(auth: any) => authedApiCall({
  method: 'GET',
  url: '/api/collection',
}, auth);
