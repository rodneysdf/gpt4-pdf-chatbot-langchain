import { AmplifyDDBResourceTemplate, AmplifyProjectInfo } from '@aws-amplify/cli-extensibility-helper';

export function override(resources: AmplifyDDBResourceTemplate, amplifyProjectInfo: AmplifyProjectInfo) {
  if (resources?.dynamoDBTable?.provisionedThroughput != null) {
    delete(resources.dynamoDBTable.provisionedThroughput)
    resources.dynamoDBTable.billingMode = "PAY_PER_REQUEST"
  }

  if (resources?.dynamoDBTable?.streamSpecification != null) {
    delete( resources.dynamoDBTable.streamSpecification)
  }
}
