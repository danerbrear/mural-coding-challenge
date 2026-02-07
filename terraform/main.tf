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
    type = "S"
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
          aws_dynamodb_table.payments.arn,
          aws_dynamodb_table.withdrawals.arn,
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
      MURAL_API_KEY     = var.mural_api_key
      MURAL_ORG_ID      = var.mural_org_id
      MURAL_ACCOUNT_ID  = var.mural_account_id
      MERCHANT_COP_PHONE_NUMBER   = var.merchant_cop_phone_number
      MERCHANT_COP_ACCOUNT_TYPE   = var.merchant_cop_account_type
      MERCHANT_COP_BANK_ACCOUNT   = var.merchant_cop_bank_account
      MERCHANT_COP_DOCUMENT_NUMBER = var.merchant_cop_document_number
      MERCHANT_COP_DOCUMENT_TYPE  = var.merchant_cop_document_type
      MERCHANT_COP_BANK_NAME      = var.merchant_cop_bank_name
      MERCHANT_COP_ACCOUNT_OWNER  = var.merchant_cop_account_owner
      MURAL_TRANSFER_API_KEY     = var.mural_transfer_api_key
    }
  }
}

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "http" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  value = aws_apigatewayv2_api.http.id
}
