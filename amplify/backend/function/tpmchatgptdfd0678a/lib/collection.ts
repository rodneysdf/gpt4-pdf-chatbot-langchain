import { APIGatewayProxyResult } from 'aws-lambda';
import { Convert, LambdaFunctionURLEvent } from "./datamodels";

export const upload = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}

export const add = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}

export const purge = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}

export const collection = async (event: LambdaFunctionURLEvent): Promise<APIGatewayProxyResult> => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      "size": 15,
      "max": 100
    })
  }
}
