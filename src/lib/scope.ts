// Which entities a user may see. Pure, so it is tested without a database.

export type ScopeGrant = { entityId: string; includeDescendants: boolean };
export type EntityNode = { id: string; parentId: string | null };

/**
 * Expand grants over the entity tree. No grants means no entities, never all.
 * A grant reaches subsidiaries only when it says so: an auditor scoped to MLF alone does not see Lunic.
 */
export function reachableEntityIds(grants: readonly ScopeGrant[], tree: readonly EntityNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const e of tree) {
    if (!e.parentId) continue;
    children.set(e.parentId, [...(children.get(e.parentId) ?? []), e.id]);
  }
  const reach = new Set<string>();
  for (const g of grants) {
    reach.add(g.entityId);
    if (!g.includeDescendants) continue;
    const stack = [g.entityId];
    while (stack.length) {
      for (const child of children.get(stack.pop()!) ?? []) {
        if (reach.has(child)) continue;
        reach.add(child);
        stack.push(child);
      }
    }
  }
  return [...reach];
}

/** Segregation of duties: whoever prepared a record cannot approve it. */
export function canApprove(preparedById: string | null | undefined, approverId: string): boolean {
  return !!preparedById && preparedById !== approverId;
}
