import { SSM } from 'aws-sdk'

// Get parameter from Parameter Store
export const getParameter = async (name: string, decrypt: boolean): Promise<string | undefined> => {
  const ssm = new SSM()
  const result = await ssm
    .getParameter({ Name: name, WithDecryption: decrypt })
    .promise()
  return result.Parameter?.Value
}
