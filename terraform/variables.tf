variable "app_name" {
  type        = string
  default     = "mural-marketplace"
  description = "Application name used for resource naming"
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for resources. Override via TF_VAR_aws_region or terraform.tfvars."
}

variable "lambda_source_dir" {
  type        = string
  default     = "../dist"
  description = "Path to the built Lambda deployment package (directory to zip). Run 'npm run build' and 'npm run copy:node_modules' from repo root first."
}

variable "mural_api_url" {
  type        = string
  default     = "https://api-staging.muralpay.com"
  description = "Mural API base URL (use staging for sandbox)"
}

# Backend USDC transfer (optional): when set, Lambda sends USDC to Mural account on payment creation
variable "sender_private_key" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Private key of wallet that holds USDC (and native token for gas). If empty, customer must send USDC to the returned address."
}
