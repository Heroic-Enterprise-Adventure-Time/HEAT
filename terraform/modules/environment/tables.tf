# The two tables of decision 0023, named for their partition key. Both carry
# the generic key schema of packages/hub/src/db/keys.ts, PK and SK as
# strings, so an item type is a sort-key prefix and a new type is never a
# table change; the test helper packages/hub/test/setup/table.ts creates the
# same schema in DynamoDB Local. On-demand capacity: nothing is paid at
# rest, and a provisioned table is the one cost the boundary cannot deny
# (terraform/bootstrap/README.md), so none is created here.

# Partitioned by player. Private: read only through the hub.
resource "aws_dynamodb_table" "player" {
  name         = "${var.name_prefix}-player"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  deletion_protection_enabled = var.deletion_protection
}

# Partitioned by location, and by adventure for the record settle looks up
# by id. Public: what every player may see. Its TTL attribute, expiresAt in
# epoch seconds, is set on the heroes seen at a location (decision 0029).
resource "aws_dynamodb_table" "location" {
  name         = "${var.name_prefix}-location"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  deletion_protection_enabled = var.deletion_protection
}
