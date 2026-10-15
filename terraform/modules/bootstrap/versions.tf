terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"

      # The root passes two providers in: the default one, heat-platform, which
      # this module uses only for policy documents, and aws.workload, the
      # account the resources are created in.
      configuration_aliases = [aws.workload]
    }
  }
}
