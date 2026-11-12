/**
 * Interactive mind map — tree visualization with collapsible nodes.
 * Supports expand/collapse all, per-node toggle, and level-based styling.
 */
import { useState, useMemo } from 'react';

export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export function InteractiveMindMap({
  nodes,
  title,
}: {
  nodes: MindMapNode[];
  title: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allIds = useMemo(() => {
    const ids = new Set<string>();
    const collect = (n: MindMapNode[]) => {
      for (const node of n) {
        ids.add(node.id);
        if (node.children?.length) collect(node.children);
      }
    };
    collect(nodes);
    return ids;
  }, [nodes]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(allIds));

  const totalNodes = allIds.size;
  const visibleNodes = useMemo(() => {
    let count = 0;
    const countVisible = (n: MindMapNode[]) => {
      for (const node of n) {
        if (!collapsed.has(node.id)) count++;
        if (node.children?.length && !collapsed.has(node.id)) countVisible(node.children);
      }
    };
    countVisible(nodes);
    return count;
  }, [nodes, collapsed]);

  return (
    <article>
      <div className="mindmap-header">
        <h2>{title}</h2>
        <div className="mindmap-controls">
          <span className="hint">{visibleNodes}/{totalNodes} nodes</span>
          <button className="btn small" onClick={expandAll}>Expand all</button>
          <button className="btn small" onClick={collapseAll}>Collapse all</button>
        </div>
      </div>
      <div className="mindmap-tree">
        {nodes.map((node) => (
          <MindMapNodeView
            key={node.id}
            node={node}
            level={0}
            collapsed={collapsed}
            onToggle={toggle}
          />
        ))}
      </div>
    </article>
  );
}

function MindMapNodeView({
  node,
  level,
  collapsed,
  onToggle,
}: {
  node: MindMapNode;
  level: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);

  return (
    <div className={`mindmap-node level-${level}`}>
      <div className="mindmap-node-row">
        {hasChildren ? (
          <button
            className={`mindmap-toggle ${isCollapsed ? 'collapsed' : ''}`}
            onClick={() => onToggle(node.id)}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="mindmap-toggle placeholder" />
        )}
        <span className="mindmap-node-label">{node.label}</span>
        {hasChildren && !isCollapsed && (
          <span className="mindmap-node-count">{node.children!.length}</span>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <div className="mindmap-children">
          {node.children!.map((child) => (
            <MindMapNodeView
              key={child.id}
              node={child}
              level={level + 1}
              collapsed={collapsed}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
