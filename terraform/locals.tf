locals {
  # Mural API (hardcoded for this environment)
  mural_api_key          = "3c4cb082c179dbecb2e60e56:f27dfb1686c614de4bc037c2daeb2ff829f9212083593efb881449f9504a090f1fb8435f:cecc641ac76207e2f3378a348f58514a.50d1a21e8343f740d1d269e36b79347b5ba1db84e3ea555b7077d96fb146c27a"
  mural_transfer_api_key = "c1327e8dd2341cf7dffc5dbc:741997a565455f0c513fd2ab7788e68fa3bac77df0c0d3edc3df7ea87b97249d26d5113e:e85ef798897acbbc2285b440b09f573a.c4c6911add7a25ac0c69dfed69c93fa398d3ede692ff032405c112c2a10dddf0"
  mural_account_id       = "28363acb-d2d6-48aa-a32f-444f6a3f87c1"
  mural_org_id           = "c640784d-288b-43a3-8f51-6eb9b33340bc"

  # Merchant COP bank details (Colombian Pesos)
  merchant_cop_phone_number    = "+573001234567"
  merchant_cop_account_type    = "CHECKING"
  merchant_cop_bank_account    = "123456"
  merchant_cop_document_number = "123456"
  merchant_cop_document_type   = "NATIONAL_ID"
  merchant_cop_bank_name       = "Scotiabank Colpatria"
  merchant_cop_account_owner   = "Test Owner"

  # RPC (Polygon Amoy testnet)
  rpc_url = "https://rpc-amoy.polygon.technology"
}
