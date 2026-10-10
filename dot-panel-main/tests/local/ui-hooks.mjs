// SPDX-License-Identifier: AGPL-3.0-only
// Small deterministic hook runtime for the actual component, without a browser dependency.
const current = () => globalThis[Symbol.for('dot-panel.review-hooks')];
export function useState(initial) {
  const h=current(), i=h.index++;
  if (!(i in h.slots)) h.slots[i]={type:'state',value:typeof initial==='function'?initial():initial};
  return [h.slots[i].value, value=>{h.slots[i].value=typeof value==='function'?value(h.slots[i].value):value;}];
}
export function useRef(initial) {
  const h=current(),i=h.index++;
  if (!(i in h.slots)) h.slots[i]={type:'ref',value:{current:initial}};
  return h.slots[i].value;
}
export function useMemo(calculate) {current().index++;return calculate();}
export function useEffect(effect,deps) {
  const h=current(),i=h.index++,previous=h.slots[i];
  if (!previous || !deps || deps.some((dep,j)=>!Object.is(dep,previous.deps?.[j]))) {
    h.pending.push(()=>{previous?.cleanup?.();h.slots[i]={type:'effect',deps,cleanup:effect()};});
  }
}

export const useLayoutEffect=useEffect;
