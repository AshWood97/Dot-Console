export type ProjectIdentity={id:string;name:string;repo?:string;known:boolean};
export const registry:ReadonlyArray<ProjectIdentity & {aliases:readonly string[]}>;
export function normalizeProject(name:string):ProjectIdentity;
