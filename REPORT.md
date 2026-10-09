# DevOps pipeline for a todo web application with GitOps deployment

Harry Eriksson (guerikss@kth.se) and Villiam Riegler (villiamr@kth.se)
DD2482 DevOps, project report, October 2026

## Introduction

Duly Noted is a small todo web application. It is built on an
[Express](https://expressjs.com/) backend with a static frontend and stores
its todo items in [PostgreSQL](https://www.postgresql.org/). The application
is kept small on purpose because the focus of the project is the DevOps
pipeline around it.

The application runs in a local Kubernetes cluster created with
[kind](https://kind.sigs.k8s.io/). [Terraform](https://developer.hashicorp.com/terraform)
creates the cluster and installs [Argo CD](https://argo-cd.readthedocs.io/)
with a single command. CI runs on [GitHub Actions](https://docs.github.com/en/actions),
which tests and builds the application and publishes the image to
[GitHub Container Registry](https://docs.github.com/en/packages). Deployment
is pull-based, so a CI job only updates the image reference in the Kubernetes
manifests and Argo CD then picks up the change and rolls it out.

## Architecture

### 1. Application

The application is deployed as two replicas of a stateless Express server
behind a Kubernetes Service. PostgreSQL runs as a separate single-replica
StatefulSet with a persistent volume and its own headless Service, and a
NetworkPolicy only lets the application and the migration Job connect to it.
Schema changes are SQL files that a Kubernetes Job applies before each new
version of the application starts. The figure below is Argo CD's view of these
resources in the cluster.

![The application's resources as seen in Argo CD](docs/argocd-resources.png)

### 2. Deployment

Deployment is pull-based and follows the GitOps model. The Kubernetes
manifests live in the repository under `k8s/`, and Argo CD, which runs inside
the cluster, continuously compares them with what is running and applies any
difference. A release is therefore a commit that changes the image tag in the
manifests, and a rollback is a revert of that commit. Argo CD applies the
manifests in waves so that the database is ready before the migration Job
runs and the Job has succeeded before the application is updated. The
application itself is rolled out one Pod at a time, so it stays available
during a release.

```mermaid
flowchart LR
    Git["main branch<br>k8s/ manifests"] -->|polls| Argo["Argo CD"]
    Argo -->|sync| W2
    subgraph Cluster["Kubernetes cluster"]
        direction LR
        subgraph W2["Wave -2"]
            PG["PostgreSQL StatefulSet"]
            NP["NetworkPolicy"]
        end
        subgraph W1["Wave -1"]
            Job["Migration Job"]
        end
        subgraph W0["Wave 0"]
            App["Application Deployment<br>rolling update"]
        end
        W2 --> W1 --> W0
    end
```

### 3. Continuous integration

Every pull request runs four checks in GitHub Actions. The test suite runs
against both the in-memory store and a real PostgreSQL service container, the
container image is built, the Kubernetes manifests are rendered with
[kustomize](https://kustomize.io/), and the Terraform configuration is
formatted and validated. When a pull request is merged, a release workflow
runs the same checks again, builds the image, pushes it to GHCR tagged with
the commit hash, and commits the new tag to the manifests, where Argo CD picks
it up.

```mermaid
flowchart LR
    PR["Pull request"] --> CI
    subgraph CI["CI workflow"]
        direction TB
        T["Test<br>in-memory and PostgreSQL"]
        B["Build image"]
        M["Validate manifests"]
        V["Validate Terraform"]
    end
    CI --> Merge["Merge to main"]
    Merge --> Rel
    subgraph Rel["Release workflow"]
        direction LR
        R1["Run CI again"] --> R2["Build and push image<br>to GHCR, tagged sha-commit"] --> R3["Commit new tag to<br>k8s/kustomization.yaml"]
    end
```

### 4. Infrastructure

The whole environment is described in Terraform. A single `terraform apply`
creates a kind cluster, the application namespace, a Secret with a generated
database password, Argo CD installed from its [Helm](https://helm.sh/) chart,
and the Argo CD Application that points at the manifests in the repository.
The same command on an empty machine gives a working environment in a couple
of minutes, and `terraform destroy` removes it again. No secret is stored in
the repository because the password is generated at apply time and the
manifests only reference it by name.
