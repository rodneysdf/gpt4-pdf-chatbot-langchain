import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const child_process = require("node:child_process");
const path = require("node:path");

/**
 * @param data { { amplify: { environment: { envName: string, projectPath: string, defaultEditor: string }, command: string, subCommand: string, argv: string[] } } }
 * @param error { { message: string, stack: string } }
 */
export const BuildUIEnv = async (hook, data, error) => {
  const child_process = require("node:child_process");
  const fs = require("fs");

  // get current amplify env
  var amplify_env_file = path.join(data.amplify.environment.projectPath, "amplify", ".config", "local-env-info.json")
  const current = JSON.parse(fs.readFileSync(amplify_env_file, { encoding: "utf8" }));

  // console.log(hook, data.amplify.environment, data.amplify.command, data.amplify.subcommand )
  console.log(`Generating AWS & Amplify '${current.envName}' config into config/aws-amplify.ts`)

  var amplify_settings_file = path.join(data.amplify.environment.projectPath, "amplify", "team-provider-info.json")

  // read info
  const teamProvider = JSON.parse(fs.readFileSync(amplify_settings_file, { encoding: "utf8" }));
  // console.log( "json", obj[current.envName].categories.function.tpmchatgptdfd0678a)

  // get sub stack
  const subStack = getCloudFormationNestedStack(teamProvider[current.envName].awscloudformation.StackName,
    "function" + Object.keys(teamProvider[current.envName].categories.function)[0])

  let subStackStr = subStack.toString('utf8').trim()
  var regex = new RegExp('^arn:aws:cloudformation:' + teamProvider[current.envName].awscloudformation.Region + ':\\d+:stack\/(.+)\/.+', 'g')
  let  subStackShort = subStackStr.replace(regex, '$1');
  // get FnUrl
  const fnUrlEntry = getCloudFormationOutputValue(subStackShort,  "tpmchatLambdaFuncUrl");
  const fnUrlSlash = fnUrlEntry.toString('utf8').trim()     // remove ending lf
  const fnUrl = fnUrlSlash.replace(/\/$/, '');    // remove trailing slash


  // write vars to config/aws-amplify.js
  // from https://github.com/aws-amplify/amplify-cli/issues/3643
  let configContents =
`
/**
 * Settings from Amplify hosted infrastructure
 */

const AWS_API_URL = "${fnUrl}";

type AmplifyEnv = "dev" | "prod";
const AMPLIFY_ENV: AmplifyEnv = "${current.envName}";

export { AWS_API_URL, AMPLIFY_ENV };
`
  fs.writeFileSync(path.join(data.amplify.environment.projectPath,"config", "aws-amplify.ts"), configContents);

  //
  // Update the Lambda Function Env parameters
  let jsonFile = require("../backend/function/tpmchatgptdfd0678a/tpmchatgptdfd0678a-cloudformation-template.json")
  // edit it
  // jsonFile.Resources.LambdaFunction.Properties.Environment.Variables["USERPOOL_ID"] = process.env.AMPLIFY_USERPOOL_ID
  jsonFile.Resources.LambdaFunction.Properties.Environment.Variables["AUTHNAME"] = Object.getOwnPropertyNames(teamProvider[current.envName].categories.auth)[0]
  // write it back
  fs.writeFileSync("./amplify/backend/function/tpmchatgptdfd0678a/tpmchatgptdfd0678a-cloudformation-template.json", JSON.stringify(jsonFile, null, 2))
};

// CloudFormation queries
const getCloudFormationOutputValue = (stack, key) => {
  const command = `
    aws cloudformation describe-stacks \
        --stack-name '${stack}' \
        --no-paginate \
        --no-cli-pager \
        --output text \
        --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue"
    `;
  return child_process.execSync(command);
};

const getCloudFormationNestedStack = (stack, key) => {
  const command = `
    aws cloudformation describe-stack-resources \
        --stack-name ${stack} \
        --no-paginate \
        --no-cli-pager \
        --output text \
        --query "StackResources[?LogicalResourceId=='${key}'].PhysicalResourceId"
    `;
  return child_process.execSync(command);
};
