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

variable "mural_api_key" {
  type        = string
  sensitive   = true
  description = "Mural API key for authentication"
}

variable "mural_org_id" {
  type        = string
  description = "Mural organization ID (on-behalf-of)"
}

variable "mural_account_id" {
  type        = string
  description = "Mural account ID for receiving USDC and sourcing payouts"
}

variable "mural_transfer_api_key" {
  type        = string
  sensitive   = true
  description = "Mural Transfer API key for executing payouts"
}

# Merchant COP bank details for automatic withdrawal (Colombian Pesos)
variable "merchant_cop_phone_number" {
  type        = string
  description = "Merchant phone number for COP payout"
}

variable "merchant_cop_account_type" {
  type        = string
  default     = "CHECKING"
  description = "CHECKING or SAVINGS"
}

variable "merchant_cop_bank_account" {
  type        = string
  sensitive   = true
  description = "Merchant COP bank account number"
}

variable "merchant_cop_document_number" {
  type        = string
  description = "Merchant document number (Colombian)"
}

variable "merchant_cop_document_type" {
  type        = string
  default     = "NATIONAL_ID"
  description = "NATIONAL_ID, PASSPORT, etc."
}

variable "merchant_cop_bank_name" {
  type        = string
  description = "Merchant bank name"
}

variable "merchant_cop_account_owner" {
  type        = string
  description = "Merchant bank account owner name"
}
