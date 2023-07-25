# https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest
# https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/rds_cluster
# https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.docker
# https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/single-container-docker-configuration.html#single-container-docker-configuration.privaterepo
# https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution.html

provider "aws" {
    region = "eu-west-2"
}

module "vpc" {
    source  = "terraform-aws-modules/vpc/aws"
    version = "5.1.0"

    name = "publicsDigest-VPC"
    cidr = "10.0.0.0/16"

    azs             = ["eu-west-2a", "eu-west-2b"]
    public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]

    # For public access to RDS instance - not recommended in prod
    create_database_subnet_group           = true
    create_database_subnet_route_table     = true
    create_database_internet_gateway_route = true
    enable_dns_hostnames = true
    enable_dns_support   = true

    tags = {
        Terraform   = "true"
        Environment = "prod"
    }
}

# ----- Serverless Postgres RDS ----- #
resource "aws_rds_cluster" "publics-digest-db-cluster" {
    cluster_identifier = "publics-digest-db-cluster"
    engine             = "aurora-postgresql"
    engine_mode        = "provisioned"
    engine_version     = "15.2"
    database_name      = "publicsDigestDB"
    master_username    = "publicsDigestDB"
    master_password    = "publicsDigestDBPassword"

    vpc_security_group_ids = [aws_security_group.publicsDigestDB-security-group.id]
    db_subnet_group_name = aws_db_subnet_group.publicsDigestDB_subnet_group.name

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
    name       = "db-subnet-groups"
    subnet_ids = module.vpc.public_subnets

    tags = {
        Name = "db-subnet-groups"
    }
}

resource "aws_security_group" "publicsDigestDB-security-group" {
    name        = "publicsDigestDB-security-group"
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

# ----- Elastic BeanStalk ----- #
resource "aws_iam_role" "beanstalk_service" {
    name = "beanstalk_role"

    assume_role_policy = <<EOF
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Action": "sts:AssumeRole",
                "Principal": {
                "Service": "ec2.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
            }
        ]
    }
    EOF
}

resource "aws_iam_role_policy_attachment" "beanstalk_log_attach" {
    role       = aws_iam_role.beanstalk_service.name
    policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "beanstalk_ecr_attach" {
    role       = aws_iam_role.beanstalk_service.name
    policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_policy" "publics_digest_ebs_bucket_policy" {
    name        = "publics_digest_ebs_bucket_policy"
    policy      = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Effect   = "Allow"
                Action   = "s3:GetObject"
                Resource = "${aws_s3_bucket.publics_digest_ebs_bucket.arn}/*"
            }
        ]
    })

    depends_on = [
        aws_s3_bucket.publics_digest_ebs_bucket
    ]
}

resource "aws_iam_role_policy_attachment" "publics_digest_ebs_bucket_attach" {
    policy_arn = aws_iam_policy.publics_digest_ebs_bucket_policy.arn
    role       = aws_iam_role.beanstalk_service.name
}

resource "aws_iam_instance_profile" "beanstalk_iam_instance_profile" {
    name = "beanstalk_iam_instance_profile"
    role = aws_iam_role.beanstalk_service.name
}

resource "aws_s3_bucket" "publics_digest_ebs_bucket" {
    bucket = "publics-digest-beanstalk-ebs"
    
    tags = {
        Name = "Publics Digest EBS"
    }
}

resource "aws_s3_object" "publics_digest_deployment" {
    bucket = aws_s3_bucket.publics_digest_ebs_bucket.id
    key    = "Dockerrun.aws.json"
    source = "Dockerrun.aws.json"
}

resource "aws_elastic_beanstalk_application" "publicsDigestAPI" {
    name        = "publicsDigestAPI"
    description = "Backend API for publicsDigest"
}

