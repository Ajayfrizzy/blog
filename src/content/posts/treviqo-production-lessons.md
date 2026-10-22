---
title: "Beyond Deployment: 3 Production Lessons I Learned Building Treviqo on RumptyCloud"
description: "Lessons from debugging storage permissions, Prisma transactions, and database connectivity while deploying Treviqo."
publishedDate: 2026-10-22
author: "Your publishing name"
authorType: "Person"
cover: "public/images/treviqo-production-lessons.png"
coverWidth: 1200
coverHeight: 630
coverAlt: "Treviqo production engineering lessons"
tags:
  - "Deployment"
draft: false
---


# What Building and Deploying Treviqo on RumptyCloud Taught Me About Production Reliability

*Lessons from debugging object storage permissions, background job failures, and database connectivity in a real deployment.*

Building an application is one thing. Getting it to work reliably in production is another.

During the Devcenter Hacktober 2026 hackathon, I built [Treviqo](https://treviqo.rumptycloud.app), an employee-focused application that helps workers preserve employment records, review job-exit information, track settlement and pension evidence, and manage outstanding reminders.

Treviqo uses Next.js, PostgreSQL, Prisma, Redis, S3-compatible object storage, and AI services, all deployed through RumptyCloud.

What made this experience particularly valuable wasn't just seeing the application go live. It was working through production issues that didn't always behave the way I initially expected.

Three experiences changed how I approach deployment and debugging.

## 1. Successful Uploads Don't Mean Your Storage Permissions Are Complete

One of the earliest problems involved document deletion.

Treviqo allows users to upload private employment documents, retrieve them securely, and delete documents they no longer need.

Initially, document uploads worked. Retrieval worked too. But deletion consistently returned:

```text
403 AccessDenied
```

At first, the problem could have been anywhere: application logic, the AWS SDK configuration, request signing, storage permissions, or a provider-level restriction.

Instead of assuming the frontend or API route was responsible, we isolated the storage operation.

Using disposable test objects, we verified that:

- Uploading an object succeeded.
- Retrieving and checking the object succeeded.
- Deleting the same object returned `403 AccessDenied`.
- A missing object could be distinguished from an authorization failure.

That last point was particularly important.

An authorization error doesn't mean an object has been deleted or doesn't exist. Treating a `403` response as successful deletion could cause an application to remove its database records while the underlying private file remains stored.

For a product handling employment documents, that would be an unacceptable assumption.

After discussing the issue with Ola from RumptyCloud support, the platform introduced more granular access-key capabilities, including READ, WRITE, LIST, and DELETE permissions.

With the appropriate storage credentials configured, I later tested direct document deletion successfully on two documents.

**What I learned:** Test every storage operation your application requires. PUT and GET success do not establish DELETE permissions, and deletion should be independently verified before application metadata is finalized.

## 2. A Background Worker Can Be Running but Still Fail Its Jobs

Treviqo also uses a separate background worker to manage reminders, cleanup tasks, and other scheduled operations.

The worker initially became unhealthy even though the main web application could still respond to requests.

The logs included:

```text
worker_job_failed job=reminders
worker_health_failed reason=job_retries
```

Working with support helped identify the underlying issue.

The reminders job was processing an increasingly large backlog inside a single Prisma database transaction. As that workload grew, it exceeded Prisma's configured transaction timeout.

The repeated failures also interacted badly with deployment health checks and the worker's retry schedule.

This taught me that there are two different questions a health check might answer:

1. Is the process alive and able to reach its required dependencies?
2. Did every scheduled job complete successfully?

Those questions are related, but they are not equivalent.

A background job can fail temporarily without meaning the entire worker process needs to be replaced.

We revised the implementation so reminder processing could use smaller, resumable transaction batches. We also separated basic deployment availability from stricter job-reliability diagnostics.

This meant scheduled job retries would no longer automatically be interpreted as proof that the deployment itself was unhealthy.

Later production checks showed the worker health endpoint returning OK, while the application continued responding to employment-record changes.

**What I learned:** Background jobs should be designed for bounded work, retries, and resumability. Health checks should distinguish process availability from task-level failures.

A green health check also shouldn't be presented as proof that every queued task has completed.

## 3. The Most Complicated Error Can Have a Simple Explanation

Perhaps the most memorable problem came from PostgreSQL connectivity.

At one point, Treviqo's web application was running, but readiness checks were failing and users couldn't sign in.

The logs showed:

```text
runtime_failed operation=readiness_database category=database_initialization
readiness_failed database,worker
```

We investigated Prisma initialization, possible database endpoint differences, networking, TLS compatibility, and connection configuration.

Those were reasonable possibilities, but none had been established as the actual cause.

Eventually, I discovered that the problem was much simpler.

I had removed the internal PostgreSQL connection URL while changing configurations, but I hadn't added the public database URL back into the application's environment variables.

The expected `DATABASE_URL` configuration was missing.

Once I corrected the environment configuration, the web application's readiness endpoint returned `ready`, and its health endpoint returned `ok`.

This was a particularly useful reminder about debugging assumptions.

A detailed runtime error doesn't necessarily mean the root cause is complicated.

In this case, extensive investigation could not replace one fundamental verification: was the correct database configuration actually present in the deployed environment?

**What I learned:** Verify deployment configuration before pursuing more complex explanations. Check whether required environment variables are present, whether the active deployment has received them, and whether the application is connecting to the intended service.

Do this without exposing connection strings, credentials, or other secrets in logs.

## 4. Good Diagnostics Should Help Without Leaking Sensitive Information

Another improvement during this process was how we handled application diagnostics.

Initially, some Prisma failures were classified only as `unknown`, which made it difficult to narrow down what was happening.

We improved the error classification so logs could distinguish categories such as database initialization, transaction failures, and closed connections.

However, we deliberately avoided logging raw database URLs, passwords, connection strings, or complete exception details.

For applications managing private user documents, diagnostic quality and information security need to work together.

A useful production log should answer questions like:

- Which operation failed?
- What category of failure occurred?
- When did it happen?
- Is the problem recurring?

It shouldn't reveal private credentials merely to make debugging easier.

## 5. Deployment Is a Process, Not a Single Successful Build

One major misconception this experience corrected for me is that successful builds and deployments automatically mean an application is production-ready.

They don't.

A deployed application still needs its dependencies, permissions, background jobs, and user-facing workflows to behave correctly.

For Treviqo, useful checks included:

- Web process health and application readiness.
- Separate worker availability.
- Document upload, retrieval, and deletion.
- Employment-record changes affecting reminders.
- Safe handling of database and storage failures.

It also became important to distinguish historical failures from failures happening in the latest deployment.

Old logs are useful engineering evidence, but their timestamps and deployment context matter.

## Final Thoughts

Deploying Treviqo on RumptyCloud gave me hands-on experience with problems that are easy to overlook during local development.

I learned to test storage permissions operation by operation, design background jobs around transaction limits, distinguish deployment health from task completion, verify environment configuration early, and avoid guessing from incomplete error messages.

I also learned the value of asking for help with specific evidence.

Ola from the RumptyCloud team was helpful throughout the investigation, particularly with understanding the worker transaction failures and storage authorization requirements.

The experience reinforced something important for me as a developer:

**Getting an application online is the beginning of production engineering, not the end of it.**

And sometimes the most useful lesson comes from discovering that the problem you spent hours investigating was a missing environment variable.

---

*Project: [Treviqo](https://treviqo.rumptycloud.app) — built for Devcenter Hacktober 2026 × RumptyCloud.*

*Source code: [github.com/Ajayfrizzy/treviqo](https://github.com/Ajayfrizzy/treviqo)*
