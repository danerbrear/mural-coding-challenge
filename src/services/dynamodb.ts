import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});

const tableNames = {
  products: process.env.PRODUCTS_TABLE ?? "mural-marketplace-products",
  carts: process.env.CARTS_TABLE ?? "mural-marketplace-carts",
  orders: process.env.ORDERS_TABLE ?? "mural-marketplace-orders",
  payments: process.env.PAYMENTS_TABLE ?? "mural-marketplace-payments",
  withdrawals: process.env.WITHDRAWALS_TABLE ?? "mural-marketplace-withdrawals",
  idempotency: process.env.IDEMPOTENCY_TABLE ?? "mural-marketplace-idempotency",
} as const;

export class InvalidNextTokenError extends Error {
  constructor(message = "Invalid nextToken") {
    super(message);
    this.name = "InvalidNextTokenError";
    Object.setPrototypeOf(this, InvalidNextTokenError.prototype);
  }
}

function decodeExclusiveStartKey(token: string | undefined): Record<string, AttributeValue> | undefined {
  if (!token) return undefined;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, AttributeValue>;
  } catch {
    throw new InvalidNextTokenError();
  }
}

export async function getItem<T extends object>(
  table: keyof typeof tableNames,
  key: Record<string, unknown>
): Promise<T | null> {
  const result = await client.send(
    new GetItemCommand({
      TableName: tableNames[table],
      Key: marshall(key, { removeUndefinedValues: true }),
    })
  );
  if (!result.Item) return null;
  return unmarshall(result.Item) as T;
}

export async function putItem<T extends object>(
  table: keyof typeof tableNames,
  item: T
): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: tableNames[table],
      Item: marshall(item as Record<string, unknown>, { removeUndefinedValues: true }),
    })
  );
}

export async function updateItem(
  table: keyof typeof tableNames,
  key: Record<string, unknown>,
  updates: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const setParts: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, AttributeValue> = {};
  for (const [k, v] of Object.entries(updates)) {
    const name = "#" + k.replace(/[^a-zA-Z0-9]/g, "_");
    const valKey = ":v_" + k.replace(/[^a-zA-Z0-9]/g, "_");
    names[name] = k;
    values[valKey] = marshall({ _: v })._ as AttributeValue;
    setParts.push(`${name} = ${valKey}`);
  }
  const result = await client.send(
    new UpdateItemCommand({
      TableName: tableNames[table],
      Key: marshall(key, { removeUndefinedValues: true }),
      UpdateExpression: "SET " + setParts.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );
  return (result.Attributes ? unmarshall(result.Attributes) : {}) as Record<string, unknown>;
}

export async function query<T extends object>(
  table: keyof typeof tableNames,
  keyCondition: string,
  exprAttrNames: Record<string, string>,
  exprAttrValues: Record<string, unknown>,
  options?: { limit?: number; nextToken?: string; indexName?: string }
): Promise<{ items: T[]; nextToken?: string }> {
  const exclusiveStartKey = decodeExclusiveStartKey(options?.nextToken);
  const result = await client.send(
    new QueryCommand({
      TableName: tableNames[table],
      KeyConditionExpression: keyCondition,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: marshall(exprAttrValues, { removeUndefinedValues: true }),
      Limit: options?.limit ?? 20,
      ExclusiveStartKey: exclusiveStartKey,
      IndexName: options?.indexName,
    })
  );
  const items = (result.Items ?? []).map((i) => unmarshall(i) as T);
  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
    : undefined;
  return { items, nextToken };
}

export async function scan<T extends object>(
  table: keyof typeof tableNames,
  options?: { limit?: number; nextToken?: string }
): Promise<{ items: T[]; nextToken?: string }> {
  const exclusiveStartKey = decodeExclusiveStartKey(options?.nextToken);
  const result = await client.send(
    new ScanCommand({
      TableName: tableNames[table],
      Limit: options?.limit ?? 20,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );
  const items = (result.Items ?? []).map((i) => unmarshall(i) as T);
  const nextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
    : undefined;
  return { items, nextToken };
}

export function getIdempotencyKey(deliveryId: string, eventId: string): string {
  return `webhook:${deliveryId}:${eventId}`;
}

export async function claimIdempotency(
  key: string,
  ttlSeconds = 86400
): Promise<boolean> {
  try {
    await client.send(
      new PutItemCommand({
        TableName: tableNames.idempotency,
        Item: marshall({
          key,
          ttl: Math.floor(Date.now() / 1000) + ttlSeconds,
        }),
        ConditionExpression: "attribute_not_exists(#k)",
        ExpressionAttributeNames: { "#k": "key" },
      })
    );
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "ConditionalCheckFailedException") {
      return false;
    }
    throw e;
  }
}

export { tableNames };
