import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const child_process = require("node:child_process");
const path = require("node:path");

/**
 * @param data { { amplify: { environment: { envName: string, projectPath: string, defaultEditor: string }, command: string, subCommand: string, argv: string[] } } }
 * @param error { { message: string, stack: string } }
 */
export const BuildUIEnv = async (hook, data, error) => {
  // console.log(hook, data.amplify.environment, data.amplify.command, data.amplify.subcommand )
  console.log("Generating config from AWS")
  const child_process = require("node:child_process");
  // const path = require("node:path");

  var amplify_settings_file = path.join(data.amplify.environment.projectPath, "amplify", "team-provider-info.json")

  // read info
  const fs = require("fs");
  const obj = JSON.parse(fs.readFileSync(amplify_settings_file, { encoding: "utf8" }));
  // console.log( "json", obj[data.amplify.environment.envName].categories.function.tpmchatgptdfd0678a)

  // get sub stack
  const subStack = getCloudFormationNestedStack(obj[data.amplify.environment.envName].awscloudformation.StackName,
    "function" + Object.keys(obj[data.amplify.environment.envName].categories.function)[0])

    let subStackStr = subStack.toString('utf8').trim()
  var regex = new RegExp('^arn:aws:cloudformation:' + obj[data.amplify.environment.envName].awscloudformation.Region + ':\\d+:stack\/(.+)\/.+', 'g')
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

export { AWS_API_URL };
`
  fs.writeFileSync(path.join(data.amplify.environment.projectPath,"config", "aws-amplify.ts"), configContents);
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
