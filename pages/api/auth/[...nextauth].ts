import NextAuth from "next-auth"
import CognitoProvider from "next-auth/providers/cognito";
import awsmobile from "../../../config/aws-exports"

export const authOptions = {
  // Configure one or more authentication providers
  providers: [
    CognitoProvider({
      clientId: awsmobile.aws_user_pools_web_client_id,
      clientSecret: "",
      issuer: "https://cognito-idp." + awsmobile.aws_cognito_region + "amazonaws.com/" + awsmobile.aws_user_pools_id
    })
    // ...add more providers here
  ],
}
export default NextAuth(authOptions)
