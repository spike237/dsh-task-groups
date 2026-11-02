/** Cordis plugin name used by the profile bundle. */
export declare const name: 'task-groups'

/** Services the Host half needs. */
export declare const inject: readonly ['webServer']

/** Absolute path of the persisted state file (`$DSH_HOME/task-groups/state.json`). */
export declare function stateFile(): string

/** Register the `/dsh-task-groups` state route on a Cordis Host context. */
export declare function apply(ctx: {
  effect: (fn: () => unknown, label?: string) => unknown
  webServer: {
    register: (options: {
      kind: 'prefix'
      path: string
      handler: (req: unknown, res: unknown) => unknown
    }) => unknown
  }
}): void
