# One function per entry in manifest.json, with its code: the bundle under
# dist/<name>/ zipped here, passed with its hash, every change published as
# a version, and an alias at that version for the routes (decision 0017).
# Each function has its own execution role, under the boundary, with the
# least it needs, and its own log group with retention. The second alias,
# previous, and how it learns what live was, are in previous.tf.

locals {
  # The service each function names itself in its logs, traces and metrics. One
  # expression, because an alarm reads it (alarms.tf; terraform.md, rule 19).
  service_names = { for name, _ in var.functions : name => "heat-${name}" }
}

data "archive_file" "function" {
  for_each = var.functions

  type             = "zip"
  source_dir       = "${var.dist_dir}/${each.key}"
  output_path      = "${var.dist_dir}/${each.key}.zip"
  output_file_mode = "0644"
}

# Created before the function, so the retention applies from the first
# line; the name is the one Lambda writes to by default.
resource "aws_cloudwatch_log_group" "function" {
  for_each = var.functions

  name              = "/aws/lambda/${var.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "function_trust" {
  statement {
    sid     = "LambdaService"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "function" {
  for_each = var.functions

  name                 = "${var.name_prefix}-${each.key}"
  description          = "Execution role of the ${each.key} function of ${var.name_prefix}. Its log group, the two tables, the replay bucket's objects, and X-Ray."
  assume_role_policy   = data.aws_iam_policy_document.function_trust.json
  permissions_boundary = var.permissions_boundary_arn
}

# Least privilege: the function's own log group, the item operations the
# repository uses on the two tables, putting and getting the replay
# bucket's objects, and the trace writes. No table or bucket management, no
# listing, no other log group, no other service.
data "aws_iam_policy_document" "function" {
  for_each = var.functions

  statement {
    sid    = "WriteOwnLogGroup"
    effect = "Allow"

    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = ["${aws_cloudwatch_log_group.function[each.key].arn}:*"]
  }

  statement {
    sid    = "ReadAndWriteTheTables"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:BatchWriteItem",
    ]

    resources = [
      aws_dynamodb_table.player.arn,
      aws_dynamodb_table.location.arn,
    ]
  }

  # The location table's index, a job's replays (tables.tf, decision 0050),
  # which the code only queries. A Query of an index is authorized on the
  # index's own ARN, not the table's: Query's resource types are `table`
  # and `index`, and an index's ARN is the table's with /index/<name>
  # (AWS's service reference for DynamoDB, v1/dynamodb/dynamodb.json, read
  # 2026-11-11).
  statement {
    sid    = "QueryTheReplaysIndex"
    effect = "Allow"

    actions = ["dynamodb:Query"]

    resources = ["${aws_dynamodb_table.location.arn}/index/${local.replays_index}"]
  }

  # The timelines, one object per adventure (replays.tf, Issue-114). A
  # conditional put needs nothing beyond s3:PutObject (S3 user guide,
  # "How to prevent object overwrites with conditional writes", read
  # 2026-10-22). Without s3:ListBucket a missing key answers 403, not 404.
  statement {
    sid    = "PutAndGetTimelines"
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]

    resources = ["${aws_s3_bucket.replays.arn}/*"]
  }

  statement {
    sid    = "WriteTraces"
    effect = "Allow"

    actions = [
      "xray:PutTraceSegments",
      "xray:PutTelemetryRecords",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "function" {
  for_each = var.functions

  name   = "least-privilege"
  role   = aws_iam_role.function[each.key].id
  policy = data.aws_iam_policy_document.function[each.key].json
}

resource "aws_lambda_function" "function" {
  for_each = var.functions

  function_name = "${var.name_prefix}-${each.key}"
  description   = "${each.key} of ${var.name_prefix}: ${each.value.export} from dist/${each.key}/index.mjs"
  role          = aws_iam_role.function[each.key].arn

  # The bundle is one ESM file; the export name comes from the manifest.
  # code_sha256, not source_code_hash: it is compared with what Lambda holds,
  # so a change made outside Terraform shows in the plan too (decision 0017,
  # facts checked; optional and computed in provider 6.69.1, read from its
  # schema on 2026-10-17).
  filename    = data.archive_file.function[each.key].output_path
  code_sha256 = data.archive_file.function[each.key].output_base64sha256
  handler     = "index.${each.value.export}"

  # The runtime follows the major in .node-version (docs/standards/typescript.md,
  # rule 1). arm64: the same Node, about a fifth cheaper per millisecond.
  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  memory_size   = each.value.memoryMb
  timeout       = each.value.timeoutSeconds

  # Every change of code or configuration publishes a version; the alias
  # below follows it (decision 0017).
  publish = true

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      HEAT_PLAYER_TABLE       = aws_dynamodb_table.player.name
      HEAT_LOCATION_TABLE     = aws_dynamodb_table.location.name
      POWERTOOLS_SERVICE_NAME = local.service_names[each.key]
      POWERTOOLS_LOG_LEVEL    = var.log_level
      # Each stack's own namespace: sandbox stacks share an account, and the
      # service dimension is the same in every environment (decision 0040).
      POWERTOOLS_METRICS_NAMESPACE = var.name_prefix
      # The deploy's version (decision 0030). It changes with every commit,
      # so every deploy publishes a new version and moves the alias, even
      # one whose bundle is unchanged.
      HEAT_VERSION = var.app_version
      # The version the previous alias runs, read when Terraform plans
      # (previous.tf), so a discard can refuse an adventure that either
      # deploy still verifies.
      HEAT_PREVIOUS_VERSION = local.previous[each.key].app_version
      HEAT_REPLAY_BUCKET    = aws_s3_bucket.replays.id
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.function,
    aws_iam_role_policy.function,
  ]
}

# What the routes point at. Rollback is this alias moved back to an earlier
# version, through the same pipeline (decision 0017).
resource "aws_lambda_alias" "live" {
  for_each = var.functions

  name             = "live"
  description      = "The version the routes invoke."
  function_name    = aws_lambda_function.function[each.key].function_name
  function_version = aws_lambda_function.function[each.key].version
}
