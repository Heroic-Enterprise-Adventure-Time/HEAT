# 0063: The scale-downs trivy would fail: no customer-managed keys, no WAF, and no edge or bucket access logs

- **Status:** Decided
- **Date:** 2026-11-27, recording what was decided on 2026-11-02
- **Settles:** the review of PR-434 (Issue-271). The scale-downs Issue-157 excused in `terraform/.trivyignore` were written under "Held back" in the Terraform standard's detail file and in no record, where `docs/process/best-practices.md`, rule 5, gives a scale-down in security and platform management a record here.

## Decision

Six of trivy's misconfiguration checks are excused for every root and module under `terraform/`, by id in `terraform/.trivyignore`. Each is a practice the scanner asks for and HEAT does not follow. The owner decided them on Issue-157, on 2026-11-02, when the scanner joined the floor and its first run over `main` was triaged (`docs/standards/history.md`, "Rule 17, trivy"). This record writes that decision down, with what each one leaves exposed, and decides nothing new.

| Check | The full practice | What HEAT does instead | What that leaves exposed |
| --- | --- | --- | --- |
| `AVD-AWS-0132`, `AVD-AWS-0025`, `AVD-AWS-0017` | A customer-managed KMS key encrypts every bucket, every table and every log group | The data is encrypted at rest with keys AWS holds: S3's own keys on the buckets, AWS-owned keys on the tables, and the log groups' default encryption | Who may read the data is decided by IAM alone. There is no key policy as a second gate, no key to disable so as to cut every reader off at once, and no record of each use of a key |
| `AVD-AWS-0011` | A WAF web ACL in front of the CloudFront distribution | None. The API sits behind the gateway's JWT authorizer, and the site is static files | Nothing at the edge filters a request or limits a rate. A flood reaches the distribution and, for the API, the authorizer, and is paid for by the request |
| `AVD-AWS-0010` | Access logs on the distribution, written to a destination of their own | None. The gateway's access log and the function's log are the request record (`docs/process/development.md`, rule 7) | A request the distribution answers itself, for the site's files, is recorded nowhere. Only a request that reaches the API is |
| `AVD-AWS-0089` | Server access logs on every bucket, written to a log bucket | None. CloudTrail records the bucket-level calls | Who read or wrote an object is recorded nowhere: the organization's trail records management events only (decision 0020) |

The reasons are the ones the ignore file carries above each id. A key and a web ACL cost at rest, in every environment and every sandbox stack, which `docs/standards/terraform.md`, rule 12, refuses without a record. Each log is a destination per environment, with its policy and its lifecycle, and nobody to read it.

Each of the four leaves the ignore file, and "Held back" in `docs/standards/terraform-detail.md`, in the pull request that builds the thing. A thing that costs at rest is a decision record before it is a plan (rule 12), and that record amends or supersedes this one.

This record covers the excuses that hold everywhere, the ones in the ignore file. An excuse written on one resource, a `trivy:ignore` above it with its reason, is about that resource and is described under "Rule 17" of the detail file.

## Facts checked

Read on 2026-11-27, for this record, because what a scale-down leaves exposed is said from the provider's documents and not recalled (`docs/process/best-practices.md`, rule 3).

- **What a key AWS holds does not give** (AWS KMS developer guide, "AWS KMS keys"): of an AWS owned key the customer cannot change the policy and cannot audit the use, and its metadata cannot be viewed; of a customer managed key the customer sets the key policy, enables and disables it, and reads its use in CloudTrail.
- **The data is encrypted without one** (Amazon CloudWatch Logs user guide, "Encrypt log data in CloudWatch Logs using AWS KMS"; Amazon DynamoDB developer guide, "DynamoDB encryption at rest"): a log group's data is always encrypted, and a table's default is the AWS owned key, at no charge.
- **A customer managed key costs at rest** (AWS KMS pricing): one dollar a month for each key, prorated by the hour.
- **A WAF costs at rest, before and after its pricing changes on 2027-02-01** (AWS WAF pricing, both of the page's tabs). Through 2027-01-31: five dollars a month for each web ACL and one for each rule, prorated by the hour. From 2027-02-01: no charge for a web ACL, a rule or a rule group, and one cent an hour, about $7.30 a month, for each resource a web ACL protects, of which a CloudFront distribution is one. Either way a WAF on a distribution is a charge by the month in every environment and every sandbox stack, so the reason stands; from that date it is the protected distribution that costs at rest, where the ignore file says the web ACL.
- **The API's own bound on a flood** (`terraform/modules/environment/api.tf`, and each environment's root): the HTTP API's default route is throttled at ten requests a second with a burst of twenty, in `dev`, `prod` and a sandbox stack alike. That bounds what reaches the function; it does not bound requests for the site's files, which the distribution answers.

## Considered and not chosen

**Building each of them.** A key for the buckets, the tables and the log groups, and a web ACL, would each cost while idle in `dev`, in `prod` and in every branch's sandbox stack. The two logs would each add a destination, a policy and a lifecycle per environment, read by nobody. Out of proportion for what the project is, while nothing in its data or its traffic has asked for one.

**An excuse on each resource instead of the ignore file.** That is where an excuse about one resource goes. These hold for every bucket, table, log group and distribution the stacks will ever declare, so an inline excuse would be copied onto each and a new resource would fail until it carried the copy. The excuse is written where it is read (`docs/standards/terraform-detail.md`, "Why").

**"Held back" alone, with no record.** That is how they stood from 2026-11-02 until the review of PR-434: the item named Issue-157, and the checkup was told that a closed issue there was the record. A scale-down in these areas is found in `docs/decisions/`, with what it leaves exposed, which the item did not say.

## Where it is described

`terraform/.trivyignore` for the ids and the reason above each. `docs/standards/terraform-detail.md`, "Held back", for the standing list, and "Rule 17" for where an excuse goes. `docs/runbooks/checkup.md`, rule 5, for how the checkup reads a held-back item.
