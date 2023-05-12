# TPM implementation

UI is hosted in AWS using Amplify

Processing is done by a Lambda Function URL (avoiding API Gateway's 30 second limit)

## In Progress

- Add Cognito login to Lambda and UI via Amplify. Authorize in the Lambda TypeScript code.

## To Do

- Add an Import PDF button and make the ingestion process available on the website and in the Lambda
- Add Google Drive support
  - customize a driver that better understands TPM specs
- Update dependencies - currently Embedding relies on an environment variable instead of a passed-in parameter.
- Move credentials to SSM Parameter Store or DynamoDB, per-user
- Support multiple users in the UI and db
- Make model and database index selectable
- Make the Lambda do response streaming (using '[lambda-stream](https://github.com/astuyve/lambda-stream)') like ChatGPT does
- Get a DNS name from the IT request portal

## Architecture

The UI makes a call to a single server function `'/api/chat'` in `pages/index.tsx`.

## Requirements

## Implementation notes

Typescript objects were created using [quicktype](https://quicktype.io/typescript)

## Research
evaluate a Cognito token in a Lambda - https://github.com/aws-samples/aws-lambda-function-url-security
https://github.com/aws-samples/amazon-cognito-vue-workshop
Awesome Chat prompts - https://prompts.chat/
[You are using ChatGPT wrong](https://artificialcorner.com/youre-using-chatgpt-wrong-here-s-how-to-be-ahead-of-99-of-chatgpt-users-886a50dabc54)
[Host in Amplify](https://aws.amazon.com/getting-started/hands-on/build-react-app-amplify-graphql/)
OpenAI docs - https://platform.openai.com/docs/api-reference/chat
https://github.com/aws-samples/aws-lambda-function-url-security contains a streaming Lambda that calls Cognito

How to pull unmerged PR's to a parent repo into your fork:
https://stackoverflow.com/questions/6022302/how-to-apply-unmerged-upstream-pull-requests-from-other-forks-into-my-fork

OpenAI docs - https://platform.openai.com/docs/api-reference/chat
OpenAI Go - https://altafino.com/blog/how-to-use-the-openai-chat-api-in-golang/
Thied party OpenAI Go - https://github.com/sashabaranov/go-openai