# duly-noted
A life changing todo list app

A small todo web application with a complete DevOps pipeline around it. Users
can create, complete and delete todo items, which are persisted in a PostgreSQL
database that runs alongside the application in the cluster.

## Overview

```
 pull request ──► CI (tests, image build, manifest + Terraform validation)
       │
     merge to main
       │
       ▼
 Release workflow ──► image pushed to ghcr.io/f-r00t/duly-noted:sha-<commit>
       │
       ▼
 commit to k8s/kustomization.yaml (new image tag)
       │
       ▼
 Argo CD (in the kind cluster) sees the change and rolls out the new image
```

| Practice | Implementation | Where |
| --- | --- | --- |
| CI | GitHub Actions runs the tests on every pull request | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| CD | Image pushed to GHCR, tag updated in the manifests, deployed by Argo CD | [.github/workflows/release.yml](.github/workflows/release.yml), [k8s/](k8s) |
| IaC | Terraform creates a kind cluster and installs Argo CD | [terraform/](terraform) |
| Security automation | Dependabot for npm, Docker, GitHub Actions and Terraform | [.github/dependabot.yml](.github/dependabot.yml) |
| Development platform | GitHub with branch protection on `main` | see [Branch protection](#branch-protection) |

## Repository layout

```
app/         Node.js (Express) application, static frontend and tests
Dockerfile   Container image for the application
k8s/         Kubernetes manifests (Kustomize), watched by Argo CD
terraform/   kind cluster, Argo CD and the Argo CD Application
.github/     CI and release workflows, Dependabot configuration
```

## Running the application locally

```bash
cd app
npm install
npm start        # http://localhost:3000
```

Without a database the app uses an in-memory store. To use PostgreSQL, set the
standard `PGHOST`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` environment variables.

```bash
npm test         # also runs the suite against PostgreSQL when PGHOST is set
```

### API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/todos` | List todos |
| `POST` | `/api/todos` | Create a todo: `{"title": "..."}` |
| `PATCH` | `/api/todos/:id` | Complete or reopen a todo: `{"completed": true}` |
| `DELETE` | `/api/todos/:id` | Delete a todo |
| `GET` | `/healthz`, `/readyz` | Liveness and readiness (database) probes |

## Creating the environment

Requirements: [Docker](https://docs.docker.com/get-docker/),
[Terraform](https://developer.hashicorp.com/terraform/install) and `kubectl`.
The kind provider creates the cluster itself, so the `kind` CLI is optional.

```bash
cd terraform
terraform init
terraform apply
```

This single command:

1. creates a local Kubernetes cluster with kind,
2. creates the `duly-noted` namespace and a Secret with generated database credentials,
3. installs Argo CD with Helm,
4. registers the `duly-noted` Argo CD Application, which points at `k8s/` on `main`.

Argo CD then deploys the application, which becomes available at
<http://localhost:8080>.

The Argo CD UI is at <https://localhost:8443> (self-signed certificate). Log in
as `admin` with the password from:

```bash
terraform output -raw argocd_admin_password
```

The UI shows the `duly-noted` Application, its sync status and the history of
rollouts with the git commit and image tag of each one.

**Tear everything down with `terraform destroy`.**

## Deployment flow

Every merge to `main` that touches the application runs the release workflow:

1. **ci** runs the same checks as a pull request.
2. **publish** builds the image and pushes it to GHCR as `sha-<short commit>` and `latest`.
3. **deploy** writes the new tag to `newTag` in [k8s/kustomization.yaml](k8s/kustomization.yaml) and commits it.

Argo CD polls the repository (every three minutes by default), notices the
commit and syncs the cluster. Nothing outside the cluster needs access to it:
the repository is the single source of truth and a rollback is a `git revert`.

PostgreSQL runs as its own StatefulSet behind a headless Service, and Argo CD
syncs it before the application. A NetworkPolicy only lets the application
Pods connect to it. The application itself is stateless and runs two
replicas with a rolling update.

## Reaching the database

The database has no route from outside the cluster. To look at the data, open
`psql` inside the Pod:

```bash
kubectl -n duly-noted exec -it postgres-0 -- psql -U todos todos
```

To use a local client instead, forward the port through the Kubernetes API,
which authenticates with your kubeconfig instead of exposing the database on
the network:

```bash
kubectl -n duly-noted port-forward svc/postgres 15432:5432
kubectl -n duly-noted get secret postgres-credentials -o jsonpath='{.data.password}' | base64 -d
psql -h localhost -p 15432 -U todos todos
```

## One-time GitHub setup

### Container image visibility

The cluster pulls the image anonymously, so the `duly-noted` package on GHCR
must be public (Package settings → Change visibility) after the first release.

### Branch protection

Protect `main` (Settings → Rules → Rulesets) with:

- require a pull request before merging,
- require the status checks `Test`, `Build image`, `Validate manifests` and `Validate Terraform`.

The deploy job pushes its tag-bump commit directly to `main`, which the
protection would reject for the default `GITHUB_TOKEN`. Give it a way through:

1. `ssh-keygen -t ed25519 -f deploy_key -N ""`
2. add `deploy_key.pub` as a deploy key with write access (Settings → Deploy keys),
3. add the contents of `deploy_key` as the Actions secret `DEPLOY_KEY`,
4. add "Deploy keys" to the bypass list of the ruleset.

## License

[GPL-3.0](LICENSE)
