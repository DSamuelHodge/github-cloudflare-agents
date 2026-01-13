export enum PluginCapability {
  READ_REPO = 'read:repo',
  WRITE_REPO = 'write:repo',
  RUN_TESTS = 'run:tests',
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  METRICS = 'metrics',
}

export interface PluginManifest {
  name: string;
  version: string; // semver
  description?: string;
  author?: string;
  capabilities: PluginCapability[];
  entrypoint: string; // path within package
  checksum?: string; // optional integrity checksum
}
