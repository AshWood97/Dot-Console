// SPDX-License-Identifier: AGPL-3.0-only
export const registry = [
  {id:'dramaflow-a',name:'DramaFlow A',repo:'zihan/DramaFlow-old26_0922',known:true,aliases:['A版审核','DramaFlow A']},
  {id:'cutscene-daily',name:'行业日报',repo:'zihan/CutsceneDaily',known:true,aliases:['CutsceneDaily','行业日报','行业日报/CutsceneDaily']},
  {id:'dot-console',name:'Dot Console',known:true,aliases:['Dot Panel','Dot Console']},
  {id:'dramaflow-b',name:'DramaFlow B',repo:'zihan/DramaFlow-APIGC',known:true,aliases:['DramaFlow B']},
];

export function normalizeProject(name) {
  const project=registry.find(entry=>entry.aliases.includes(name));
  if(!project)return {id:`legacy:${name}`,name,known:false};
  return {id:project.id,name:project.name,repo:project.repo,known:project.known};
}