resource "aws_elastic_beanstalk_environment" "publicsDigestAPI_env" {
    name                = "publicsDigestAPI-env"
    application         = aws_elastic_beanstalk_application.publicsDigestAPI.name
    version_label       = aws_elastic_beanstalk_application_version.publics_digest_ebs_bucket_version.name
    solution_stack_name = "64bit Amazon Linux 2 v3.5.9 running Docker"
    cname_prefix        = "digest"

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_HOST"
        value     = aws_rds_cluster.publics-digest-db-cluster.endpoint
    }

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_NAME"
        value     = aws_rds_cluster.publics-digest-db-cluster.database_name
    }

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_MASTER_USERNAME"
        value     = aws_rds_cluster.publics-digest-db-cluster.master_username
    }

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_MASTER_PASSWORD"
        value     = aws_rds_cluster.publics-digest-db-cluster.master_password
    }

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_PORT"
        value     = aws_rds_cluster.publics-digest-db-cluster.port
    }

    setting {
        namespace = "aws:elasticbeanstalk:application:environment"
        name      = "DATABASE_URL"
        value     = format("postgresql://%s:%s@%s:%s/%s",
            aws_rds_cluster.publics-digest-db-cluster.master_username,
            aws_rds_cluster.publics-digest-db-cluster.master_password,
            aws_rds_cluster.publics-digest-db-cluster.endpoint,
            aws_rds_cluster.publics-digest-db-cluster.port,
            aws_rds_cluster.publics-digest-db-cluster.database_name
        )
    }

    setting {
        namespace = "aws:autoscaling:launchconfiguration"
        name      = "IamInstanceProfile"
        value     = aws_iam_instance_profile.beanstalk_iam_instance_profile.arn
    }

    setting {
        namespace = "aws:elasticbeanstalk:cloudwatch:logs"
        name      = "StreamLogs"
        value     = "True"
    }

    depends_on = [aws_rds_cluster_instance.publicsDigestDB-instance]
}

resource "aws_elastic_beanstalk_application_version" "publics_digest_ebs_bucket_version" {
    name        = "publicsDigestAPI-version"
    application = aws_elastic_beanstalk_application.publicsDigestAPI.name
    description = "application version created by terraform"
    bucket      = aws_s3_bucket.publics_digest_ebs_bucket.id
    key         = aws_s3_object.publics_digest_deployment.id
}

# ----- CDN for Elastic BeanStalk ----- #
resource "aws_cloudfront_distribution" "beanstalk_distribution" {
    origin {
        domain_name = aws_elastic_beanstalk_environment.publicsDigestAPI_env.endpoint_url
        origin_id   = "digest-beanstalk-api"

        custom_origin_config {
            http_port              = 80
            https_port             = 443
            origin_protocol_policy = "http-only"
            origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
        }
    }

    enabled             = true
    is_ipv6_enabled     = true
    comment             = "CloudFront for Elastic Beanstalk Digest API"

    default_cache_behavior {
        allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
        cached_methods   = ["GET", "HEAD"]
        target_origin_id = "digest-beanstalk-api"

        compress               = true

        cache_policy_id        = aws_cloudfront_cache_policy.beanstalk_distribution_cache_policy.id

        viewer_protocol_policy = "allow-all"
        default_ttl            = 300
    }

    price_class = "PriceClass_All"

    restrictions {
        geo_restriction {
            restriction_type = "none"
        }
    }

    viewer_certificate {
        cloudfront_default_certificate = true
    }

    depends_on = [aws_elastic_beanstalk_environment.publicsDigestAPI_env, aws_cloudfront_cache_policy.beanstalk_distribution_cache_policy]
}

resource "aws_cloudfront_cache_policy" "beanstalk_distribution_cache_policy" {
    name        = "getPosts-cache-policy"
    comment     = "caching for getPosts based on query string latestUUID"
    default_ttl = 300
    max_ttl     = 301
    min_ttl     = 299


    parameters_in_cache_key_and_forwarded_to_origin {
        cookies_config {
            cookie_behavior = "none"
        }

        headers_config {
            header_behavior = "none"
        }

        query_strings_config {
            query_string_behavior = "whitelist"
            query_strings {
                items = ["latestUUID"]
            }
        }
    }
}

# ----- Outputs ----- #
output "cloudfront_for_elastic_beanstalk_environment" {
    description = "The CloudFront distribution URL for the Elastic Beanstalk BE API environment"
    value       = aws_cloudfront_distribution.beanstalk_distribution.domain_name
}

output "rds_endpoint" {
    description = "The connection endpoint for the RDS DB instance"
    value       = aws_rds_cluster.publics-digest-db-cluster.endpoint
}

output "elastic_beanstalk_environment" {
    description = "The URL to the EB environment"
    value       = aws_elastic_beanstalk_environment.publicsDigestAPI_env.endpoint_url
}
