import { GraphQLClient } from "graphql-request";

const INTUITION_MAINNET_URL =
  process.env.INTUITION_API_URL ||
  "https://mainnet.intuition.sh/v1/graphql";

export const graphqlClient = new GraphQLClient(INTUITION_MAINNET_URL, {
  headers: {
    "Content-Type": "application/json",
  },
});

export { gql } from "graphql-request";