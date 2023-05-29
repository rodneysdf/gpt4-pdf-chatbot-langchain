import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

// Get parameter from Parameter Store
export const getParameter = async (name: string, decrypt: boolean): Promise<string | undefined> => {
  const ssm = new SSMClient({ region: 'us-east-1' })

  const params = {
    /** input parameters */
    Name: name,
    WithDecryption: decrypt
  }
  const command = new GetParameterCommand(params)

  const result = await ssm.send(command)
  return result.Parameter?.Value
}
