/**
 * The environment the hub runs with on the laptop: the DynamoDB Local
 * container from compose.yml and the throwaway credentials it ignores
 * (decision 0009, rule 1). serverless.ts hands these to the function and
 * create-table.ts creates the table they name, so the two cannot disagree.
 */
export const environment = {
  HEAT_TABLE: "heat-local",
  DYNAMODB_ENDPOINT: "http://localhost:8000",
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
} as const;
