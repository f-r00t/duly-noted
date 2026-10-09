variable "cluster_name" {
  description = "Name of the local kind cluster."
  type        = string
  default     = "duly-noted"
}

variable "app_host_port" {
  description = "Port on localhost where the application is reachable."
  type        = number
  default     = 8080
}

variable "app_node_port" {
  description = "NodePort of the application Service (must match k8s/service.yaml)."
  type        = number
  default     = 30080
}

variable "argocd_host_port" {
  description = "Port on localhost where the Argo CD UI is reachable."
  type        = number
  default     = 8443
}

variable "argocd_node_port" {
  description = "HTTPS NodePort of the Argo CD server Service."
  type        = number
  default     = 30443
}

variable "app_namespace" {
  description = "Namespace the application is deployed to (must match k8s/kustomization.yaml)."
  type        = string
  default     = "duly-noted"
}

variable "repo_url" {
  description = "Git repository Argo CD watches for manifests."
  type        = string
  default     = "https://github.com/f-r00t/duly-noted.git"
}

variable "repo_revision" {
  description = "Branch, tag or commit Argo CD tracks."
  type        = string
  default     = "main"
}

variable "argocd_chart_version" {
  description = "Version of the argo-cd Helm chart."
  type        = string
  default     = "10.10.1"
}

variable "argocd_apps_chart_version" {
  description = "Version of the argocd-apps Helm chart."
  type        = string
  default     = "2.0.6"
}
