import { Fragment, type ReactNode } from "react";

/**
 * Like fill(), but placeholders can be replaced with elements (links, chips),
 * so a translated sentence keeps its word order in both languages.
 */
export function fillNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    if (key && key in values) return <Fragment key={i}>{values[key]}</Fragment>;
    return part ? <Fragment key={i}>{part}</Fragment> : null;
  });
}
