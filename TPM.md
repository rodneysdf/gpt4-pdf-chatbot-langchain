# TPM implementation

UI is hosted in AWS using Amplify
Processing is done by a Lambda Function URL (avoiding API Gateway's 30 second limit)
Credentials for the lambda are in SSM Parameter Store

## Develop locally

To develop locally and have Google signin redirect back to your local app, redirects are diffents. These are detected base on if you are running on localhost.

### Run the lambda locally
`amplify mock function tpmchatgptdfd0678a -v --event 'src/test/event-multi.json'  --timeout 120`
## Build like `amplify publish`.
`npm run build`
## Quickly build the lamda
`tsc -p tsconfig` in dir ./amplify/backend/function/tpmchatgptdfd0678a/src

# Publishing
- `amplify push` - push just the backend

- `amplify push function` -push just the functions
- `amplify publish` - push both the backend and frontend (React U to amplify hosting)
- `amplify env checkout <env>`  - switch between dev and prod. <env> is 'dev' or 'prod'


## In Progress

- Add Cognito login to Lambda and UI via Amplify. Authorize in the Lambda TypeScript code.

## To Do

- Add an Import PDF button and make the ingestion process available on the website and in the Lambda
- Add Google Drive support
  - customize a driver that better understands TPM specs
- Update dependencies - currently Embedding relies on an environment variable instead of a passed-in parameter.
- Make credentials per-user - maybe in DynamoDB.
- Support multiple users in the UI and db
- Make model and database index selectable
- Make the Lambda do response streaming (using '[lambda-stream](https://github.com/astuyve/lambda-stream)') like ChatGPT does
- Get a DNS name from the IT request portal

## Architecture

The UI makes a call to a single server function `'/api/chat'` in `pages/index.tsx`.

## Showing Errors
Errors in the Collection functions (Add, Upload, Purge) show in an alert at the top of page. Chat question errors show below and around the question entry box, adhering to the design guideline to [keep error messages next to the fields](https://www.nngroup.com/articles/errors-forms-design-guidelines/#:~:text=3.%20Keep%20Error%20Messages%20Next%20to%20Fields)

- **User submits GDoc url but p2team@sys-27331190000236300992246821.iam.gserviceaccount.com or p2-spec-access@devfactory.com don't have access to it** - alert error message gets displayed on screen for Permission Denied with instructions to share it.
- **Document not found** - Google Doc url not found. Alert error message shown.
- **File not found** - Upload a file url but file not found. Alert error message shown.
- **Incorrect OpenAI API key** - when uploading file or url an alert error message is shown.
- **Not logged in** - All functions don't work when not logged in and show an error.


## Implementation notes

Typescript objects are created in each build using [quicktype](https://quicktype.io/typescript)
  `quicktype data/ -o datamodels.ts`

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