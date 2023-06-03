import axios from 'axios'
import { LambdaFunctionURLResponse } from './interfaces'

const axiosInstance = axios.create({
  baseURL: 'https://api.openai.com/v1/models/gpt-3.5-turbo'
})
axiosInstance.defaults.headers.common.Accept = 'application/json'
axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

export const validateOpenAIKey = async (openaiKey: string): Promise<LambdaFunctionURLResponse | null> => {
  if (openaiKey.length > 0) {
    // make a test call to openAI
    try {
      const response = await axiosInstance.request({
        method: 'GET',
        headers: {
          Authorization: `Bearer ${openaiKey}`
        },
        timeout: 4000
      })
      console.log(response)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error?.response?.status === 401) {
          let msg: string = error?.response?.data?.error?.message ?? ''
          if (msg.startsWith('Incorrect')) {
            msg = 'Incorrect OpenAI' + msg.slice(9)
          }

          return {
            statusCode: 406,
            body: JSON.stringify({
              error: msg
            })
          }
        }
      }
      console.log('response', error)
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'OpenAI API key problem'
        })
      }
    }
  }
  return null
}
