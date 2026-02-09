terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# DynamoDB tables
resource "aws_dynamodb_table" "products" {
  name         = "${var.app_name}-products"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "carts" {
  name         = "${var.app_name}-carts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "orders" {
  name         = "${var.app_name}-orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "status-created-index"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "payments" {
  name         = "${var.app_name}-payments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "expectedAmountUsdc"
    type = "N"
  }

  global_secondary_index {
    name            = "orderId-index"
    hash_key        = "orderId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "status-expectedAmount-index"
    hash_key        = "status"
    range_key       = "expectedAmountUsdc"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "withdrawals" {
  name         = "${var.app_name}-withdrawals"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "orderId"
    type = "S"
  }

  global_secondary_index {
    name            = "orderId-index"
    hash_key        = "orderId"
    projection_type = "ALL"
  }
}

# Idempotency table (for webhooks and POST /payments)
resource "aws_dynamodb_table" "idempotency" {
  name         = "${var.app_name}-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  attribute {
    name = "key"
    type = "S"
  }
}

# Lambda execution role
resource "aws_iam_role" "lambda_role" {
  name = "${var.app_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.app_name}-lambda-dynamodb"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.products.arn,
          aws_dynamodb_table.carts.arn,
          aws_dynamodb_table.orders.arn,
          "${aws_dynamodb_table.orders.arn}/index/status-created-index",
          aws_dynamodb_table.payments.arn,
          "${aws_dynamodb_table.payments.arn}/index/orderId-index",
          "${aws_dynamodb_table.payments.arn}/index/status-expectedAmount-index",
          aws_dynamodb_table.withdrawals.arn,
          "${aws_dynamodb_table.withdrawals.arn}/index/orderId-index",
          aws_dynamodb_table.idempotency.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Build Lambda package
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/dist/lambda.zip"
}

resource "aws_lambda_function" "api" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.app_name}-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      PRODUCTS_TABLE    = aws_dynamodb_table.products.name
      CARTS_TABLE       = aws_dynamodb_table.carts.name
      ORDERS_TABLE      = aws_dynamodb_table.orders.name
      PAYMENTS_TABLE    = aws_dynamodb_table.payments.name
      WITHDRAWALS_TABLE = aws_dynamodb_table.withdrawals.name
      IDEMPOTENCY_TABLE = aws_dynamodb_table.idempotency.name
      MURAL_API_URL     = var.mural_api_url
      MURAL_API_KEY     = local.mural_api_key
      MURAL_ORG_ID      = local.mural_org_id
      MURAL_ACCOUNT_ID  = local.mural_account_id
      SENDER_PRIVATE_KEY = var.sender_private_key
      RPC_URL            = local.rpc_url
      MERCHANT_COP_PHONE_NUMBER   = local.merchant_cop_phone_number
      MERCHANT_COP_ACCOUNT_TYPE   = local.merchant_cop_account_type
      MERCHANT_COP_BANK_ACCOUNT   = local.merchant_cop_bank_account
      MERCHANT_COP_DOCUMENT_NUMBER = local.merchant_cop_document_number
      MERCHANT_COP_DOCUMENT_TYPE  = local.merchant_cop_document_type
      MERCHANT_COP_BANK_NAME      = local.merchant_cop_bank_name
      MERCHANT_COP_ACCOUNT_OWNER  = local.merchant_cop_account_owner
      MURAL_TRANSFER_API_KEY     = local.mural_transfer_api_key
    }
  }
}

# API Gateway REST API (Lambda proxy integration)
resource "aws_api_gateway_rest_api" "api" {
  name        = "${var.app_name}-api"
  description = "Mural Marketplace API"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
  request_parameters = {
    "method.request.path.proxy" = true
  }
}

resource "aws_api_gateway_integration" "proxy" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api.invoke_arn
}

resource "aws_api_gateway_method" "root" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_rest_api.api.root_resource_id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "root" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_rest_api.api.root_resource_id
  http_method             = aws_api_gateway_method.root.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.api.invoke_arn
}

resource "aws_api_gateway_deployment" "api" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  depends_on = [
    aws_api_gateway_integration.proxy,
    aws_api_gateway_integration.root,
  ]
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "default" {
  deployment_id = aws_api_gateway_deployment.api.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "default"
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

output "api_endpoint" {
  value = "${aws_api_gateway_stage.default.invoke_url}/"
}

output "api_id" {
  value = aws_api_gateway_rest_api.api.id
}
