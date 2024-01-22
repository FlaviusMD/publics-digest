# https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest
# https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/rds_cluster
# https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.docker
# https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/single-container-docker-configuration.html#single-container-docker-configuration.privaterepo
# https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution.html

provider "aws" {
  region = "eu-west-1"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  name = "publicsDigest-VPC-${terraform.workspace}"
  cidr = "10.0.0.0/16"

  azs             = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.4.0/24", "10.0.5.0/24", "10.0.6.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
  enable_vpn_gateway = false
  create_igw         = true

  public_subnet_tags = {
    Name = "publicsDigest-VPC-public-subnet-${terraform.workspace}"
  }

  private_subnet_tags = {
    Name = "publicsDigest-VPC-private-subnet-${terraform.workspace}"
  }

  # For public access to RDS instance - not recommended in prod
  create_database_subnet_group           = true
  create_database_subnet_route_table     = true
  create_database_internet_gateway_route = true
  enable_dns_hostnames                   = true
  enable_dns_support                     = true

  tags = {
    Terraform   = "true"
    Environment = "prod"
  }
}

# ----- Serverless Postgres RDS ----- #
resource "aws_rds_cluster" "publics-digest-db-cluster" {
  cluster_identifier = "publics-digest-db-cluster-${terraform.workspace}"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "15.2"
  database_name      = "publicsDigestDB"
  master_username    = "publicsDigestDB"
  master_password    = "publicsDigestDBPassword"

  vpc_security_group_ids = [aws_security_group.publicsDigestDB-security-group.id]
  db_subnet_group_name   = aws_db_subnet_group.publicsDigestDB_subnet_group.name

  serverlessv2_scaling_configuration {
    max_capacity = 4.0
    min_capacity = 0.5
  }
}

resource "aws_rds_cluster_instance" "publicsDigestDB-instance" {
  cluster_identifier = aws_rds_cluster.publics-digest-db-cluster.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.publics-digest-db-cluster.engine
  engine_version     = aws_rds_cluster.publics-digest-db-cluster.engine_version

  publicly_accessible = true
}

resource "aws_db_subnet_group" "publicsDigestDB_subnet_group" {
  name       = "db-subnet-groups-${terraform.workspace}"
  subnet_ids = module.vpc.public_subnets

  tags = {
    Name = "db-subnet-groups-${terraform.workspace}"
  }
}

