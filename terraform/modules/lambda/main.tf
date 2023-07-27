variable "function_name" {}
variable "timeout" {}
variable "image_uri" {}
variable "package_type" {}
variable "architectures" {}
variable "memory_size" {}
variable "iam_role_resource_reference" {}
variable "eventbridge_rule_reference" {}
variable "vpc_config" {
  type    = map(any)
  default = {}
}
variable "environment_variables" {
  type    = map(any)
  default = {}
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  timeout       = var.timeout
  image_uri     = var.image_uri
  package_type  = var.package_type
  architectures = var.architectures
  memory_size   = var.memory_size
  role          = var.iam_role_resource_reference.arn

  environment {
    variables = var.environment_variables
  }

  vpc_config {
    subnet_ids         = var.vpc_config.subnet_ids
    security_group_ids = var.vpc_config.security_group_ids
  }
}

# Permission for Lambda to be invoked by EventBridge
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = var.function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.eventbridge_rule_reference.arn
}

output "function_arn" {
  description = "ARN of the Lambda function."
  value       = aws_lambda_function.this.arn
}

output "function_invoke_arn" {
  description = "ARN to be used to invoke the Lambda function."
  value       = aws_lambda_function.this.invoke_arn
}

