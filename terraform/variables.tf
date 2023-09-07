variable "posts_storage_bucket" {
    default     = "digest-posts-html"
    description = "The name of the bucket to store the posts in"
}

variable "mirror_data_aggregation_image_tag" {
    default = "1.0"
}

variable "paragraph_data_aggregation_image_tag" {
    default = "1.0"
}