resource "aws_security_group" "publicsDigestDB-security-group" {
  name        = "publicsDigestDB-security-group-${terraform.workspace}"
  description = "Allow inbound traffic to RDS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# # ----- Elastic BeanStalk ----- #
# resource "aws_iam_role" "beanstalk_service" {
#   name = "beanstalk_role-${terraform.workspace}"

#   assume_role_policy = <<EOF
#     {
#         "Version": "2012-10-17",
#         "Statement": [
#             {
#                 "Action": "sts:AssumeRole",
#                 "Principal": {
#                 "Service": "ec2.amazonaws.com"
#                 },
#                 "Effect": "Allow",
#                 "Sid": ""
#             }
#         ]
#     }
#     EOF
# }

# resource "aws_iam_role_policy" "cloudwatch_logs_streaming_for_ebs_policy" {
#   name = "allow_cloudwatch_logs_streaming_for_ebs-${terraform.workspace}"
#   role = aws_iam_role.beanstalk_service.id

#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect   = "Allow"
#         Action   = [
#           "logs:CreateLogGroup",
#           "logs:CreateLogStream",
#           "logs:PutLogEvents"
#         ]
#         Resource = "arn:aws:logs:*:*:*"
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy_attachment" "beanstalk_log_attach" {
#   role       = aws_iam_role.beanstalk_service.name
#   policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
# }

# resource "aws_iam_role_policy_attachment" "beanstalk_ecr_attach" {
#   role       = aws_iam_role.beanstalk_service.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
# }

# resource "aws_iam_policy" "publics_digest_ebs_bucket_policy" {
#   name = "publics_digest_ebs_bucket_policy-${terraform.workspace}"
#   policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect   = "Allow"
#         Action   = "s3:GetObject"
#         Resource = "${aws_s3_bucket.publics_digest_ebs_bucket.arn}/*"
#       }
#     ]
#   })

#   depends_on = [
#     aws_s3_bucket.publics_digest_ebs_bucket
#   ]
# }

# resource "aws_iam_role_policy_attachment" "publics_digest_ebs_bucket_attach" {
#   policy_arn = aws_iam_policy.publics_digest_ebs_bucket_policy.arn
#   role       = aws_iam_role.beanstalk_service.name
# }

# resource "aws_iam_instance_profile" "beanstalk_iam_instance_profile" {
#   name = "beanstalk_iam_instance_profile-${terraform.workspace}"
#   role = aws_iam_role.beanstalk_service.name
# }

# resource "aws_s3_bucket" "publics_digest_ebs_bucket" {
#   bucket = "publics-digest-beanstalk-ebs-${terraform.workspace}"

#   tags = {
#     Name = "Publics Digest EBS Dockerrun file bucket"
#   }
# }

# resource "aws_s3_bucket_lifecycle_configuration" "publics_digest_ebs_bucket_lifecycle" {
#   bucket = aws_s3_bucket.publics_digest_ebs_bucket.id

#   rule {
#     id      = "Move non-current versions to Glacier after 7 days"
#     status  = "Enabled"

#     noncurrent_version_transition {
#       noncurrent_days           = 7
#       storage_class             = "GLACIER_IR"
#     }
#   }
# }

# resource "aws_s3_bucket_versioning" "publics_digest_ebs_bucket_versioning" {
#   bucket = aws_s3_bucket.publics_digest_ebs_bucket.id

#   versioning_configuration {
#     status = "Enabled"
#   }
# }

# resource "aws_s3_object" "publics_digest_deployment" {
#   bucket = aws_s3_bucket_versioning.publics_digest_ebs_bucket_versioning.id
#   key    = "Dockerrun.aws.json"
#   source = "Dockerrun.aws.json"
#   etag   = filemd5("Dockerrun.aws.json") /*Creates a hash of the file to force redeployment of BeanStalk when the Dockerrun file changes. Comment out if you don't want to redeploy Beanstalk.*/
# }

# resource "aws_elastic_beanstalk_application" "publicsDigestAPI" {
#   name        = "publicsDigestAPI-${terraform.workspace}"
#   description = "Backend Express server for publicsDigest"
# }

# resource "aws_elastic_beanstalk_environment" "publicsDigestAPI_env" {
#   name                = "publicsDigestAPI-env-${terraform.workspace}"
#   application         = aws_elastic_beanstalk_application.publicsDigestAPI.name
#   version_label       = aws_elastic_beanstalk_application_version.publics_digest_ebs_bucket_version.name
#   solution_stack_name = "64bit Amazon Linux 2 v3.5.9 running Docker"
#   cname_prefix        = "digest"

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_HOST"
#     value     = aws_rds_cluster.publics-digest-db-cluster.endpoint
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_NAME"
#     value     = aws_rds_cluster.publics-digest-db-cluster.database_name
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_MASTER_USERNAME"
#     value     = aws_rds_cluster.publics-digest-db-cluster.master_username
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_MASTER_PASSWORD"
#     value     = aws_rds_cluster.publics-digest-db-cluster.master_password
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_PORT"
#     value     = aws_rds_cluster.publics-digest-db-cluster.port
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:application:environment"
#     name      = "DATABASE_URL"
#     value = format("postgresql://%s:%s@%s:%s/%s",
#       aws_rds_cluster.publics-digest-db-cluster.master_username,
#       aws_rds_cluster.publics-digest-db-cluster.master_password,
#       aws_rds_cluster.publics-digest-db-cluster.endpoint,
#       aws_rds_cluster.publics-digest-db-cluster.port,
#       aws_rds_cluster.publics-digest-db-cluster.database_name
#     )
#   }

#   setting {
#     namespace = "aws:autoscaling:launchconfiguration"
#     name      = "IamInstanceProfile"
#     value     = aws_iam_instance_profile.beanstalk_iam_instance_profile.arn
#   }

#   // for ssh access to the ec2 instance
#   setting {
#     namespace = "aws:autoscaling:launchconfiguration"
#     name      = "EC2KeyName"
#     value     = "digest-api-ssh"
#   }

#   setting {
#     namespace = "aws:elasticbeanstalk:cloudwatch:logs"
#     name      = "StreamLogs"
#     value     = "True"
#   }

#   depends_on = [aws_rds_cluster_instance.publicsDigestDB-instance, aws_elastic_beanstalk_application_version.publics_digest_ebs_bucket_version]
# }

# resource "aws_elastic_beanstalk_application_version" "publics_digest_ebs_bucket_version" {
#   name        = "publicsDigestAPI-version-${terraform.workspace}"
#   application = aws_elastic_beanstalk_application.publicsDigestAPI.name
#   description = "application version created by terraform"
#   bucket      = aws_s3_bucket.publics_digest_ebs_bucket.id
#   key         = aws_s3_object.publics_digest_deployment.id
# }

# # ----- CDN for Elastic BeanStalk ----- #
# resource "aws_cloudfront_distribution" "beanstalk_distribution" {
#   origin {
#     domain_name = aws_elastic_beanstalk_environment.publicsDigestAPI_env.endpoint_url
#     origin_id   = "digest-beanstalk-api-${terraform.workspace}"

#     custom_origin_config {
#       http_port              = 80
#       https_port             = 443
#       origin_protocol_policy = "http-only"
#       origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
#     }
#   }

#   enabled         = true
#   is_ipv6_enabled = true
#   comment         = "CloudFront for Elastic Beanstalk Digest API -${terraform.workspace}"

#   ordered_cache_behavior {
#     path_pattern     = "/getPosts*"
#     allowed_methods  = ["GET", "HEAD"]
#     cached_methods   = ["GET", "HEAD"]
#     target_origin_id = "digest-beanstalk-api-${terraform.workspace}"

#     compress = true

#     cache_policy_id = aws_cloudfront_cache_policy.beanstalk_get_latest_posts_cache_policy.id

#     viewer_protocol_policy = "allow-all"
#     default_ttl            = 300 /*5 minutes*/
#   }

#   ordered_cache_behavior {
#     path_pattern = "/posts/trending"
#     allowed_methods  = ["GET", "HEAD"]
#     cached_methods   = ["GET", "HEAD"]
#     target_origin_id = "digest-beanstalk-api-${terraform.workspace}"

#     compress = true

#     cache_policy_id = aws_cloudfront_cache_policy.beanstalk_get_trending_posts_cache_policy.id

#     viewer_protocol_policy = "allow-all"
#     default_ttl            = 14400 /*4 hours*/
#   }

#   default_cache_behavior {
#     allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
#     cached_methods   = ["GET", "HEAD"]
#     target_origin_id = "digest-beanstalk-api-${terraform.workspace}"

#     compress = true

#     viewer_protocol_policy = "allow-all"

#     forwarded_values {
#       query_string = true
#       headers      = ["*"]

#       cookies {
#         forward = "all"
#       }
#     }

#     min_ttl                = 0
#     default_ttl            = 0
#     max_ttl                = 0
#   }

#   price_class = "PriceClass_All"

#   restrictions {
#     geo_restriction {
#       restriction_type = "none"
#     }
#   }

#   viewer_certificate {
#     cloudfront_default_certificate = true
#   }

#   depends_on = [aws_elastic_beanstalk_environment.publicsDigestAPI_env, aws_cloudfront_cache_policy.beanstalk_get_latest_posts_cache_policy]
# }

# resource "aws_cloudfront_cache_policy" "beanstalk_get_latest_posts_cache_policy" {
#   name        = "getPosts-cache-policy-${terraform.workspace}"
#   comment     = "caching for getPosts based on query string latestUUID"
#   default_ttl = 300
#   max_ttl     = 301
#   min_ttl     = 299


#   parameters_in_cache_key_and_forwarded_to_origin {
#     cookies_config {
#       cookie_behavior = "none"
#     }

#     headers_config {
#       header_behavior = "none"
#     }

#     query_strings_config {
#       query_string_behavior = "whitelist"
#       query_strings {
#         items = ["latestUUID"]
#       }
#     }
#   }
# }

# resource "aws_cloudfront_cache_policy" "beanstalk_get_trending_posts_cache_policy" {
#   name = "posts-trending-cache-policy-${terraform.workspace}"
#   comment = "caches trending posts for 4 hours"
#   default_ttl = 14400
#   max_ttl = 14401
#   min_ttl = 14399

#   parameters_in_cache_key_and_forwarded_to_origin {
#     cookies_config {
#       cookie_behavior = "none"
#     }

#     headers_config {
#       header_behavior = "none"
#     }

#     query_strings_config {
#       query_string_behavior = "none"
#     }
#   }
# }

# # ----- Data Aggregation Lambdas ----- #
# locals {
#   lambda_function = {
#     mirrorDataAggregation = {
#       timeout                     = 500
#       image_uri                   = "${data.aws_ecr_repository.data_aggregation_mirror_ecr.repository_url}:${var.mirror_data_aggregation_image_tag}"
#       package_type                = "Image"
#       architectures               = ["x86_64"]
#       memory_size                 = 512
#       iam_role_resource_reference = aws_iam_role.data_aggregation_lambda_role
#       eventbridge_rule_reference  = aws_cloudwatch_event_rule.sync_db_to_arweave_rule
#       vpc_config = {
#         subnet_ids         = module.vpc.private_subnets
#         security_group_ids = [aws_security_group.data_aggregation_lambda_security_group.id]
#       }

#       environment_variables = {
#         S3_BUCKET_NAME                      = var.posts_storage_bucket
#         GRAPHQL_ARWEAVE_ENDPOINT            = "https://arweave-search.goldsky.com/graphql"
#         MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS = "7"
#         DATABASE_URL = format("postgresql://%s:%s@%s:%s/%s",
#           aws_rds_cluster.publics-digest-db-cluster.master_username,
#           aws_rds_cluster.publics-digest-db-cluster.master_password,
#           aws_rds_cluster.publics-digest-db-cluster.endpoint,
#           aws_rds_cluster.publics-digest-db-cluster.port,
#           aws_rds_cluster.publics-digest-db-cluster.database_name
#         )
#       }
#     },
#     paragraphDataAggregation = {
#       timeout                     = 500
#       image_uri                   = "${data.aws_ecr_repository.data_aggregation_paragraph_ecr.repository_url}:${var.paragraph_data_aggregation_image_tag}"
#       package_type                = "Image"
#       architectures               = ["x86_64"]
#       memory_size                 = 512
#       iam_role_resource_reference = aws_iam_role.data_aggregation_lambda_role
#       eventbridge_rule_reference  = aws_cloudwatch_event_rule.sync_db_to_arweave_rule
#       vpc_config = {
#         subnet_ids         = module.vpc.private_subnets
#         security_group_ids = [aws_security_group.data_aggregation_lambda_security_group.id]
#       }

#       environment_variables = {
#         S3_BUCKET_NAME                      = var.posts_storage_bucket
#         GRAPHQL_ARWEAVE_ENDPOINT            = "https://arweave-search.goldsky.com/graphql"
#         MINIMUM_NUMBER_UNIQUE_ENGLISH_WORDS = "7"
#         DATABASE_URL = format("postgresql://%s:%s@%s:%s/%s",
#           aws_rds_cluster.publics-digest-db-cluster.master_username,
#           aws_rds_cluster.publics-digest-db-cluster.master_password,
#           aws_rds_cluster.publics-digest-db-cluster.endpoint,
#           aws_rds_cluster.publics-digest-db-cluster.port,
#           aws_rds_cluster.publics-digest-db-cluster.database_name
#         )
#       }
#     }
#   }
# }

# module "data_aggregation_lambdas" {
#   for_each = local.lambda_function

#   source = "./modules/lambda"

#   function_name               = "${each.key}-${terraform.workspace}"
#   timeout                     = each.value.timeout
#   image_uri                   = each.value.image_uri
#   package_type                = each.value.package_type
#   architectures               = each.value.architectures
#   memory_size                 = each.value.memory_size
#   iam_role_resource_reference = each.value.iam_role_resource_reference
#   eventbridge_rule_reference  = each.value.eventbridge_rule_reference
#   vpc_config                  = each.value.vpc_config
#   environment_variables       = each.value.environment_variables
# }

# resource "aws_security_group" "data_aggregation_lambda_security_group" {
#   name        = "lambda-security-group-${terraform.workspace}"
#   description = "Allow complete inbound and outbound traffic for this lambda"
#   vpc_id      = module.vpc.vpc_id

#   ## NOTE: Probably don't need these ingress and egress rules as I have aws_security_group_rule resources below.
#   ingress {
#     from_port   = 0
#     to_port     = 0
#     protocol    = "-1"
#     cidr_blocks = ["0.0.0.0/0"]
#   }

#   egress {
#     from_port   = 0
#     to_port     = 0
#     protocol    = "-1"
#     cidr_blocks = ["0.0.0.0/0"]
#   }
# }

# ## NOTE: I might not need both ingress and egress rules as AWS security groups are stateful.
# ## This means that if you allow incoming traffic from an IP, the response is automatically allowed, regardless of outbound rules. 

# # Allow traffic from the public subnets
# resource "aws_security_group_rule" "public_subnet_ingress" {
#   type              = "ingress"
#   from_port         = 0
#   to_port           = 65535
#   protocol          = "tcp"
#   cidr_blocks       = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
#   security_group_id = aws_security_group.data_aggregation_lambda_security_group.id
# }

# # Allow traffic to the public subnets
# resource "aws_security_group_rule" "public_subnet_egress" {
#   type              = "egress"
#   from_port         = 0
#   to_port           = 65535
#   protocol          = "tcp"
#   cidr_blocks       = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
#   security_group_id = aws_security_group.data_aggregation_lambda_security_group.id
# }

# data "aws_ecr_repository" "data_aggregation_mirror_ecr" {
#   name = "data-aggregation-mirror"
# }

# data "aws_ecr_repository" "data_aggregation_paragraph_ecr" {
#   name = "data-aggregation-paragraph"
# }

# # Define IAM Role for lambda to assume 
# resource "aws_iam_role" "data_aggregation_lambda_role" {
#   name = "data-aggregation-lambda-role-${terraform.workspace}"

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Action = "sts:AssumeRole"
#         Principal = {
#           Service = "lambda.amazonaws.com"
#         }
#         Effect = "Allow"
#         Sid    = ""
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy" "data_aggregation_lambda_vpc_network_creation_access" {
#   name = "data-aggregation-lambda-vpc-network-creation-access-${terraform.workspace}"
#   role = aws_iam_role.data_aggregation_lambda_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = [
#           "ec2:CreateNetworkInterface",
#           "ec2:DescribeNetworkInterfaces",
#           "ec2:DeleteNetworkInterface",
#           "ec2:DescribeSecurityGroups",
#           "ec2:DescribeSubnets",
#           "ec2:DescribeVpcs"
#         ],
#         Resource = "*"
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy_attachment" "data_aggregation_lambda_ecr_attach" {
#   role       = aws_iam_role.data_aggregation_lambda_role.name
#   policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
# }

# resource "aws_iam_role_policy" "data_aggregation_lambda_rds_policy" {
#   name = "rdsAccessPolicy-${terraform.workspace}"
#   role = aws_iam_role.data_aggregation_lambda_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = [
#           "rds:*"
#         ],
#         Resource = [
#           "${aws_rds_cluster.publics-digest-db-cluster.arn}"
#         ]
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy" "data_aggregation_lambda_access_s3" {
#   name = "s3AccessPolicy-${terraform.workspace}"
#   role = aws_iam_role.data_aggregation_lambda_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = "s3:*",
#         Resource = [
#           "arn:aws:s3:::${var.posts_storage_bucket}",
#           "arn:aws:s3:::${var.posts_storage_bucket}/*"
#         ]
#       }
#     ]
#   })
# }

# resource "aws_iam_role_policy" "data_aggregation_lambda_logging_policy" {
#   name = "dataAggregationLambdaLoggingPolicy-${terraform.workspace}"
#   role = aws_iam_role.data_aggregation_lambda_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = [
#           "logs:CreateLogGroup",
#           "logs:CreateLogStream",
#           "logs:PutLogEvents"
#         ],
#         Resource = "arn:aws:logs:*:*:*"
#       }
#     ]
#   })
# }

# # ----- EventBridge for Triggering Lambdas ----- #
# resource "aws_iam_role" "eventbridge_role" {
#   name = "eventbridge-role-${terraform.workspace}"

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Action = "sts:AssumeRole",
#         Principal = {
#           Service = "events.amazonaws.com"
#         },
#         Effect = "Allow",
#         Sid    = ""
#       }
#     ]
#   })
# }

# # IAM policy for EventBridge to invoke Lambda
# resource "aws_iam_role_policy" "eventbridge_policy" {
#   name = "eventbridge-policy-${terraform.workspace}"
#   role = aws_iam_role.eventbridge_role.id

#   policy = jsonencode({
#     Version = "2012-10-17",
#     Statement = [
#       {
#         Action   = "lambda:InvokeFunction",
#         Effect   = "Allow",
#         Resource = "arn:aws:lambda:*:*:function:*"
#       }
#     ]
#   })
# }

# # EventBridge rule
# resource "aws_cloudwatch_event_rule" "sync_db_to_arweave_rule" {
#   name                = "sync-db-to-arweave-rule-${terraform.workspace}"
#   schedule_expression = "cron(0/10 * * * ? *)" # every 10th minute.
#   role_arn            = aws_iam_role.eventbridge_role.arn
# }

# # EventBridge target that triggers the Lambda function
# resource "aws_cloudwatch_event_target" "sync_mirror_target" {
#   rule      = aws_cloudwatch_event_rule.sync_db_to_arweave_rule.name
#   target_id = "sync-mirror-${terraform.workspace}"
#   arn       = module.data_aggregation_lambdas["mirrorDataAggregation"].function_arn

#   depends_on = [module.data_aggregation_lambdas["mirrorDataAggregation"]]
# }

# # EventBridge target that triggers the Lambda function
# resource "aws_cloudwatch_event_target" "sync_paragraph_target" {
#   rule      = aws_cloudwatch_event_rule.sync_db_to_arweave_rule.name
#   target_id = "sync-paragraph-${terraform.workspace}"
#   arn       = module.data_aggregation_lambdas["paragraphDataAggregation"].function_arn

#   depends_on = [module.data_aggregation_lambdas["paragraphDataAggregation"]]
# }

# # ----- Outputs ----- #
# output "cloudfront_for_elastic_beanstalk_environment" {
#   description = "The CloudFront distribution URL for the Elastic Beanstalk BE API environment"
#   value       = aws_cloudfront_distribution.beanstalk_distribution.domain_name
# }

# output "elastic_beanstalk_environment" {
#   description = "The URL to the EB environment"
#   value       = aws_elastic_beanstalk_environment.publicsDigestAPI_env.endpoint_url
# }

# output "rds_endpoint" {
#   description = "The connection endpoint for the RDS DB instance"
#   value       = aws_rds_cluster.publics-digest-db-cluster.endpoint
# }

