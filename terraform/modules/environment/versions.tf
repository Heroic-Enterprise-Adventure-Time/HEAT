terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }

    # Zips each function's bundle at plan time. Its zip entries carry a fixed
    # modification time since 1.0.3 ("Fix modified time affecting zip
    # contents and causing spurious diffs", the provider's changelog, read
    # 2026-10-17), so the same bundle gives the same hash on a laptop and on
    # the runner, which decision 0017 asked Issue-38 to verify.
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }
}
