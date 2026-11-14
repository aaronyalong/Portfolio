---
title: Autonomous Vehicle Cloud Platform
summary: Multi-tenant cloud platform for simulated autonomous vehicles, from CARLA telemetry to hazard alerts on a fleet dashboard.
stack: [Python, FastAPI, PostgreSQL, MongoDB, SQLAlchemy, Alembic, Docker Compose]
repo: https://github.com/aaronyalong/AV-Cloud-Platform
context: CMPE 281 team project
role: "Back-end lead: API, PostgreSQL/MongoDB data layer, alert workflow"
teamSize: 5
status: in-progress
order: 5
thumbnail:
  src: /screenshots/av-cloud-platform-dashboard.webp
  alt: "AV Cloud Platform fleet dashboard: a tenant's vehicle list with online status, and one vehicle's live speed chart, acknowledged pull-over commands and collision events."
  width: 1200
  height: 750
---

> **In progress.** The team's design is set. So far the multi-tenant data layer and the API
> skeleton are built, and they run locally. The edge agent, workers, alerts, dashboard and AWS
> deployment are planned. This page describes the design and the back-end work done so far.

## Problem

Fleets testing autonomous vehicles in simulation need to know when something goes wrong, such
as a collision or a hazard in the vehicle's sensor data. The platform streams
telemetry and sensor media from vehicles driven in the CARLA simulator to AWS. Workers detect
hazards with audio and vision models plus collision rules and raise alerts, which fleet staff
review and resolve on a web dashboard.

Several fleets share the platform, and each must see only its own vehicles, runs and alerts.
That requirement shapes the whole back end.

## Architecture

<picture>
	<source srcset="/diagrams/av-cloud-platform-architecture.dark.svg" media="(prefers-color-scheme: dark)" />
	<img
		src="/diagrams/av-cloud-platform-architecture.light.svg"
		alt="On the SJSU HPC, the CARLA simulator feeds an edge agent with a SQLite buffer. The edge agent sends telemetry over MQTT to AWS IoT Core, then SQS, then workers that validate messages, detect hazards and raise alerts; it uploads media to S3 through presigned URLs. Workers write to S3, PostgreSQL (row-level security per tenant) and DocumentDB/MongoDB (telemetry, events). A React dashboard with Cognito sign-in calls a FastAPI service over HTTPS, which reads PostgreSQL and MongoDB. Built so far, running locally: PostgreSQL, MongoDB and the FastAPI service with health checks. Everything else is planned."
		width="787"
		height="827"
	/>
</picture>

The team splits the system by area:

- **Edge** (Jose Quinteros): an agent next to CARLA captures camera, LiDAR, collision and
  telemetry data, and buffers it in SQLite so nothing is lost while the uplink is down.
- **Cloud infrastructure** (Pradeep Vuyyuru, cloud lead): the AWS infrastructure, in Terraform.
- **AI and dashboard** (Ralph Tchaya): hazard detection and the React dashboard.
- **Back end** (Aaron): the FastAPI service, the shared data-access package with its migrations
  and indexes, and the queue workers that raise alerts (shared with Ralph).

Storage is split by shape. PostgreSQL holds tenants, users, vehicles, runs, model versions and
alerts.
DocumentDB (MongoDB locally) holds telemetry, detections and run evidence. S3 holds media, served
through short-lived presigned URLs.

## Key decisions

These cover the back end built so far.

### Tenant isolation in the database, not only in queries

Every PostgreSQL table with a `tenant_id` column has row-level security enabled and forced, with
a policy that matches rows to the tenant set on the current transaction. The API connects as an
application role that is neither a superuser nor allowed to bypass row-level security, because
superusers skip it. With no tenant set, the role sees nothing. A forgotten `WHERE tenant_id = …`
returns the caller's own rows, never another fleet's.

### Set the tenant per transaction

A helper opens a transaction and sets the tenant with a transaction-local setting, so it ends
with the transaction. A pooled connection can't carry one request's tenant into the next
request, even when the first one fails partway.

### Composite foreign keys, because foreign key checks skip row-level security

A device or command row references its vehicle by `(tenant_id, vehicle_id)`, not by vehicle ID
alone. Without that, a row could point at another tenant's vehicle, and row-level security
wouldn't stop it.

### Least privilege for the application

The application role can read tenants but not create them, and can insert and update vehicles,
devices and commands but can't delete them. Migrations run as a separate owner role, and forcing
row-level security applies the policies to the owner too.

### MongoDB: every index starts with the tenant

MongoDB has no row-level security, so every query index starts with `tenant_id` and every query
filters on it. Telemetry is stored in one bucket per tenant, run, vehicle and minute, with a
unique key. Events use `tenant_id:msg_id` as their ID, so a duplicate message fails on insert
rather than being stored twice. Documents expire individually, and only features DocumentDB
supports are used.

### Health checks that don't cascade

`/health` never touches a database, so a database outage doesn't make the load balancer replace
every API task. `/health/ready` checks both databases with a 2-second limit and returns 503 if
either fails. Details are logged, never returned.

## Results

There are no end-to-end results yet. What exists is a data layer with tests that run against
real PostgreSQL and MongoDB databases rather than mocks. The tests check that:

- **Reads are isolated.** A tenant sees only its own rows in every table, can't see another
  tenant's row even by its exact key, and sees nothing when no tenant is set.
- **Writes are isolated.** A tenant can't insert rows for another tenant, move a row to another
  tenant or update another tenant's rows, the application can't delete, and the composite keys
  block links to another tenant's vehicle.
- **Pooled connections don't leak.** The tenant doesn't carry over to the next user of a
  connection, even after an error, and 20 interleaved transactions sharing 2 connections each
  see only their own tenant.
- **New tables can't skip the rules.** A test fails if any table with a `tenant_id` column lacks
  a forced row-level security policy, and a positive control confirms the superuser sees every
  seeded row, so an empty result means blocked, not missing.
- **MongoDB and health checks behave.** Every query index starts with `tenant_id`, creating
  indexes twice is safe, duplicate telemetry buckets are rejected, and readiness reports failure
  when either database is down.

## Limitations

- **Most of the system isn't built yet:** the edge agent, workers, hazard detection, alerts, the
  dashboard, sign-in and the AWS infrastructure. Everything runs locally; AWS waits on
  permissions and budget.
- **The API serves only health checks** so far. No endpoints for vehicles, runs or alerts yet.
- **The schema is partial.** PostgreSQL has tenants, vehicles, IoT devices and vehicle commands;
  tables for users, runs, model versions and alerts are still to come.
- **DocumentDB compatibility is by design, not yet tested.** Indexes stick to features DocumentDB
  supports, but they've only run on MongoDB.

## Links

- [Repository](https://github.com/aaronyalong/AV-Cloud-Platform)
